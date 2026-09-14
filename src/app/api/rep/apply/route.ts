/**
 * POST /api/rep/apply
 *
 * Founding Cohort application from /rep. Writes a cohort_members row
 * (Postgres) and emails Kevin. Until 2026-09-14 this wrote an Airtable
 * "Reps" table; the base is retired so every application had been
 * returning 503.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmail } from '@/lib/email';
import {
  createCohortMember,
  findCohortMemberByEmail,
  isMissingCohortTable,
} from '@/lib/cohort-members';

const applySchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  phone: z.string().max(20).optional().default(''),
  school: z.string().max(255).optional().default(''),
  organization: z.string().max(255).optional().default(''),
  why: z.string().min(10).max(2000),
  first_five: z.string().min(10).max(2000).optional().default(''),
  how_heard: z.string().max(500).optional().default(''),
});

const UNAVAILABLE = {
  error: 'Application service temporarily unavailable. Please try again in a few minutes.',
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function POST(request: NextRequest) {
  try {
    const parsed = applySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map(i => i.message).join('; ') },
        { status: 400 }
      );
    }

    const { name, email, phone, school, organization, why, first_five, how_heard } = parsed.data;

    // Referral code: first name + random 4 chars. Rides checkout
    // metadata as "[Ref: code]" in the donation note.
    const firstName = name.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '');
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    const refCode = `${firstName}-${randomSuffix}`;

    const existing = await findCohortMemberByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: 'An application with this email already exists. If you need to update your application, email kevin@beanumber.org.' },
        { status: 409 }
      );
    }

    await createCohortMember({
      name,
      email,
      phone,
      school,
      organization,
      why,
      firstFive: first_five,
      howHeard: how_heard,
      refCode,
    });

    // Send notification to Kevin
    try {
      await sendEmail({
        to: { email: 'kevin@beanumber.org', name: 'Kevin Hershock' },
        subject: `Cohort Application: ${name}`,
        text: `New Founding Cohort application.\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone || 'N/A'}\nSchool/Church: ${school || 'N/A'}\nOrganization: ${organization || 'N/A'}\nRef Code: ${refCode}\n\nWhy they want to go:\n${why}\n\nFirst 5 people they'd invite to sponsor:\n${first_five || 'N/A'}\n\nHow they heard about BAN: ${how_heard || 'N/A'}`,
        html: `
          <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; padding: 32px; background: #FFF8F0;">
            <p style="color: #D4A843; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.2em;">Founding Cohort Application</p>
            <h2 style="font-family: Georgia, serif; color: #0d0d0d; margin: 16px 0 8px;">${escapeHtml(name)}</h2>
            <p style="color: #555; font-size: 14px; line-height: 1.6;">
              <strong>Email:</strong> ${escapeHtml(email)}<br/>
              <strong>Phone:</strong> ${escapeHtml(phone || 'N/A')}<br/>
              <strong>School/Church:</strong> ${escapeHtml(school || 'N/A')}<br/>
              <strong>Organization:</strong> ${escapeHtml(organization || 'N/A')}<br/>
              <strong>Ref Code:</strong> ${refCode}
            </p>
            <p style="color: #0d0d0d; font-size: 14px; line-height: 1.6; margin-top: 16px;"><strong>Why they want to go:</strong></p>
            <p style="color: #555; font-size: 14px; line-height: 1.6;">${escapeHtml(why)}</p>
            ${first_five ? `<p style="color: #0d0d0d; font-size: 14px; line-height: 1.6; margin-top: 16px;"><strong>First 5 they'd invite:</strong></p><p style="color: #555; font-size: 14px; line-height: 1.6;">${escapeHtml(first_five)}</p>` : ''}
            <p style="color: #777; font-size: 13px; margin-top: 16px;">How they heard about BAN: ${escapeHtml(how_heard || 'N/A')}</p>
            <p style="color: #777; font-size: 13px; margin-top: 16px;">Approve by setting status = 'Approved' on the cohort_members row; the applicant can then sign in at /rep/dashboard.</p>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error('[Rep Apply] Admin notification email failed:', emailErr);
      // Don't fail the application if the notification email fails
    }

    return NextResponse.json({
      success: true,
      message: 'Application submitted. Kevin will be in touch.',
    });
  } catch (error: unknown) {
    if (isMissingCohortTable(error)) {
      console.error('[Rep Apply] cohort_members table missing. Apply drizzle/0018_cohort_members.sql.');
    } else {
      console.error('[Rep Apply] Failed:', error instanceof Error ? error.message : error);
    }
    return NextResponse.json(UNAVAILABLE, { status: 503 });
  }
}
