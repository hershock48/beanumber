import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_SPONSORSHIPS_TABLE = process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships';
// Use table ID directly — the env var AIRTABLE_UPDATES_TABLE was set to 'Updates'
// but the table was renamed to 'Child Updates'. IDs never change.
const AIRTABLE_UPDATES_TABLE = 'tblrmtVBVzL7zCQDE';

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

export async function POST(request: NextRequest) {
  try {
    const { sponsorCode, email, message } = await request.json();

    if (!sponsorCode || !email || !message) {
      return NextResponse.json(
        { error: 'Sponsor code, email, and message are required' },
        { status: 400 }
      );
    }

    if (message.length > 2000) {
      return NextResponse.json(
        { error: 'Message is too long. Please keep it under 2000 characters.' },
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

    // Get ChildID from Sponsorships table
    const sponsorshipFormula = `{SponsorCode} = "${sponsorCode}"`;
    const sponsorshipResponse = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_SPONSORSHIPS_TABLE}?filterByFormula=${encodeURIComponent(sponsorshipFormula)}&maxRecords=1`,
      {
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    let childID = null;
    if (sponsorshipResponse.ok) {
      const sponsorshipData = await sponsorshipResponse.json();
      if (sponsorshipData.records && sponsorshipData.records.length > 0) {
        childID = sponsorshipData.records[0].fields['ChildID'] || null;
      }
    }

    if (!childID) {
      return NextResponse.json(
        { error: 'Child ID not found for this sponsorship' },
        { status: 404 }
      );
    }

    // Create message record in Updates table
    const now = new Date().toISOString();
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
            'ChildID': childID,
            'SponsorCode': sponsorCode,
            'UpdateType': 'Sponsor Message',
            'Title': `Message from ${email}`,
            'Content': message,
            'Status': 'Pending Review',
            'VisibleToSponsor': false,
            'RequestedBySponsor': true,
            'RequestedAt': now,
          },
          typecast: true,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('[Send Message] Airtable error:', error);
      throw new Error(`Airtable API error: ${error}`);
    }

    return NextResponse.json({
      success: true,
      message: 'Message sent successfully',
    });
  } catch (error: any) {
    console.error('[Send Message] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send message' },
      { status: 500 }
    );
  }
}
