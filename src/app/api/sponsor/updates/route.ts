import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_SPONSORSHIPS_TABLE = process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships';
// Use table ID directly — the env var AIRTABLE_UPDATES_TABLE was set to 'Updates'
// but the table was renamed to 'Child Updates'. IDs never change.
const AIRTABLE_UPDATES_TABLE = 'tblrmtVBVzL7zCQDE';
const AIRTABLE_CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';

const headers = () => ({
  Authorization: `Bearer ${AIRTABLE_API_KEY}`,
  'Content-Type': 'application/json',
});

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

    if (!(await verifySession(sponsorCode))) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      throw new Error('Airtable credentials not configured');
    }

    // ---------------------------------------------------------------
    // 1. Sponsorship record — parse ONCE.
    // ---------------------------------------------------------------
    const sponsorshipFormula = `{SponsorCode} = "${sponsorCode}"`;
    const sponsorshipRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_SPONSORSHIPS_TABLE}?filterByFormula=${encodeURIComponent(sponsorshipFormula)}&maxRecords=1`,
      { headers: headers() }
    );

    let childInfo: any = null;
    let childID: string | null = null;
    let childRevealed = false;
    let revealedAt: string | null = null;
    let nextRequestEligibleAt: string | null = null;
    let sponsorship: {
      startDate: string | null;
      totalPaid: number;
      monthlyAmount: number;
      monthsActive: number;
      status: string | null;
    } = { startDate: null, totalPaid: 0, monthlyAmount: 25, monthsActive: 0, status: null };

    if (sponsorshipRes.ok) {
      const sponsorshipData = await sponsorshipRes.json();
      const record = sponsorshipData.records?.[0];
      if (record) {
        const f = record.fields;
        childID = f['ChildID'] || null;
        revealedAt = f['ChildRevealedAt'] || null;
        childRevealed = !!revealedAt;
        nextRequestEligibleAt = f['NextRequestEligibleAt'] || null;

        // Sponsorship stats for impact math
        const startDate = f['Started'] || f['SponsorshipStartDate'] || null;
        const totalPaid = typeof f['Total Paid'] === 'number' ? f['Total Paid'] : 0;
        const monthlyAmount = typeof f['Monthly Amount'] === 'number' ? f['Monthly Amount'] : 25;

        let monthsActive = 0;
        if (startDate) {
          const start = new Date(startDate);
          const now = new Date();
          monthsActive = Math.max(0,
            (now.getFullYear() - start.getFullYear()) * 12 +
            (now.getMonth() - start.getMonth()) +
            (now.getDate() >= start.getDate() ? 0 : -1)
          );
          // At minimum 1 month if they've started
          if (monthsActive === 0 && now >= start) monthsActive = 1;
        }

        const status = (f['Status'] as string | undefined) || null;
        sponsorship = { startDate, totalPaid, monthlyAmount, monthsActive, status };

        // Build child info only when revealed
        if (childRevealed) {
          childInfo = {
            name: f['ChildDisplayName'] || '',
            firstName: undefined as string | undefined,
            photo: f['ChildPhoto']?.[0]?.url || undefined,
            age: f['ChildAge'] || undefined,
            location: f['ChildLocation'] || undefined,
            sponsorshipStartDate: startDate || undefined,
            birthday: undefined as string | undefined,
            homeVillage: undefined as string | undefined,
            familyContext: undefined as string | undefined,
            loves: undefined as string | undefined,
            childQuote: undefined as string | undefined,
            teacherName: undefined as string | undefined,
            teacherQuote: undefined as string | undefined,
            notes: undefined as string | undefined,
          };

          // Children record — pull structured intake + birthday
          if (childID) {
            try {
              const childFormula = `{ChildID} = "${childID}"`;
              const childRes = await fetch(
                `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_CHILDREN_TABLE}?filterByFormula=${encodeURIComponent(childFormula)}&maxRecords=1`,
                { headers: headers() }
              );
              if (childRes.ok) {
                const childFields = (await childRes.json()).records?.[0]?.fields;
                if (childFields) {
                  childInfo.firstName = childFields['FirstName'] || undefined;
                  childInfo.birthday = childFields['Birthday'] || undefined;
                  childInfo.homeVillage = childFields['HomeVillage'] || undefined;
                  childInfo.familyContext = childFields['FamilyContext'] || undefined;
                  childInfo.loves = childFields['Loves'] || undefined;
                  childInfo.childQuote = childFields['ChildQuote'] || undefined;
                  childInfo.teacherName = childFields['TeacherName'] || undefined;
                  childInfo.teacherQuote = childFields['TeacherQuote'] || undefined;
                  childInfo.notes = childFields['Notes'] || undefined;
                  // Shop Your Number (memo §5) needs the shirt number on the
                  // sponsor's matched child so the portal can carry it
                  // forward to repeat orders.
                  const shirtNum = childFields['ShirtNumber'];
                  childInfo.shirtNumber = typeof shirtNum === 'number' ? shirtNum : null;
                }
              }
            } catch (err) {
              console.warn('[Sponsor Updates] Children lookup failed', err);
            }
          }
        }
      }
    }

    // ---------------------------------------------------------------
    // 2. Published updates from YDO (gated on reveal)
    // ---------------------------------------------------------------
    let updates: any[] = [];
    if (childID && childRevealed) {
      const updatesFormula = `AND({ChildID} = "${childID}", {VisibleToSponsor} = TRUE(), {Status} = "Published")`;
      const updatesRes = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_UPDATES_TABLE}?filterByFormula=${encodeURIComponent(updatesFormula)}&sort[0][field]=PublishedAt&sort[0][direction]=desc`,
        { headers: headers() }
      );

      if (updatesRes.ok) {
        const updatesData = await updatesRes.json();
        updates = (updatesData.records || []).map((record: any) => {
          const f = record.fields;
          return {
            id: record.id,
            date: f['PublishedAt'] || f['RequestedAt'] || '',
            type: f['UpdateType'] || 'Progress Report',
            title: f['Title'] || '',
            content: f['Content'] || '',
            photos: (f['Photos'] || []).map((photo: any) => photo.url),
          };
        });
      }
    }

    // ---------------------------------------------------------------
    // 3. Sponsor messages (so the timeline shows both sides)
    // ---------------------------------------------------------------
    let sponsorMessages: any[] = [];
    if (childRevealed) {
      const msgFormula = `AND({SponsorCode} = "${sponsorCode}", {UpdateType} = "Sponsor Message")`;
      const msgRes = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_UPDATES_TABLE}?filterByFormula=${encodeURIComponent(msgFormula)}&sort[0][field]=RequestedAt&sort[0][direction]=desc`,
        { headers: headers() }
      );

      if (msgRes.ok) {
        const msgData = await msgRes.json();
        sponsorMessages = (msgData.records || []).map((record: any) => {
          const f = record.fields;
          return {
            id: record.id,
            date: f['RequestedAt'] || '',
            content: f['Content'] || '',
            status: f['Status'] || 'Pending Review',
          };
        });
      }
    }

    return NextResponse.json({
      updates,
      sponsorMessages,
      childInfo,
      childRevealed,
      revealedAt,
      sponsorship,
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
