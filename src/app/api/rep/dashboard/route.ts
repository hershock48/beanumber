import { NextRequest, NextResponse } from 'next/server';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'app73ZPGbM0BQTOZW';
const AIRTABLE_PAT = process.env.AIRTABLE_PAT || '';
const REPS_TABLE = 'Reps';
const DONATIONS_TABLE = 'Donations';

const SPONSOR_GOAL = 24;
const CREDIT_PER_SPONSOR = 100;

function getAirtableHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_PAT}`,
    'Content-Type': 'application/json',
  };
}

/**
 * GET /api/rep/dashboard?token=xxx
 * Returns the cohort member's stats, scholarship balance, and cohort leaderboard.
 * Stats are computed live from the Donations table by matching [Ref: code] in notes.
 *
 * "qualifiedSponsorCount" = sponsors who have been active 3+ months.
 * For now, we use the total recurring count as a proxy since we don't yet track
 * individual signup dates. When we add per-sponsor date tracking, we'll filter
 * by the 90-day mark here.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ error: 'Token required.' }, { status: 400 });
    }

    // Authenticate via token
    const authResponse = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${REPS_TABLE}?filterByFormula=${encodeURIComponent(`{AuthToken}='${token}'`)}`,
      { headers: getAirtableHeaders() }
    );

    if (!authResponse.ok) {
      console.warn('[Cohort Dashboard] Airtable auth lookup failed:', authResponse.status);
      return NextResponse.json({ error: 'Dashboard service temporarily unavailable. Please try again in a few minutes.' }, { status: 503 });
    }

    const authData = await authResponse.json();
    if (!authData.records || authData.records.length === 0) {
      return NextResponse.json({ error: 'Invalid or expired link.' }, { status: 401 });
    }

    const rep = authData.records[0];
    const expiry = rep.fields.AuthTokenExpiry;
    if (!expiry || new Date(expiry) < new Date()) {
      return NextResponse.json({ error: 'Session expired. Request a new login link.' }, { status: 401 });
    }

    if (rep.fields.Status !== 'Approved') {
      return NextResponse.json({ error: 'Account not yet approved.' }, { status: 403 });
    }

    const refCode = rep.fields.RefCode || '';

    // Count donations with this ref code in notes
    let shirtsSold = 0;
    let sponsorCount = 0;

    if (refCode) {
      try {
        const donationsResponse = await fetch(
          `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${DONATIONS_TABLE}?filterByFormula=${encodeURIComponent(
            `SEARCH("[Ref: ${refCode}]", {Donation Note})`
          )}&fields${encodeURIComponent('[]')}=Donation%20Note&fields${encodeURIComponent('[]')}=Donation%20Amount&fields${encodeURIComponent('[]')}=Recurring%20Donation`,
          { headers: getAirtableHeaders() }
        );

        if (donationsResponse.ok) {
          const donationsData = await donationsResponse.json();
          const records = donationsData.records || [];
          shirtsSold = records.length;
          sponsorCount = records.filter((r: any) => r.fields?.['Recurring Donation'] === true).length;
        }
      } catch (e) {
        console.error('[Cohort Dashboard] Donations query failed:', e);
        shirtsSold = rep.fields.ShirtsSold || 0;
        sponsorCount = rep.fields.SponsorCount || 0;
      }
    }

    // Update the rep record with computed stats
    if (refCode) {
      try {
        await fetch(
          `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${REPS_TABLE}/${rep.id}`,
          {
            method: 'PATCH',
            headers: getAirtableHeaders(),
            body: JSON.stringify({
              fields: {
                ShirtsSold: shirtsSold,
                SponsorCount: sponsorCount,
              },
            }),
          }
        );
      } catch (e) {
        // Non-critical
      }
    }

    // Cohort leaderboard: all approved members, ranked by sponsor count
    let cohortLeaderboard: Array<{ name: string; sponsorCount: number; isMe: boolean }> = [];
    try {
      const allRepsResponse = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${REPS_TABLE}?filterByFormula=${encodeURIComponent(`{Status}='Approved'`)}`,
        { headers: getAirtableHeaders() }
      );

      if (allRepsResponse.ok) {
        const allRepsData = await allRepsResponse.json();

        cohortLeaderboard = (allRepsData.records || [])
          .map((r: any) => ({
            name: (r.fields.Name || 'Anonymous').split(' ')[0],
            sponsorCount: r.fields.SponsorCount || 0,
            isMe: r.id === rep.id,
          }))
          .sort((a: any, b: any) => b.sponsorCount - a.sponsorCount);
      }
    } catch (e) {
      console.error('[Cohort Dashboard] Leaderboard query failed:', e);
    }

    // For now, qualifiedSponsorCount = sponsorCount (proxy until we track per-sponsor dates)
    const qualifiedSponsorCount = sponsorCount;
    const scholarshipEarned = qualifiedSponsorCount * CREDIT_PER_SPONSOR;

    const origin = request.headers.get('origin') || 'https://www.beanumber.org';

    return NextResponse.json({
      success: true,
      rep: {
        name: rep.fields.Name || '',
        email: rep.fields.Email || '',
        refCode,
        school: rep.fields.School || '',
        shirtsSold,
        sponsorCount,
        qualifiedSponsorCount,
        childNumber: rep.fields.ChildNumber || null,
        childName: rep.fields.ChildName || null,
      },
      progress: {
        sponsorCount,
        qualifiedSponsorCount,
        sponsorGoal: SPONSOR_GOAL,
        percentComplete: Math.min(100, Math.round((sponsorCount / SPONSOR_GOAL) * 100)),
        shirtsSold,
        scholarshipEarned,
        balanceRemaining: Math.max(0, 3000 - 500 - scholarshipEarned),
      },
      referralLink: `${origin}/shirts?ref=${refCode}`,
      cohortLeaderboard,
    });
  } catch (error: any) {
    console.warn('[Cohort Dashboard] Failed (likely Airtable unreachable):', error?.message || error);
    return NextResponse.json({ error: 'Dashboard service temporarily unavailable. Please try again in a few minutes.' }, { status: 503 });
  }
}
