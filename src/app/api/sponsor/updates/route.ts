import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_SPONSORSHIPS_TABLE = process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships';
const AIRTABLE_UPDATES_TABLE = process.env.AIRTABLE_UPDATES_TABLE || 'Updates';
const AIRTABLE_CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';

async function verifySession(sponsorCode: string): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('sponsor_session');

  if (!sessionCookie) return false;

  try {
    const session = JSON.parse(sessionCookie.value);
    if (new Date(session.expires) < new Date()) return false;
    return session.sponsorCode === sponsorCode;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sponsorCode = searchParams.get('sponsorCode');

    if (!sponsorCode) {
      return NextResponse.json(
        { error: 'Sponsor code is required' },
        { status: 400 }
      );
    }

    // Verify session
    if (!(await verifySession(sponsorCode))) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      throw new Error('Airtable credentials not configured');
    }

    // Get child info from Sponsorships table
    const sponsorshipFormula = `{SponsorCode} = "${sponsorCode}"`;
    const sponsorshipResponse = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_SPONSORSHIPS_TABLE}?filterByFormula=${encodeURIComponent(sponsorshipFormula)}`,
      {
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    let childInfo = null;
    let childID = null;

    // The reveal gate. Portal shows a locked "waiting for your shirt"
    // view until this is set, either by the beacon on /children/[n]
    // (when the sponsor types their number) or by the manual "reveal
    // anyway" button in the dashboard. See /api/sponsor/reveal.
    let childRevealed = false;
    let revealedAt: string | null = null;

    if (sponsorshipResponse.ok) {
      const sponsorshipData = await sponsorshipResponse.json();
      if (sponsorshipData.records && sponsorshipData.records.length > 0) {
        const fields = sponsorshipData.records[0].fields;
        childID = fields['ChildID'] || null;
        revealedAt = fields['ChildRevealedAt'] || null;
        childRevealed = !!revealedAt;

        // Only attach child info when revealed. The portal UI uses the
        // presence of childInfo as the unlock signal.
        if (childRevealed) {
          childInfo = {
            name: fields['ChildDisplayName'] || '',
            firstName: undefined as string | undefined,
            photo: fields['ChildPhoto']?.[0]?.url || undefined,
            age: fields['ChildAge'] || undefined,
            location: fields['ChildLocation'] || undefined,
            sponsorshipStartDate: fields['SponsorshipStartDate'] || undefined,
            // Structured intake fields from the Children table. Any may be
            // empty; the dashboard renders each block conditionally so a
            // half-filled profile still looks intentional (matches the
            // /children/[number] page treatment).
            homeVillage: undefined as string | undefined,
            familyContext: undefined as string | undefined,
            loves: undefined as string | undefined,
            childQuote: undefined as string | undefined,
            teacherName: undefined as string | undefined,
            teacherQuote: undefined as string | undefined,
            notes: undefined as string | undefined,
          };

          // Look up the Children record to pull the structured intake
          // fields. The Sponsorship holds the denormalized basics (name,
          // photo, age) but the structured profile lives on Children.
          // One extra Airtable request per portal load; fine for a
          // logged-in dashboard.
          if (childID) {
            try {
              const childFormula = `{ChildID} = "${childID}"`;
              const childResponse = await fetch(
                `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_CHILDREN_TABLE}?filterByFormula=${encodeURIComponent(childFormula)}&maxRecords=1`,
                {
                  headers: {
                    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
                    'Content-Type': 'application/json',
                  },
                }
              );
              if (childResponse.ok) {
                const childData = await childResponse.json();
                const childFields = childData.records?.[0]?.fields;
                if (childFields) {
                  childInfo.firstName = childFields['FirstName'] || undefined;
                  childInfo.homeVillage = childFields['HomeVillage'] || undefined;
                  childInfo.familyContext = childFields['FamilyContext'] || undefined;
                  childInfo.loves = childFields['Loves'] || undefined;
                  childInfo.childQuote = childFields['ChildQuote'] || undefined;
                  childInfo.teacherName = childFields['TeacherName'] || undefined;
                  childInfo.teacherQuote = childFields['TeacherQuote'] || undefined;
                  childInfo.notes = childFields['Notes'] || undefined;
                }
              }
            } catch (err) {
              // Non-fatal. The portal still renders with the denormalized
              // basics if the Children lookup fails.
              console.warn('[Sponsor Updates] Children lookup failed', err);
            }
          }
        }
      }
    }

    // Get published updates - link by ChildID. Gated on reveal: the
    // updates feed stays empty until the sponsor has met their child.
    let updates = [];
    if (childID && childRevealed) {
      const updatesFormula = `AND({ChildID} = "${childID}", {VisibleToSponsor} = TRUE(), {Status} = "Published")`;
      const updatesResponse = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_UPDATES_TABLE}?filterByFormula=${encodeURIComponent(updatesFormula)}&sort[0][field]=PublishedAt&sort[0][direction]=desc`,
        {
          headers: {
            Authorization: `Bearer ${AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (updatesResponse.ok) {
        const updatesData = await updatesResponse.json();
        updates = (updatesData.records || []).map((record: any) => {
          const fields = record.fields;
          return {
            id: record.id,
            date: fields['PublishedAt'] || fields['RequestedAt'] || '',
            type: fields['UpdateType'] || 'Progress Report',
            title: fields['Title'] || '',
            content: fields['Content'] || '',
            photos: (fields['Photos'] || []).map((photo: any) => photo.url),
          };
        });
      }
    }

    // Get last request date from Sponsorships table
    let lastRequestDate = null;
    let nextRequestEligibleAt = null;
    if (sponsorshipResponse.ok) {
      const sponsorshipData = await sponsorshipResponse.json();
      if (sponsorshipData.records && sponsorshipData.records.length > 0) {
        const fields = sponsorshipData.records[0].fields;
        lastRequestDate = fields['LastRequestAt'] || null;
        nextRequestEligibleAt = fields['NextRequestEligibleAt'] || null;
      }
    }

    return NextResponse.json({
      updates,
      childInfo,
      childRevealed,
      revealedAt,
      lastRequestDate,
      nextRequestEligibleAt,
    });
  } catch (error: any) {
    console.error('[Sponsor Updates] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to load updates' },
      { status: 500 }
    );
  }
}
