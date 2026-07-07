/**
 * Legacy sponsor free-shirt program.
 *
 * One-off ops script — runs the sequence for the 3 external sponsors who
 * sponsored a specific kid before the shirt-first model existed:
 *   1. Kevin Hershock Sr (khersh52@gmail.com)   → Ismail (#48)
 *   2. Karen S Myers    (ksmy1959@gmail.com)     → Angel (#36)
 *   3. Jason Freese     (jfreese1985@gmail.com)  → Konshens (#37)
 *
 * For each sponsor:
 *   - Ensure a single "Legacy Sponsor Free Shirt" 100% off coupon exists
 *     in Stripe (idempotent via `lookupKey`, `duration: 'once'`).
 *   - Create one Promotion Code on that coupon, bound to the sponsor's
 *     Stripe customer, `max_redemptions: 1`, expires 60 days out.
 *   - Send the personalized email with the code, the kid's first name,
 *     and their shirt number.
 *
 * At fulfillment, Kevin ships each sponsor a shirt printed with THEIR
 * sponsored kid's number so hold-to-meet on beanumber.org/{N} reveals
 * the same kid they've been sponsoring.
 *
 * Run once:
 *   npx tsx scripts/legacy-sponsor-free-shirt.ts
 *
 * Re-running is safe — the coupon lookup and promo-code custom `code`
 * fields dedupe. Emails will re-fire on repeated runs though (SendGrid
 * won't dedupe for us) so guard with the --dry-run flag first.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
import Stripe from 'stripe';
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import {
  sendLegacySponsorFreeShirtEmail,
  sendLegacyDonorFreeShirtEmail,
} from '../src/lib/email';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-12-15.clover' as Stripe.LatestApiVersion,
});

// The current newsletter to embed at the top of each combined email.
// Overridable via --newsletter-id=<uuid>; defaults to the July issue.
const NEWSLETTER_ID_ARG = process.argv
  .find(a => a.startsWith('--newsletter-id='))
  ?.split('=')[1];
const NEWSLETTER_ID =
  NEWSLETTER_ID_ARG || '9e57a1b3-694b-4140-b293-054ee7dd9704';

async function fetchNewsletterForEmbed(): Promise<{
  title: string;
  teaser: string;
  heroPhotoUrl?: string;
  newsUrl: string;
} | undefined> {
  // Read DATABASE_URL from .env.local — dotenv doesn't grab it in every path.
  const envRaw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  const dbUrl = envRaw
    .split('\n')
    .find(l => l.startsWith('DATABASE_URL='))
    ?.split('=')
    .slice(1)
    .join('=')
    .replace(/^"|"$/g, '');
  if (!dbUrl) return undefined;

  const sql = postgres(dbUrl, { prepare: false, max: 1 });
  try {
    const [row] = await sql`
      SELECT title, teaser, hero_photo_url
        FROM newsletters
       WHERE id = ${NEWSLETTER_ID}
    `;
    if (!row) return undefined;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';
    return {
      title: row.title || '',
      teaser: row.teaser || '',
      heroPhotoUrl: row.hero_photo_url || undefined,
      newsUrl: `${siteUrl}/news`,
    };
  } finally {
    await sql.end();
  }
}

const DRY_RUN = process.argv.includes('--dry-run');

// The 3 external sponsors + their Stripe customers + sponsored kid.
// Kevin's own account (kevin@beanumber.org) intentionally omitted.
//
// At fulfillment, Kevin picks a shirt whose number cycles to the sponsor's
// specific kid — the kid roster of ~50 real kids cycles through the 300-cap
// shirt-number space every ~53 shirts, so each kid lives at multiple shirt
// numbers. The canonical low-cycle numbers (Ismail #48, Angel #36, Konshens
// #37) are already claimed by other buyers, so Kevin grabs a higher-cycle
// shirt (mod 53 = same kid) from inventory. Hold-to-meet on the new number
// still reveals the sponsored kid — the shirt closes the loop on the
// pre-shirt-first sponsorship.
const SPONSORS = [
  {
    email: 'khersh52@gmail.com',
    name: 'Kevin Hershock Sr',
    firstName: 'Dad',
    stripeCustomerId: 'cus_UcZtfwSn5fP7wJ',
    kidFirstName: 'Ismail',
    codeSlug: 'KEVINSR',
  },
  {
    email: 'ksmy1959@gmail.com',
    name: 'Karen S Myers',
    firstName: 'Karen',
    stripeCustomerId: 'cus_Ufbh3tHOUBKtyN',
    kidFirstName: 'Angel',
    codeSlug: 'KAREN',
  },
  {
    email: 'jfreese1985@gmail.com',
    name: 'Jason Freese',
    firstName: 'Jason',
    stripeCustomerId: 'cus_UW2WXxCE0QPFd6',
    kidFirstName: 'Konshens',
    codeSlug: 'JASON',
  },
];

// Legacy Donorbox recurring donors. No Stripe customer ID (they give
// through Donorbox), so promotion codes can't be customer-bound. They're
// single-use with unpredictable random codes instead. No kid-to-shirt
// binding at fulfillment — they'll meet a random kid via hold-to-meet
// when the shirt arrives, which is how the shirt-first model works.
const LEGACY_DONORS = [
  { email: 'laundawheatley@gmail.com', name: 'launda Wheatley', codeSlug: 'WHEATLEY' },
  { email: 'lhetke1993@gmail.com', name: 'Luke Hetke', codeSlug: 'HETKE' },
  { email: 'josephjeffreys91@gmail.com', name: 'Joseph Jeffreys', codeSlug: 'JEFFREYS' },
  // Julia & Kenny are a couple — two shirts, one code.
  { email: 'juliaamting@gmail.com', name: 'Julia & Kenny Morgensai', codeSlug: 'MORGENSAI', maxRedemptions: 2 },
  { email: 'trueformchiropractic@gmail.com', name: 'Joseph Vear', codeSlug: 'VEAR' },
];

const COUPON_LOOKUP_KEY = 'legacy_sponsor_free_shirt_v1';

/** Ensure the Stripe coupon exists. Idempotent via search-by-name. */
async function ensureCoupon(): Promise<string> {
  // Stripe coupons don't support lookup keys directly, but we can search by
  // name via list + filter. For 3 recipients this is fine.
  const existing = await stripe.coupons.list({ limit: 100 });
  const match = existing.data.find(
    c => c.metadata?.lookup_key === COUPON_LOOKUP_KEY
  );
  if (match) {
    console.log(`  Coupon exists: ${match.id} (${match.name})`);
    return match.id;
  }

  if (DRY_RUN) {
    console.log('  [dry-run] Would create coupon: 100% off, once, shirt-scoped');
    return 'coup_dryrun';
  }

  const created = await stripe.coupons.create({
    name: 'Legacy Sponsor Free Shirt',
    percent_off: 100,
    duration: 'once',
    metadata: {
      lookup_key: COUPON_LOOKUP_KEY,
      purpose:
        'Free shirt for pre-shirt-first sponsors who committed to a specific kid via the old flow',
    },
  });
  console.log(`  Created coupon: ${created.id}`);
  return created.id;
}

/** Generate a short random alphanumeric suffix so codes aren't guessable. */
function randomSuffix(len = 6): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusable chars
  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

async function createPromotionCode(params: {
  couponId: string;
  stripeCustomerId?: string;
  codeSlug: string;
  program: string;
  maxRedemptions?: number;
}): Promise<string> {
  const code = `LEGACY-${params.codeSlug}-${randomSuffix()}`;
  const maxRedemptions = params.maxRedemptions ?? 1;

  if (DRY_RUN) {
    const binding = params.stripeCustomerId
      ? `bound to ${params.stripeCustomerId}`
      : `unbound (random-code, ${maxRedemptions === 1 ? 'single-use' : `${maxRedemptions} uses`})`;
    console.log(`  [dry-run] Would create promo code: ${code} ${binding}`);
    return code;
  }

  // Idempotence — search existing promo codes for a match. When bound to
  // a customer, we match by customer + coupon. When unbound, match by
  // metadata (program + slug) so we don't create duplicates on re-run.
  if (params.stripeCustomerId) {
    const existing = await stripe.promotionCodes.list({
      customer: params.stripeCustomerId,
      coupon: params.couponId,
      limit: 5,
    });
    if (existing.data.length > 0) {
      const first = existing.data[0];
      console.log(`  Promo code exists for ${params.codeSlug}: ${first.code}`);
      return first.code;
    }
  } else {
    // Unbound lookup — search all promo codes on this coupon, filter by
    // metadata. Stripe doesn't index metadata, so we page through. Fine
    // at this scale.
    const existing = await stripe.promotionCodes.list({
      coupon: params.couponId,
      limit: 100,
    });
    const match = existing.data.find(
      p =>
        p.metadata?.program === params.program &&
        p.metadata?.sponsor_slug === params.codeSlug
    );
    if (match) {
      console.log(`  Promo code exists for ${params.codeSlug}: ${match.code}`);
      return match.code;
    }
  }

  const expiresAt = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60; // 90 days
  const created = await stripe.promotionCodes.create({
    coupon: params.couponId,
    code,
    ...(params.stripeCustomerId ? { customer: params.stripeCustomerId } : {}),
    max_redemptions: maxRedemptions,
    expires_at: expiresAt,
    metadata: {
      program: params.program,
      sponsor_slug: params.codeSlug,
    },
  });
  console.log(`  Created promo code: ${created.code}`);
  return created.code;
}

async function main() {
  console.log(`\n=== Legacy Sponsor Free-Shirt Program ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`);

  console.log('Step 0: Load current newsletter to embed at top of each email');
  const newsletter = await fetchNewsletterForEmbed();
  if (newsletter) {
    console.log(`  Loaded: "${newsletter.title}" (${newsletter.teaser.slice(0, 60)}${newsletter.teaser.length > 60 ? '…' : ''})`);
    if (newsletter.heroPhotoUrl) console.log(`  Hero: ${newsletter.heroPhotoUrl.slice(0, 80)}…`);
  } else {
    console.log('  No newsletter loaded (either DB not reachable or ID missing). Emails will skip the newsletter block.');
  }

  console.log('\nStep 1: Ensure coupon');
  const couponId = await ensureCoupon();

  console.log('\nStep 2: Sponsors (pre-shirt-first cohort — customer-bound codes)\n');
  for (const r of SPONSORS) {
    console.log(`— ${r.name} <${r.email}>`);
    const code = await createPromotionCode({
      couponId,
      stripeCustomerId: r.stripeCustomerId,
      codeSlug: r.codeSlug,
      program: 'legacy_sponsor_free_shirt',
    });

    if (DRY_RUN) {
      console.log(`  [dry-run] Would email ${r.email} with code ${code} (sponsors ${r.kidFirstName})`);
    } else {
      const result = await sendLegacySponsorFreeShirtEmail({
        recipientEmail: r.email,
        recipientName: r.name,
        kidFirstName: r.kidFirstName,
        promoCode: code,
        newsletter,
      });
      if (result.success) {
        console.log(`  ✓ Sent to ${r.email}`);
      } else {
        console.error(`  ✗ Failed to send to ${r.email}: ${result.error}`);
      }
    }
    console.log();
  }

  console.log('\nStep 3: Legacy Donorbox donors (unbound codes)\n');
  for (const d of LEGACY_DONORS) {
    console.log(`— ${d.name} <${d.email}>`);
    const code = await createPromotionCode({
      couponId,
      codeSlug: d.codeSlug,
      program: 'legacy_donor_free_shirt',
      maxRedemptions: d.maxRedemptions,
    });

    if (DRY_RUN) {
      console.log(`  [dry-run] Would email ${d.email} with code ${code}`);
    } else {
      const result = await sendLegacyDonorFreeShirtEmail({
        recipientEmail: d.email,
        recipientName: d.name,
        promoCode: code,
        maxRedemptions: d.maxRedemptions,
        newsletter,
      });
      if (result.success) {
        console.log(`  ✓ Sent to ${d.email}`);
      } else {
        console.error(`  ✗ Failed to send to ${d.email}: ${result.error}`);
      }
    }
    console.log();
  }

  console.log('=== Sponsor fulfillment mapping ===\n');
  console.log('  Pick a higher-cycle shirt from inventory whose number mod 53');
  console.log('  lands on the target kid — that way hold-to-meet on the new');
  console.log('  shirt number still reveals the same kid they sponsor:\n');
  SPONSORS.forEach(r => {
    console.log(`  ${r.name.padEnd(24)} → ship a shirt for ${r.kidFirstName}`);
  });
  console.log('\n  (Legacy Donorbox donors have no existing sponsorship — any');
  console.log('  shirt works; hold-to-meet reveals whichever kid maps to it.)\n');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
