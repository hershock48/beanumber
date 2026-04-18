/**
 * GET /api/admin/email-preview
 *
 * Sends all 5 rewritten transactional email templates to Kevin for review.
 * Uses sample data. Not a production endpoint — delete after review.
 */

import { NextResponse } from 'next/server';
import {
  sendSponsorWelcomeEmail,
  sendDonationReceiptEmail,
  sendRecurringDonationThankYouEmail,
  sendUpdateNotificationEmail,
  sendUpdateRequestConfirmationEmail,
} from '@/lib/email';

const KEVIN = 'kevin@beanumber.org';

export async function GET() {
  const results: { template: string; success: boolean; error?: string }[] = [];

  // 1. Sponsor Welcome
  const r1 = await sendSponsorWelcomeEmail(
    KEVIN,
    'Kevin Hershock',
    'Grace',
    'BAN-0042'
  );
  results.push({ template: 'Sponsor Welcome', success: r1.success, error: r1.error });

  // 2. Donation Receipt (one-time)
  const r2 = await sendDonationReceiptEmail(
    KEVIN,
    'Kevin Hershock',
    5000,          // $50.00 in cents
    'one-time',
    'pi_3Qtest00000000000000',
    new Date().toISOString()
  );
  results.push({ template: 'Donation Receipt (one-time)', success: r2.success, error: r2.error });

  // 3. Donation Receipt (monthly)
  const r3 = await sendDonationReceiptEmail(
    KEVIN,
    'Kevin Hershock',
    2500,          // $25.00 in cents
    'monthly',
    'pi_3Qtest11111111111111',
    new Date().toISOString()
  );
  results.push({ template: 'Donation Receipt (monthly)', success: r3.success, error: r3.error });

  // 4. Recurring Donation Thank You
  const r4 = await sendRecurringDonationThankYouEmail(
    KEVIN,
    'Kevin Hershock',
    25.00,
    'usd'
  );
  results.push({ template: 'Recurring Donation Thank You', success: r4.success, error: r4.error });

  // 5. Update Notification
  const r5 = await sendUpdateNotificationEmail(
    KEVIN,
    'Kevin Hershock',
    'Grace',
    'End of Term 1 Report',
    'Grace finished her first term at the top of her class in Primary 4. New photos from the awards ceremony are attached.'
  );
  results.push({ template: 'Update Notification', success: r5.success, error: r5.error });

  // 6. Update Request Confirmation
  const r6 = await sendUpdateRequestConfirmationEmail(
    KEVIN,
    'Kevin Hershock',
    'Grace',
    'July 15, 2026'
  );
  results.push({ template: 'Update Request Confirmation', success: r6.success, error: r6.error });

  const allOk = results.every((r) => r.success);

  return NextResponse.json(
    {
      status: allOk ? 'all_sent' : 'some_failed',
      sent: results.filter((r) => r.success).length,
      total: results.length,
      results,
    },
    { status: allOk ? 200 : 207 }
  );
}
