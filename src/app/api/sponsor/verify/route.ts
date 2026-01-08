import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_SPONSORSHIPS_TABLE = process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships';

interface SponsorData {
  sponsorCode: string;
  email: string;
  name: string;
  childID: string;
  childName: string;
  childPhoto?: string;
  sponsorshipStartDate: string;
}

async function verifySponsor(email: string, sponsorCode: string): Promise<SponsorData | null> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error('Airtable credentials not configured');
  }

  // Search for sponsor by email and sponsor code
  const formula = `AND({SponsorEmail} = "${email}", {SponsorCode} = "${sponsorCode}")`;
  
  const response = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_SPONSORSHIPS_TABLE}?filterByFormula=${encodeURIComponent(formula)}`,
    {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Airtable API error: ${error}`);
  }

  const data = await response.json();

  if (data.records && data.records.length > 0) {
    const record = data.records[0];
    const fields = record.fields;

    // Check if sponsorship is active
    const authStatus = fields['AuthStatus'] || 'Active';
    if (authStatus !== 'Active') {
      return null;
    }

    // Check if visible to sponsor
    if (fields['VisibleToSponsor'] === false) {
      return null;
    }

    return {
      sponsorCode: fields['SponsorCode'] || sponsorCode,
      email: fields['SponsorEmail'] || email,
      name: fields['SponsorName'] || '',
      childID: fields['ChildID'] || '',
      childName: fields['ChildDisplayName'] || '',
      childPhoto: fields['ChildPhoto']?.[0]?.url || undefined,
      sponsorshipStartDate: fields['SponsorshipStartDate'] || '',
    };
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { email, sponsorCode } = await request.json();

    if (!email || !sponsorCode) {
      return NextResponse.json(
        { error: 'Email and sponsor code are required' },
        { status: 400 }
      );
    }

    // Verify sponsor
    const sponsor = await verifySponsor(email, sponsorCode);

    if (!sponsor) {
      return NextResponse.json(
        { error: 'Invalid email or sponsor code, or sponsorship is not active' },
        { status: 401 }
      );
    }

    // Create session cookie (30 days)
    const cookieStore = await cookies();
    const expires = new Date();
    expires.setDate(expires.getDate() + 30);

    cookieStore.set('sponsor_session', JSON.stringify({
      email: sponsor.email,
      sponsorCode: sponsor.sponsorCode,
      expires: expires.toISOString(),
    }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires,
      path: '/',
    });

    return NextResponse.json({
      success: true,
      sponsorCode: sponsor.sponsorCode,
      name: sponsor.name,
    });
  } catch (error: any) {
    console.error('[Sponsor Verify] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to verify sponsor' },
      { status: 500 }
    );
  }
}
