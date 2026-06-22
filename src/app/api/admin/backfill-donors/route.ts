/**
 * GET /api/admin/backfill-donors
 *
 * Recomputes every Donor's summary fields from their linked donations
 * and subscriptions. Fills:
 *   - total_lifetime_giving
 *   - first_donation_date
 *   - most_recent_donation
 *   - donor_status (Active if has-active-sub or recent donation; Lapsed
 *     after 180 days; New if no donations)
 *   - recurring_supporter (true if any subscription.status === 'active')
 *
 * Idempotent. ?dry=1 to preview without writing.
 *
 * Auth: ADMIN_API_TOKEN / ADMIN_PASSWORD / CRON_SECRET via ?token=,
 * X-Admin-Token, or Authorization: Bearer.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { donors, donations, subscriptions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
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

  const dryRun = request.nextUrl.searchParams.get('dry') === '1';

  try {
    const [allDonors, allDonations, allSubs] = await Promise.all([
      db.select().from(donors),
      db.select().from(donations),
      db.select().from(subscriptions),
    ]);

    // donations grouped by donor_id
    const donationsByDonor = new Map<string, typeof allDonations>();
    for (const d of allDonations) {
      if (!d.donorId) continue;
      const list = donationsByDonor.get(d.donorId) || [];
      list.push(d);
      donationsByDonor.set(d.donorId, list);
    }

    // subscriptions grouped by donor_id
    const subsByDonor = new Map<string, typeof allSubs>();
    for (const s of allSubs) {
      if (!s.donorId) continue;
      const list = subsByDonor.get(s.donorId) || [];
      list.push(s);
      subsByDonor.set(s.donorId, list);
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
      fieldsUpdated: string[];
    }> = [];

    let updatedCount = 0;

    for (const donor of allDonors) {
      const donorDonations = donationsByDonor.get(donor.id) || [];
      const donorSubs = subsByDonor.get(donor.id) || [];

      let totalGiving = 0;
      let firstDate: string | null = null;
      let lastDate: string | null = null;

      for (const don of donorDonations) {
        const amount = Number(don.donationAmount ?? 0);
        const status = don.paymentStatus || '';
        if (status === 'Succeeded' || status === '') {
          totalGiving += amount;
        }
        const date = don.donationDate;
        if (date) {
          if (!firstDate || date < firstDate) firstDate = date;
          if (!lastDate || date > lastDate) lastDate = date;
        }
      }

      const hasActiveSubscription = donorSubs.some(
        s => s.status === 'active' || s.status === 'Active'
      );

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

      const patch: Record<string, unknown> = {};
      const fieldsUpdated: string[] = [];

      const currentGiving = Number(donor.totalLifetimeGiving ?? 0);
      if (Math.abs(currentGiving - totalGiving) > 0.01) {
        patch.totalLifetimeGiving = String(totalGiving);
        fieldsUpdated.push('totalLifetimeGiving');
      }
      if (firstDate && donor.firstDonationDate !== firstDate) {
        patch.firstDonationDate = firstDate;
        fieldsUpdated.push('firstDonationDate');
      }
      if (lastDate && donor.mostRecentDonation !== lastDate) {
        patch.mostRecentDonation = lastDate;
        fieldsUpdated.push('mostRecentDonation');
      }
      if (donor.donorStatus !== donorStatus) {
        patch.donorStatus = donorStatus;
        fieldsUpdated.push('donorStatus');
      }
      if ((donor.recurringSupporter ?? false) !== hasActiveSubscription) {
        patch.recurringSupporter = hasActiveSubscription;
        fieldsUpdated.push('recurringSupporter');
      }

      if (fieldsUpdated.length > 0 && !dryRun) {
        patch.updatedAt = new Date();
        await db.update(donors).set(patch).where(eq(donors.id, donor.id));
        updatedCount++;
      }

      results.push({
        donorName: donor.name || '',
        email: donor.email,
        donorId: donor.id,
        totalGiving,
        firstDonation: firstDate,
        lastDonation: lastDate,
        donorStatus,
        recurringSupporter: hasActiveSubscription,
        fieldsUpdated,
      });
    }

    return NextResponse.json({
      dryRun,
      totalDonors: allDonors.length,
      donorsNeedingUpdate: results.filter(r => r.fieldsUpdated.length > 0).length,
      updatedCount: dryRun ? 0 : updatedCount,
      results,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Backfill-Donors] Fatal error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
