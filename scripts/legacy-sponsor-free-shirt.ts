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
import { sendLegacySponsorFreeShirtEmail } from '../src/lib/email';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-12-15.clover' as Stripe.LatestApiVersion,
});

const DRY_RUN = process.argv.includes('--dry-run');

// The 3 external sponsors + their Stripe customers + sponsored kid.
// Kevin's own account (kevin@beanumber.org) intentionally omitted.
const RECIPIENTS = [
  {
    email: 'khersh52@gmail.com',
    name: 'Kevin Hershock Sr',
    firstName: 'Dad',
    stripeCustomerId: 'cus_UcZtfwSn5fP7wJ',
    kidFirstName: 'Ismail',
    kidShirtNumber: 48,
    codeSlug: 'KEVINSR',
  },
  {
    email: 'ksmy1959@gmail.com',
    name: 'Karen S Myers',
    firstName: 'Karen',
    stripeCustomerId: 'cus_Ufbh3tHOUBKtyN',
    kidFirstName: 'Angel',
    kidShirtNumber: 36,
    codeSlug: 'KAREN',
  },
  {
    email: 'jfreese1985@gmail.com',
    name: 'Jason Freese',
    firstName: 'Jason',
    stripeCustomerId: 'cus_UW2WXxCE0QPFd6',
    kidFirstName: 'Konshens',
    kidShirtNumber: 37,
    codeSlug: 'JASON',
  },
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
  stripeCustomerId: string;
  codeSlug: string;
}): Promise<string> {
  const code = `LEGACY-${params.codeSlug}-${randomSuffix()}`;

  if (DRY_RUN) {
    console.log(`  [dry-run] Would create promo code: ${code} bound to ${params.stripeCustomerId}`);
    return code;
  }

  // Check if a promotion code already exists for this customer+coupon so
  // re-runs don't create duplicates. Match by customer + coupon.
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

  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 24 * 60 * 60; // 60 days
  const created = await stripe.promotionCodes.create({
    coupon: params.couponId,
    code,
    customer: params.stripeCustomerId,
    max_redemptions: 1,
    expires_at: expiresAt,
    metadata: {
      program: 'legacy_sponsor_free_shirt',
      sponsor_slug: params.codeSlug,
    },
  });
  console.log(`  Created promo code: ${created.code}`);
  return created.code;
}

async function main() {
  console.log(`\n=== Legacy Sponsor Free-Shirt Program ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`);

  console.log('Step 1: Ensure coupon');
  const couponId = await ensureCoupon();

  console.log('\nStep 2: Create promotion codes + send emails\n');
  for (const r of RECIPIENTS) {
    console.log(`— ${r.name} <${r.email}>`);
    const code = await createPromotionCode({
      couponId,
      stripeCustomerId: r.stripeCustomerId,
      codeSlug: r.codeSlug,
    });

    if (DRY_RUN) {
      console.log(`  [dry-run] Would email ${r.email} with code ${code} for ${r.kidFirstName} #${r.kidShirtNumber}`);
    } else {
      const result = await sendLegacySponsorFreeShirtEmail({
        recipientEmail: r.email,
        recipientName: r.name,
        kidFirstName: r.kidFirstName,
        kidShirtNumber: r.kidShirtNumber,
        promoCode: code,
      });
      if (result.success) {
        console.log(`  ✓ Sent to ${r.email}`);
      } else {
        console.error(`  ✗ Failed to send to ${r.email}: ${result.error}`);
      }
    }
    console.log();
  }

  console.log('=== Fulfillment mapping (print for Kevin) ===\n');
  RECIPIENTS.forEach(r => {
    console.log(`  ${r.name.padEnd(24)} → ship a shirt with #${r.kidShirtNumber} (${r.kidFirstName})`);
  });
  console.log();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
