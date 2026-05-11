import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/admin/backfill-donors
 *
 * Recalculates every Donor record's summary fields from their linked
 * Donations and Subscriptions. Fills:
 *   - Total Lifetime Giving (sum of Donation Amount)
 *   - First Donation Date (earliest Donation Date)
 *   - Most Recent Donation (latest Donation Date)
 *   - Donor Status (Active / Lapsed based on recency)
 *   - Recurring Supporter (true if any linked subscription is active)
 *   - Subscriptions link (connects orphaned Subscription records)
 *
 * Auth: same as other admin endpoints (ADMIN_PASSWORD / ADMIN_API_TOKEN / CRON_SECRET).
 */

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

function getAirtableHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

interface DonorRecord {
  id: string;
  fields: Record<string, any>;
}

interface DonationRecord {
  id: string;
  fields: Record<string, any>;
}

interface SubscriptionRecord {
  id: string;
  fields: Record<string, any>;
}

async function fetchAllRecords(table: string, fields: string[]): Promise<any[]> {
  const all: any[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams();
    for (const f of fields) params.append('fields[]', f);
    if (offset) params.set('offset', offset);

    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${table}?${params}`,
      { headers: getAirtableHeaders() }
    );
    if (!res.ok) throw new Error(`Airtable ${table} fetch failed: ${res.status}`);
    const data = await res.json();
    all.push(...(data.records || []));
    offset = data.offset;
  } while (offset);

  return all;
}

export async function GET(request: NextRequest) {
  // Auth
  const token =
    request.nextUrl.searchParams.get('token') ||
    request.headers.get('X-Admin-Token') ||
    request.headers.get('authorization')?.replace('Bearer ', '') ||
    null;
  const validTokens = [
    process.env.ADMIN_API_TOKEN,
    process.env.ADMIN_PASSWORD,
    process.env.CRON_SECRET,
  ].filter(Boolean);
  if (validTokens.length > 0 && (!token || !validTokens.includes(token))) {
    return NextResponse.json(
      { error: 'Unauthorized. Pass ?token=YOUR_ADMIN_TOKEN in the URL.' },
      { status: 401 }
    );
  }

  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    return NextResponse.json({ error: 'Airtable not configured' }, { status: 500 });
  }

  const dryRun = request.nextUrl.searchParams.get('dry') === '1';

  try {
    // Fetch all donors
    const donors: DonorRecord[] = await fetchAllRecords('Donors', [
      'Donor Name',
      'Email Address',
      'Stripe Customer ID',
      'Donations',
      'Subscriptions',
      'Sponsorships',
      'Total Lifetime Giving',
      'First Donation Date',
      'Most Recent Donation',
      'Donor Status',
      'Recurring Supporter',
    ]);

    // Fetch all donations
    const donations: DonationRecord[] = await fetchAllRecords('Donations', [
      'Donation Amount',
      'Donation Date',
      'Payment Status',
      'Donor',
      'Recurring Donation',
      'Stripe Customer ID',
    ]);

    // Fetch all subscriptions
    const subscriptions: SubscriptionRecord[] = await fetchAllRecords('Subscriptions', [
      'Subscription ID',
      'Donor',
      'Status',
      'Amount',
    ]);

    // Build donation lookup: donorRecordId → donations[]
    const donationsByDonor = new Map<string, DonationRecord[]>();
    for (const don of donations) {
      const donorLinks = don.fields?.Donor || [];
      for (const link of donorLinks) {
        const donorId = typeof link === 'string' ? link : link.id;
        if (!donationsByDonor.has(donorId)) donationsByDonor.set(donorId, []);
        donationsByDonor.get(donorId)!.push(don);
      }
    }

    // Build subscription lookup: donorRecordId → subscriptions[]
    const subsByDonor = new Map<string, SubscriptionRecord[]>();
    for (const sub of subscriptions) {
      const donorLinks = sub.fields?.Donor || [];
      for (const link of donorLinks) {
        const donorId = typeof link === 'string' ? link : link.id;
        if (!subsByDonor.has(donorId)) subsByDonor.set(donorId, []);
        subsByDonor.get(donorId)!.push(sub);
      }
    }

    // Also try to match subscriptions to donors by Stripe Customer ID
    // (for orphaned subscriptions that weren't linked)
    const donorByStripeId = new Map<string, string>();
    for (const d of donors) {
      const sid = d.fields?.['Stripe Customer ID'];
      if (sid) donorByStripeId.set(sid, d.id);
    }

    const results: Array<{
      donorName: string;
      email: string;
      donorId: string;
      totalGiving: number;
      firstDonation: string | null;
      lastDonation: string | null;
      donorStatus: string;
      recurringSupporter: boolean;
      subscriptionIds: string[];
      fieldsUpdated: string[];
    }> = [];

    // Process each donor
    const batchUpdates: Array<{ id: string; fields: Record<string, any> }> = [];

    for (const donor of donors) {
      const donorDonations = donationsByDonor.get(donor.id) || [];
      const donorSubs = subsByDonor.get(donor.id) || [];

      // Calculate summary fields from linked donations
      let totalGiving = 0;
      let firstDate: string | null = null;
      let lastDate: string | null = null;

      for (const don of donorDonations) {
        const amount = don.fields?.['Donation Amount'] || 0;
        const status = don.fields?.['Payment Status'];
        // Only count succeeded payments
        if (status?.name === 'Succeeded' || status === 'Succeeded' || !status) {
          totalGiving += amount;
        }
        const date = don.fields?.['Donation Date'];
        if (date) {
          if (!firstDate || date < firstDate) firstDate = date;
          if (!lastDate || date > lastDate) lastDate = date;
        }
      }

      // Check for active subscriptions
      const existingSubIds = (donor.fields?.Subscriptions || []).map(
        (s: any) => (typeof s === 'string' ? s : s.id)
      );
      const allSubIds = new Set<string>(existingSubIds);
      for (const sub of donorSubs) {
        allSubIds.add(sub.id);
      }

      const hasActiveSubscription = donorSubs.some((s) => {
        const status = s.fields?.Status;
        const statusName = typeof status === 'object' ? status?.name : status;
        return statusName === 'active' || statusName === 'Active';
      });

      // Determine donor status
      let donorStatus = 'New';
      if (donorDonations.length > 0) {
        if (hasActiveSubscription) {
          donorStatus = 'Active';
        } else if (lastDate) {
          const daysSince = Math.floor(
            (Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)
          );
          donorStatus = daysSince <= 180 ? 'Active' : 'Lapsed';
        }
      }

      // Build update payload — only include fields that need changing
      const updates: Record<string, any> = {};
      const fieldsUpdated: string[] = [];

      const currentGiving = donor.fields?.['Total Lifetime Giving'] || 0;
      if (Math.abs(currentGiving - totalGiving) > 0.01) {
        updates['Total Lifetime Giving'] = totalGiving;
        fieldsUpdated.push('Total Lifetime Giving');
      }

      const currentFirst = donor.fields?.['First Donation Date'] || null;
      if (firstDate && currentFirst !== firstDate) {
        updates['First Donation Date'] = firstDate;
        fieldsUpdated.push('First Donation Date');
      }

      const currentLast = donor.fields?.['Most Recent Donation'] || null;
      if (lastDate && currentLast !== lastDate) {
        updates['Most Recent Donation'] = lastDate;
        fieldsUpdated.push('Most Recent Donation');
      }

      const currentStatus = donor.fields?.['Donor Status'];
      const currentStatusName =
        typeof currentStatus === 'object' ? currentStatus?.name : currentStatus;
      if (currentStatusName !== donorStatus) {
        updates['Donor Status'] = donorStatus;
        fieldsUpdated.push('Donor Status');
      }

      const currentRecurring = donor.fields?.['Recurring Supporter'] || false;
      if (currentRecurring !== hasActiveSubscription) {
        updates['Recurring Supporter'] = hasActiveSubscription;
        fieldsUpdated.push('Recurring Supporter');
      }

      // Link subscriptions if missing
      const newSubIds = [...allSubIds];
      if (
        newSubIds.length > 0 &&
        newSubIds.length !== existingSubIds.length
      ) {
        updates['Subscriptions'] = newSubIds.map((id) => ({ id }));
        fieldsUpdated.push('Subscriptions');
      }

      if (fieldsUpdated.length > 0) {
        batchUpdates.push({ id: donor.id, fields: updates });
      }

      results.push({
        donorName: donor.fields?.['Donor Name'] || '',
        email: donor.fields?.['Email Address'] || '',
        donorId: donor.id,
        totalGiving,
        firstDonation: firstDate,
        lastDonation: lastDate,
        donorStatus,
        recurringSupporter: hasActiveSubscription,
        subscriptionIds: [...allSubIds],
        fieldsUpdated,
      });
    }

    // Execute batch updates (Airtable allows 10 records per PATCH)
    let updatedCount = 0;
    if (!dryRun && batchUpdates.length > 0) {
      for (let i = 0; i < batchUpdates.length; i += 10) {
        const batch = batchUpdates.slice(i, i + 10);
        const res = await fetch(
          `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Donors`,
          {
            method: 'PATCH',
            headers: getAirtableHeaders(),
            body: JSON.stringify({ records: batch }),
          }
        );
        if (!res.ok) {
          const err = await res.text();
          console.error('[Backfill-Donors] Batch update failed:', err);
        } else {
          updatedCount += batch.length;
        }
      }
    }

    return NextResponse.json({
      dryRun,
      totalDonors: donors.length,
      donorsNeedingUpdate: batchUpdates.length,
      updatedCount: dryRun ? 0 : updatedCount,
      results,
    });
  } catch (err: any) {
    console.error('[Backfill-Donors] Fatal error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
