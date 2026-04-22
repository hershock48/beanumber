import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
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

const applySchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  phone: z.string().max(20).optional().default(''),
  school: z.string().max(255).optional().default(''),
  organization: z.string().max(255).optional().default(''),
  why: z.string().min(10).max(2000),
  how_heard: z.string().max(500).optional().default(''),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = applySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map(i => i.message).join('; ') },
        { status: 400 }
      );
    }

    const { name, email, phone, school, organization, why, how_heard } = parsed.data;

    // Generate a unique referral code: first name + random 4 chars
    const firstName = name.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '');
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    const refCode = `${firstName}-${randomSuffix}`;

    // Check if this email already has an application
    const checkResponse = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${REPS_TABLE}?filterByFormula=${encodeURIComponent(`{Email}='${email}'`)}`,
      { headers: getAirtableHeaders() }
    );

    if (checkResponse.ok) {
      const checkData = await checkResponse.json();
      if (checkData.records && checkData.records.length > 0) {
        return NextResponse.json(
          { error: 'An application with this email already exists. If you need to update your application, email kevin@beanumber.org.' },
          { status: 409 }
        );
      }
    }

    // Create the rep record in Airtable
    const createResponse = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${REPS_TABLE}`,
      {
        method: 'POST',
        headers: getAirtableHeaders(),
        body: JSON.stringify({
          records: [
            {
              fields: {
                Name: name,
                Email: email.toLowerCase(),
                Phone: phone || undefined,
                School: school || undefined,
                Organization: organization || undefined,
                Why: why,
                HowHeard: how_heard || undefined,
                RefCode: refCode,
                Status: 'Applied',
                AppliedAt: new Date().toISOString(),
                ShirtsSold: 0,
                SponsorCount: 0,
              },
            },
          ],
        }),
      }
    );

    if (!createResponse.ok) {
      const errData = await createResponse.json().catch(() => ({}));
      console.error('[Rep Apply] Airtable error:', JSON.stringify(errData));
      return NextResponse.json(
        { error: 'Failed to submit application. Please try again.' },
        { status: 500 }
      );
    }

    // Send notification to Kevin
    try {
      await sendEmail({
        to: { email: 'kevin@beanumber.org', name: 'Kevin Hershock' },
        subject: `New Rep Application: ${name}`,
        text: `New ambassador application received.\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone || 'N/A'}\nSchool: ${school || 'N/A'}\nOrganization: ${organization || 'N/A'}\nRef Code: ${refCode}\n\nWhy they want to be a rep:\n${why}\n\nHow they heard about BAN: ${how_heard || 'N/A'}`,
        html: `
          <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; padding: 32px; background: #FFF8F0;">
            <p style="color: #D4A843; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.2em;">New Rep Application</p>
            <h2 style="font-family: Georgia, serif; color: #0d0d0d; margin: 16px 0 8px;">${name}</h2>
            <p style="color: #555; font-size: 14px; line-height: 1.6;">
              <strong>Email:</strong> ${email}<br/>
              <strong>Phone:</strong> ${phone || 'N/A'}<br/>
              <strong>School:</strong> ${school || 'N/A'}<br/>
              <strong>Organization:</strong> ${organization || 'N/A'}<br/>
              <strong>Ref Code:</strong> ${refCode}
            </p>
            <p style="color: #0d0d0d; font-size: 14px; line-height: 1.6; margin-top: 16px;"><strong>Why:</strong></p>
            <p style="color: #555; font-size: 14px; line-height: 1.6;">${why}</p>
            <p style="color: #777; font-size: 13px; margin-top: 16px;">How they heard about BAN: ${how_heard || 'N/A'}</p>
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
  } catch (error: any) {
    console.error('[Rep Apply] Error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
