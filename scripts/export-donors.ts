/**
 * Monthly Donor Export Script
 * 
 * Exports all donations from Stripe to a CSV file
 * 
 * Usage:
 *   npm run export-donors
 * 
 * Or with date range:
 *   npm run export-donors -- --start 2025-01-01 --end 2025-01-31
 */

import Stripe from 'stripe';
import fs from 'fs';
import path from 'path';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-12-15.clover',
});

interface DonorExportRow {
  date: string;
  email: string;
  name: string;
  organization: string;
  amount: number;
  currency: string;
  type: string;
  isRecurring: boolean;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  paymentIntentId: string;
  subscriptionId: string;
}

async function exportDonors(startDate?: string, endDate?: string) {
  console.log('Starting donor export...');

  const start = startDate ? new Date(startDate).getTime() / 1000 : undefined;
  const end = endDate ? new Date(endDate).getTime() / 1000 : undefined;

  // Get all checkout sessions
  const sessions: Stripe.Checkout.Session[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const params: Stripe.Checkout.SessionListParams = {
      limit: 100,
      ...(start && { created: { gte: Math.floor(start) } }),
      ...(startingAfter && { starting_after: startingAfter }),
    };

    const response = await stripe.checkout.sessions.list(params);
    sessions.push(...response.data);

    if (end) {
      const filtered = sessions.filter(
        (s) => s.created && s.created <= Math.floor(end)
      );
      if (filtered.length < sessions.length) {
        hasMore = false;
        break;
      }
    }

    hasMore = response.has_more;
    if (hasMore && response.data.length > 0) {
      startingAfter = response.data[response.data.length - 1].id;
    }
  }

  // Filter by date range if provided
  let filteredSessions = sessions;
  if (start || end) {
    filteredSessions = sessions.filter((session) => {
      if (!session.created) return false;
      if (start && session.created < Math.floor(start)) return false;
      if (end && session.created > Math.floor(end)) return false;
      return true;
    });
  }

  console.log(`Found ${filteredSessions.length} checkout sessions`);

  // Fetch full session details and payment intents for address info
  const exportData: DonorExportRow[] = [];

  for (const session of filteredSessions) {
    try {
      // Get full session details
      const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['customer', 'payment_intent'],
      });

      // Get payment intent for billing details if available
      let billingAddress = null;
      if (fullSession.payment_intent) {
        const paymentIntentId = typeof fullSession.payment_intent === 'string'
          ? fullSession.payment_intent
          : fullSession.payment_intent.id;

        try {
          const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
            expand: ['charges.data.billing_details'],
          });

          // Access charges through the expanded data
          const charges = (paymentIntent as any).charges?.data;
          if (charges && charges.length > 0 && charges[0]?.billing_details?.address) {
            billingAddress = charges[0].billing_details.address;
          }
        } catch (error) {
          console.error(`Error retrieving payment intent ${paymentIntentId}:`, error);
        }
      }

      // Use customer details from session or billing details
      const address =
        fullSession.customer_details?.address || billingAddress || {};

      const row: DonorExportRow = {
        date: new Date(fullSession.created * 1000).toISOString().split('T')[0],
        email: fullSession.customer_email || fullSession.customer_details?.email || '',
        name: fullSession.customer_details?.name || fullSession.metadata?.donor_name || 'Anonymous',
        organization:
          fullSession.custom_fields?.find((f) => f.key === 'organization')?.text?.value || '',
        amount: fullSession.amount_total ? fullSession.amount_total / 100 : 0,
        currency: (fullSession.currency || 'usd').toUpperCase(),
        type: fullSession.metadata?.donation_type || (fullSession.mode === 'subscription' ? 'monthly' : 'one-time'),
        isRecurring: fullSession.mode === 'subscription',
        address: address.line1 || '',
        city: address.city || '',
        state: address.state || '',
        postalCode: address.postal_code || '',
        country: address.country || '',
        paymentIntentId: (fullSession.payment_intent as string) || '',
        subscriptionId: (fullSession.subscription as string) || '',
      };

      exportData.push(row);
    } catch (error) {
      console.error(`Error processing session ${session.id}:`, error);
    }
  }

  // Generate CSV
  const headers = [
    'Date',
    'Email',
    'Name',
    'Organization',
    'Amount',
    'Currency',
    'Type',
    'Is Recurring',
    'Address',
    'City',
    'State',
    'Postal Code',
    'Country',
    'Payment Intent ID',
    'Subscription ID',
  ];

  const csvRows = [
    headers.join(','),
    ...exportData.map((row) =>
      [
        row.date,
        `"${row.email}"`,
        `"${row.name}"`,
        `"${row.organization}"`,
        row.amount.toFixed(2),
        row.currency,
        row.type,
        row.isRecurring ? 'Yes' : 'No',
        `"${row.address}"`,
        `"${row.city}"`,
        `"${row.state}"`,
        `"${row.postalCode}"`,
        `"${row.country}"`,
        row.paymentIntentId,
        row.subscriptionId,
      ].join(',')
    ),
  ];

  const csv = csvRows.join('\n');

  // Save to file
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `donor-export-${timestamp}.csv`;
  const filepath = path.join(process.cwd(), 'exports', filename);

  // Create exports directory if it doesn't exist
  const exportsDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true });
  }

  fs.writeFileSync(filepath, csv, 'utf-8');

  console.log(`\n✅ Export complete!`);
  console.log(`📁 File saved to: ${filepath}`);
  console.log(`📊 Total donations: ${exportData.length}`);
  console.log(`💰 Total amount: $${exportData.reduce((sum, row) => sum + row.amount, 0).toFixed(2)}`);

  return filepath;
}

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const startIndex = args.indexOf('--start');
  const endIndex = args.indexOf('--end');

  const startDate = startIndex >= 0 ? args[startIndex + 1] : undefined;
  const endDate = endIndex >= 0 ? args[endIndex + 1] : undefined;

  exportDonors(startDate, endDate)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Export failed:', error);
      process.exit(1);
    });
}

export { exportDonors };
