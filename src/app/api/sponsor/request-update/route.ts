import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_UPDATES_TABLE = process.env.AIRTABLE_UPDATES_TABLE || 'Updates';

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

async function checkLastRequest(sponsorCode: string): Promise<{ canRequest: boolean; daysUntil: number }> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    return { canRequest: false, daysUntil: 0 };
  }

  const formula = `AND({Sponsor Code} = "${sponsorCode}", {Requested By Sponsor} = TRUE())`;
  
  try {
    const response = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_UPDATES_TABLE}?filterByFormula=${encodeURIComponent(formula)}&sort[0][field]=Submitted Date&sort[0][direction]=desc&maxRecords=1`,
      {
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
      if (data.records && data.records.length > 0) {
        const lastRequestDate = data.records[0].fields['Submitted Date'];
        if (lastRequestDate) {
          const lastRequest = new Date(lastRequestDate);
          const daysSince = Math.floor((Date.now() - lastRequest.getTime()) / (1000 * 60 * 60 * 24));
          return { canRequest: daysSince >= 90, daysUntil: Math.max(0, 90 - daysSince) };
        }
      }
    }
  } catch (error) {
    console.error('Error checking last request:', error);
  }

  return { canRequest: true, daysUntil: 0 };
}

export async function POST(request: NextRequest) {
  try {
    const { sponsorCode, email } = await request.json();

    if (!sponsorCode || !email) {
      return NextResponse.json(
        { error: 'Sponsor code and email are required' },
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

    // Check if can request (90 days since last request)
    const { canRequest, daysUntil } = await checkLastRequest(sponsorCode);

    if (!canRequest) {
      return NextResponse.json(
        { error: `You can request your next update in ${daysUntil} days. Updates are limited to once per quarter.` },
        { status: 429 }
      );
    }

    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      throw new Error('Airtable credentials not configured');
    }

    // Create update request record
    const response = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_UPDATES_TABLE}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: {
            'Sponsor Code': sponsorCode,
            'Update Type': 'Requested Update',
            'Title': `Update Request from ${email}`,
            'Content': `Sponsor ${email} has requested an update about their sponsored child.`,
            'Status': 'Draft',
            'Requested By Sponsor': true,
            'Submitted Date': new Date().toISOString(),
            'Update Date': new Date().toISOString(),
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Airtable API error: ${error}`);
    }

    return NextResponse.json({
      success: true,
      message: 'Update request submitted successfully',
    });
  } catch (error: any) {
    console.error('[Request Update] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to submit update request' },
      { status: 500 }
    );
  }
}
