/**
 * Founding Cohort magic-link sign-in for /rep/dashboard.
 *
 * POST /api/rep/auth            request a link (email in body)
 * GET  /api/rep/auth?token=xxx  verify a link, return the member
 *
 * Backed by cohort_members in Postgres since 2026-09-14 (was Airtable).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { sendEmail } from '@/lib/email';
import {
  findCohortMemberByEmail,
  findCohortMemberByToken,
  isMissingCohortTable,
  isTokenExpired,
  publicCohortMember,
  setCohortMemberAuthToken,
} from '@/lib/cohort-members';

const requestSchema = z.object({
  email: z.string().email(),
});

const UNAVAILABLE = {
  error: 'Login service temporarily unavailable. Please try again in a few minutes.',
};

// Same reply whether or not the email exists, so the form cannot be
// used to enumerate members.
const SENT = {
  success: true,
  message: 'If an account exists with that email, a login link has been sent.',
};

function logFailure(scope: string, error: unknown) {
  if (isMissingCohortTable(error)) {
    console.error(`[Rep Auth] ${scope}: cohort_members table missing. Apply drizzle/0018_cohort_members.sql.`);
  } else {
    console.error(`[Rep Auth] ${scope} failed:`, error instanceof Error ? error.message : error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Valid email required.' }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();
    const member = await findCohortMemberByEmail(email);

    if (!member || member.status !== 'Approved') {
      return NextResponse.json(SENT);
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    await setCohortMemberAuthToken(member.id, token, expiry);

    const origin = request.headers.get('origin') || 'https://www.beanumber.org';
    const loginUrl = `${origin}/rep/dashboard?token=${token}`;
    const firstName = member.name.split(' ')[0] || 'there';

    await sendEmail({
      to: { email, name: member.name },
      subject: 'Your BAN Rep Dashboard Login',
      text: `Hey ${firstName},\n\nHere's your login link for the BAN rep dashboard:\n\n${loginUrl}\n\nThis link expires in 30 minutes.\n\nKevin`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; padding: 32px; background: #FFF8F0;">
          <p style="color: #0d0d0d; font-size: 15px; line-height: 1.7;">
            Hey ${firstName},
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

    return NextResponse.json(SENT);
  } catch (error: unknown) {
    logFailure('POST', error);
    return NextResponse.json(UNAVAILABLE, { status: 503 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ error: 'Token required.' }, { status: 400 });
    }

    const member = await findCohortMemberByToken(token);
    if (!member) {
      return NextResponse.json({ error: 'Invalid or expired link.' }, { status: 401 });
    }

    if (isTokenExpired(member)) {
      return NextResponse.json({ error: 'Link expired. Request a new one.' }, { status: 401 });
    }

    if (member.status !== 'Approved') {
      return NextResponse.json({ error: 'Account not yet approved.' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      rep: publicCohortMember(member),
    });
  } catch (error: unknown) {
    logFailure('GET', error);
    return NextResponse.json(UNAVAILABLE, { status: 503 });
  }
}
