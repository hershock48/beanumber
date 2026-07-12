/**
 * One-off backfill: create Holder sponsorships for every shirt buyer
 * whose fulfillment row exists in Postgres but who has no matching
 * sponsorship row (i.e. can't sign in via the email-only magic link).
 *
 * Why this exists
 * ───────────────
 * Before the Airtable → Postgres webhook cutover on 2026-06-22, the
 * Stripe webhook wrote sponsorships to Airtable only. Every shirt
 * buyer from Apr 2025 through Jun 22 2026 has a fulfillment row (the
 * shirt shipped, or is queued in the stockpile) but no sponsorship
 * row in Postgres. When they hit /signin and enter their email,
 * `getMostRecentSponsorshipForEmail` returns null and no magic link
 * gets sent — silent failure, and every one of them is locked out.
 *
 * This script creates a Holder sponsorship for every such buyer,
 * linked to the kid whose shirt they got when the order_number is
 * assigned, and as a childless placeholder when it isn't yet (the
 * shirt hasn't been reconciled from the stockpile). After running,
 * every past buyer can sign in via email-only in one step.
 *
 * The Stripe webhook post-cutover already writes sponsorships
 * correctly, so this only needs to run once. Left in scripts/ so
 * the pattern is documented.
 *
 * Usage
 * ─────
 *   tsx scripts/backfill-orphaned-buyers.ts              # dry-run
 *   tsx scripts/backfill-orphaned-buyers.ts --apply      # write
 *   tsx scripts/backfill-orphaned-buyers.ts --apply --email=someone@example.com
 *     └─ apply, but only for one buyer email (useful for spot repair)
 *
 * Runs against DATABASE_URL from .env.local by default. Safe to
 * re-run — the materialize helper is idempotent (skips fulfillments
 * whose kid already has a matching sponsorship for this email, and
 * only writes one childless-holder placeholder per email).
 */

import 'dotenv/config';
import { sql as dsql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { fulfillments, sponsorships } from '@/lib/db/schema';
import { materializeHolderSponsorshipsForBuyer } from '@/lib/db/mutations';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const emailArg = args.find(a => a.startsWith('--email='))?.slice('--email='.length);

async function main() {
  // Fetch every distinct buyer_email in fulfillments that has no
  // sponsorship row at all (case-insensitive email match). This is
  // the exact set the fix targets. Rank by earliest order date so
  // the older orphans get materialized first (deterministic log).
  const rows = await db
    .select({
      buyerEmail: fulfillments.buyerEmail,
      shirts: dsql<number>`count(*)`.as('shirts'),
      withNumber:
        dsql<number>`count(${fulfillments.orderNumber})`.as('with_number'),
      firstOrder: dsql<Date | null>`min(${fulfillments.orderDate})`.as(
        'first_order'
      ),
    })
    .from(fulfillments)
    .where(
      dsql`
        ${fulfillments.buyerEmail} IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM ${sponsorships} s
          WHERE lower(s.sponsor_email) = lower(${fulfillments.buyerEmail})
        )
      `
    )
    .groupBy(fulfillments.buyerEmail)
    .orderBy(dsql`min(${fulfillments.orderDate}) NULLS LAST`);

  // Filter to a single email if --email was supplied.
  const targets = emailArg
    ? rows.filter(r => (r.buyerEmail || '').toLowerCase() === emailArg.toLowerCase())
    : rows;

  if (targets.length === 0) {
    console.log(
      emailArg
        ? `No orphaned fulfillment for ${emailArg}. Either they already have a sponsorship or no fulfillment exists for that email.`
        : 'No orphaned buyers found. Nothing to backfill.'
    );
    return;
  }

  const totalShirts = targets.reduce((s, r) => s + Number(r.shirts), 0);
  const totalNumbered = targets.reduce(
    (s, r) => s + Number(r.withNumber),
    0
  );

  console.log(
    `${APPLY ? 'APPLY' : 'DRY-RUN'}: ${targets.length} orphaned buyer${
      targets.length === 1 ? '' : 's'
    } (${totalShirts} shirt${totalShirts === 1 ? '' : 's'}, ${totalNumbered} with a Number stamped).`
  );
  console.log('─'.repeat(78));

  let totalCreated = 0;
  let totalChildful = 0;
  let totalChildless = 0;
  let totalSkipped = 0;
  let totalErrored = 0;

  for (const row of targets) {
    const email = (row.buyerEmail || '').trim();
    if (!email) continue;
    if (!APPLY) {
      console.log(
        `  [dry] ${email.padEnd(38)} shirts=${row.shirts} numbered=${row.withNumber}`
      );
      continue;
    }
    try {
      const result = await materializeHolderSponsorshipsForBuyer(email, {
        actorType: 'migration',
      });
      const childful = result.created.filter(c => !!c.childId).length;
      const childless = result.created.length - childful;
      totalCreated += result.created.length;
      totalChildful += childful;
      totalChildless += childless;
      totalSkipped += result.skippedExisting;
      totalErrored += result.skippedError;
      const summary = [
        `created=${result.created.length}`,
        childful > 0 ? `linked=${childful}` : null,
        childless > 0 ? `childless=${childless}` : null,
        result.skippedExisting > 0 ? `skipped=${result.skippedExisting}` : null,
        result.skippedError > 0 ? `errored=${result.skippedError}` : null,
      ]
        .filter(Boolean)
        .join(' ');
      console.log(
        `  [ok]  ${email.padEnd(38)} ${summary}` +
          (result.created.length > 0
            ? ` codes=${result.created.map(c => c.sponsorCode).join(',')}`
            : '')
      );
    } catch (err) {
      totalErrored += 1;
      console.error(`  [err] ${email}:`, err);
    }
  }

  console.log('─'.repeat(78));
  if (APPLY) {
    console.log(
      `Done. Created ${totalCreated} sponsorship${totalCreated === 1 ? '' : 's'} ` +
        `(${totalChildful} linked to a kid, ${totalChildless} childless placeholder${totalChildless === 1 ? '' : 's'}). ` +
        `Skipped ${totalSkipped} pre-existing. ${totalErrored} error${totalErrored === 1 ? '' : 's'}.`
    );
    if (totalChildless > 0) {
      console.log(
        `\nThe ${totalChildless} childless placeholder holder${totalChildless === 1 ? '' : 's'} will auto-link ` +
          `to a kid once the buyer's fulfillment gets an order_number stamped ` +
          `(during Kevin's stockpile reconciliation flow). Until then, they can ` +
          `sign in via email and land on /me.`
      );
    }
  } else {
    console.log('No writes performed. Re-run with --apply to backfill.');
  }
}

let exitCode = 0;
main()
  .catch(err => {
    console.error(err);
    exitCode = 1;
  })
  // Explicit process.exit is required because the pg client keeps the
  // connection pool open — otherwise the Node event loop would hang
  // after main() resolves. Route the code through a mutable so the
  // catch handler's failure state actually propagates.
  .finally(() => process.exit(exitCode));
