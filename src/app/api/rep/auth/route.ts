import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { sendEmail } from '@/lib/email';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'app73ZPGbM0BQTOZW';
const AIRTABLE_PAT = process.env.AIRTABLE_PAT || '';
const REPS_TABLE = 'Reps';

function getAirtableHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_PAT}`,
    'Content-Type': 'application/json',
  };
}

const requestSchema = z.object({
  email: z.string().email(),
});

const verifySchema = z.object({
  token: z.string().min(1),
});

/**
 * POST /api/rep/auth — request a magic link
 * GET /api/rep/auth?token=xxx — verify a magic link token, return rep data
 */
export async function POST(request: NextRequest) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Valid email required.' }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();

    // Look up the rep by email
    const searchResponse = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${REPS_TABLE}?filterByFormula=${encodeURIComponent(`{Email}='${email}'`)}`,
      { headers: getAirtableHeaders() }
    );

    if (!searchResponse.ok) {
      return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
    }

    const searchData = await searchResponse.json();
    if (!searchData.records || searchData.records.length === 0) {
      // Don't reveal whether the email exists — just say we sent it
      return NextResponse.json({ success: true, message: 'If an account exists with that email, a login link has been sent.' });
    }

    const rep = searchData.records[0];
    if (rep.fields.Status !== 'Approved') {
      return NextResponse.json({ success: true, message: 'If an account exists with that email, a login link has been sent.' });
    }

    // Generate a token
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes

    // Store token on the rep record
    await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${REPS_TABLE}/${rep.id}`,
      {
        method: 'PATCH',
        headers: getAirtableHeaders(),
        body: JSON.stringify({
          fields: {
            AuthToken: token,
            AuthTokenExpiry: expiry,
          },
        }),
      }
    );

    // Send the magic link
    const origin = request.headers.get('origin') || 'https://www.beanumber.org';
    const loginUrl = `${origin}/rep/dashboard?token=${token}`;

    await sendEmail({
      to: { email, name: rep.fields.Name || '' },
      subject: 'Your BAN Rep Dashboard Login',
      text: `Hey ${rep.fields.Name?.split(' ')[0] || 'there'},\n\nHere's your login link for the BAN rep dashboard:\n\n${loginUrl}\n\nThis link expires in 30 minutes.\n\nKevin`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; padding: 32px; background: #FFF8F0;">
          <p style="color: #0d0d0d; font-size: 15px; line-height: 1.7;">
            Hey ${rep.fields.Name?.split(' ')[0] || 'there'},
          </p>
          <p style="color: #0d0d0d; font-size: 15px; line-height: 1.7;">
            Here's your login link for the BAN rep dashboard:
          </p>
          <p style="margin: 24px 0;">
            <a href="${loginUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; padding: 14px 28px; font-weight: bold; text-decoration: none; font-size: 14px; letter-spacing: 0.05em;">
              Open Dashboard
            </a>
          </p>
          <p style="color: #777; font-size: 13px;">
            This link expires in 30 minutes.
          </p>
          <p style="color: #0d0d0d; font-size: 15px; line-height: 1.7; margin-top: 24px;">
            Kevin
          </p>
        </div>
      `,
    });

    return NextResponse.json({ success: true, message: 'If an account exists with that email, a login link has been sent.' });
  } catch (error: any) {
    console.error('[Rep Auth] Error:', error);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ error: 'Token required.' }, { status: 400 });
    }

    // Look up rep by token
    const searchResponse = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${REPS_TABLE}?filterByFormula=${encodeURIComponent(`{AuthToken}='${token}'`)}`,
      { headers: getAirtableHeaders() }
    );

    if (!searchResponse.ok) {
      return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
    }

    const searchData = await searchResponse.json();
    if (!searchData.records || searchData.records.length === 0) {
      return NextResponse.json({ error: 'Invalid or expired link.' }, { status: 401 });
    }

    const rep = searchData.records[0];

    // Check expiry
    const expiry = rep.fields.AuthTokenExpiry;
    if (!expiry || new Date(expiry) < new Date()) {
      return NextResponse.json({ error: 'Link expired. Request a new one.' }, { status: 401 });
    }

    // Check status
    if (rep.fields.Status !== 'Approved') {
      return NextResponse.json({ error: 'Account not yet approved.' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      rep: {
        name: rep.fields.Name || '',
        email: rep.fields.Email || '',
        refCode: rep.fields.RefCode || '',
        school: rep.fields.School || '',
        shirtsSold: rep.fields.ShirtsSold || 0,
        sponsorCount: rep.fields.SponsorCount || 0,
        status: rep.fields.Status || 'Applied',
        appliedAt: rep.fields.AppliedAt || '',
        childNumber: rep.fields.ChildNumber || null,
        childName: rep.fields.ChildName || null,
      },
    });
  } catch (error: any) {
    console.error('[Rep Auth] GET Error:', error);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
