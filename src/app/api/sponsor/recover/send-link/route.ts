/**
 * Request a sponsor-recovery magic link.
 *
 * Use case: a verified sponsor lands on /[number] for the kid they
 * sponsor — but from a new device, an incognito window, or after
 * clearing their cookies. The page can't auto-identify them. They
 * submit their email to this endpoint; if there's a matching active
 * Sponsorship for this child + email, we email them a one-tap link
 * that drops a fresh sponsor_session cookie and bounces them back to
 * /children/[number] in authenticated mode.
 *
 * Privacy: the endpoint always returns success, regardless of whether
 * the email matched anything. That keeps it from being usable as an
 * email-enumeration oracle (an attacker can't tell which addresses
 * are sponsors).
 *
 * Rate limiting: not implemented yet. Volume is low enough that any
 * abuse will surface in Vercel logs; add real rate limiting once we
 * see traffic.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmail } from '@/lib/email';
import { makeRecoveryToken } from '@/lib/recovery-tokens';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const SPONSORSHIPS_TABLE = process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships';
const CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';

const schema = z.object({
  email: z.string().email(),
  shirtNumber: z.number().int().positive(),
});

function atHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function lookupSponsorshipForRecovery(
  email: string,
  shirtNumber: number
): Promise<{ sponsorCode: string; childDisplayName: string; firstName: string } | null> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return null;
  try {
    // First find the child by shirt number so we have their record ID.
    const childFormula = encodeURIComponent(`{ShirtNumber}=${shirtNumber}`);
    const childRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        CHILDREN_TABLE
      )}?filterByFormula=${childFormula}&maxRecords=1`,
      { headers: atHeaders(), cache: 'no-store' }
    );
    if (!childRes.ok) return null;
    const childData = await childRes.json();
    const child = childData.records?.[0];
    if (!child) return null;
    const childRecordId = child.id as string;
    const childDisplayName: string =
      child.fields?.DisplayName ||
      `${child.fields?.FirstName || 'Child'} ${child.fields?.LastInitial || ''}`.trim();
    const firstName: string = child.fields?.FirstName || childDisplayName.split(' ')[0] || 'them';

    // Find an Active Sponsorship for this email that links to this child.
    const sponsorshipFormula = encodeURIComponent(
      `AND(LOWER({SponsorEmail})="${email.toLowerCase().replace(/"/g, '\\"')}", {Status}="Active", FIND("${childRecordId}", ARRAYJOIN({Children}, ",")))`
    );
    const spRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        SPONSORSHIPS_TABLE
      )}?filterByFormula=${sponsorshipFormula}&maxRecords=1`,
      { headers: atHeaders(), cache: 'no-store' }
    );
    if (!spRes.ok) return null;
    const spData = await spRes.json();
    const sponsorship = spData.records?.[0];
    if (!sponsorship) return null;
    const sponsorCode = sponsorship.fields?.SponsorCode as string | undefined;
    if (!sponsorCode) return null;
    return { sponsorCode, childDisplayName, firstName };
  } catch (err) {
    console.warn('[Recovery] Sponsorship lookup failed', err);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    const { email, shirtNumber } = parsed.data;

    // Always return success regardless of match — privacy first.
    const responseShape = { success: true };

    const match = await lookupSponsorshipForRecovery(email, shirtNumber);
    if (!match) {
      // No match — don't tell the requester. Just return success.
      console.log(
        `[Recovery] No active sponsorship match for ${email} on #${shirtNumber}; skipping email send.`
      );
      return NextResponse.json(responseShape);
    }

    // Build + send the recovery email.
    let token: string;
    try {
      token = makeRecoveryToken(match.sponsorCode, shirtNumber);
    } catch (err) {
      console.error('[Recovery] Token generation failed', err);
      return NextResponse.json(responseShape);
    }
    const callbackUrl = `${SITE_URL}/api/sponsor/recover/callback?t=${encodeURIComponent(token)}`;

    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'Kevin@beanumber.org';
    const firstName = match.firstName;
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Georgia, 'Times New Roman', serif; line-height: 1.7; color: #333; max-width: 560px; margin: 0 auto; padding: 30px 20px;">
          <p style="margin-top: 0;">Hey there,</p>
          <p>
            You asked to get back into ${firstName}&rsquo;s page on
            <a href="https://www.beanumber.org" style="color: #D4A843; font-weight: bold;">beanumber.org</a>.
            Tap the button below to land back in your sponsor view.
          </p>
          <p style="text-align: center; margin: 28px 0;">
            <a href="${callbackUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em; text-transform: uppercase;">
              Open ${firstName}&rsquo;s page
            </a>
          </p>
          <p style="color: #888; font-size: 13px;">
            This link expires in 30 minutes. If you didn&rsquo;t request it, you can ignore this email &mdash; your portal stays exactly where it was.
          </p>
          <hr style="border: none; border-top: 1px solid #e8e0d4; margin: 24px 0;">
          <p style="font-size: 12px; color: #999; line-height: 1.5;">
            Be A Number, International<br>
            <a href="https://www.beanumber.org" style="color: #D4A843;">beanumber.org</a>
          </p>
        </body>
      </html>
    `;

    const result = await sendEmail({
      to: { email, name: '' },
      from: { email: fromEmail, name: 'Be A Number' },
      subject: `Your link back to ${firstName}'s page`,
      html,
    });
    if (!result.success) {
      console.error('[Recovery] Failed to send link email:', result.error);
      // Still return success to the client to preserve privacy.
    }

    return NextResponse.json(responseShape);
  } catch (err: any) {
    console.error('[Recovery] send-link error:', err);
    // Privacy-first response — never reveal what went wrong.
    return NextResponse.json({ success: true });
  }
}
