import { NextRequest, NextResponse } from 'next/server';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'app73ZPGbM0BQTOZW';
const AIRTABLE_PAT = process.env.AIRTABLE_PAT || '';
const REPS_TABLE = 'Reps';
const DONATIONS_TABLE = 'Donations';

function getAirtableHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_PAT}`,
    'Content-Type': 'application/json',
  };
}

/**
 * GET /api/rep/dashboard?token=xxx
 * Returns the rep's stats and the cohort leaderboard.
 * Stats are computed live from the Donations table by matching [Ref: code] in notes.
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
      return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
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
    // Airtable SEARCH function: SEARCH("[Ref: code]", {Donation Note})
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
        console.error('[Rep Dashboard] Donations query failed:', e);
        // Fall back to stored values
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
        // Non-critical — stats display is still from the live count
      }
    }

    // Get all approved reps for the leaderboard
    let leaderboard: Array<{ name: string; school: string; sponsorCount: number; shirtsSold: number }> = [];
    try {
      const allRepsResponse = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${REPS_TABLE}?filterByFormula=${encodeURIComponent(`{Status}='Approved'`)}&sort${encodeURIComponent('[0][field]')}=SponsorCount&sort${encodeURIComponent('[0][direction]')}=desc`,
        { headers: getAirtableHeaders() }
      );

      if (allRepsResponse.ok) {
        const allRepsData = await allRepsResponse.json();
        leaderboard = (allRepsData.records || []).map((r: any) => ({
          name: r.fields.Name || 'Anonymous',
          school: r.fields.School || '',
          sponsorCount: r.fields.SponsorCount || 0,
          shirtsSold: r.fields.ShirtsSold || 0,
        }));
      }
    } catch (e) {
      console.error('[Rep Dashboard] Leaderboard query failed:', e);
    }

    const SPONSOR_GOAL = 20;
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
        childNumber: rep.fields.ChildNumber || null,
        childName: rep.fields.ChildName || null,
      },
      progress: {
        sponsorCount,
        sponsorGoal: SPONSOR_GOAL,
        percentComplete: Math.min(100, Math.round((sponsorCount / SPONSOR_GOAL) * 100)),
        shirtsSold,
      },
      referralLink: `${origin}/shirts?ref=${refCode}`,
      leaderboard,
    });
  } catch (error: any) {
    console.error('[Rep Dashboard] Error:', error);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
