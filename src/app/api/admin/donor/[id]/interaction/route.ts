/**
 * Admin · Donor — log an interaction.
 *
 * POST /api/admin/donor/<id>/interaction
 *   Body: {
 *     subject?: string,
 *     direction?: 'outbound' | 'inbound',
 *     channel?: 'email' | 'phone' | 'text' | 'event' | 'other',
 *     notes?: string,
 *     at?: string (ISO),
 *     relatedTodayItem?: string,
 *   }
 *
 * Postgres model: there's no dedicated Interactions table — the
 * communications table absorbs every donor-side touch. We tag with
 * EmailType="Interaction · <channel>" and stuff direction + notes
 * into the subject so it's queryable. relatedDonorId points at the
 * Donor row.
 *
 * Auth: cookie or X-Admin-Token (admin).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { communications, donors } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const ALLOWED_DIRECTIONS = new Set(['outbound', 'inbound']);
const ALLOWED_CHANNELS = new Set(['email', 'phone', 'text', 'event', 'other']);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Invalid donor id' }, { status: 400 });
  }

  let body: {
    subject?: string;
    direction?: string;
    channel?: string;
    notes?: string;
    at?: string;
    relatedTodayItem?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const direction = ALLOWED_DIRECTIONS.has(body.direction || '')
    ? (body.direction as string)
    : 'outbound';
  const channel = ALLOWED_CHANNELS.has(body.channel || '')
    ? (body.channel as string)
    : 'email';
  const subject =
    typeof body.subject === 'string' && body.subject.trim()
      ? body.subject.trim()
      : direction === 'outbound'
        ? 'Reached out'
        : 'Heard from them';
  const notes = typeof body.notes === 'string' ? body.notes : '';
  const at =
    body.at && !Number.isNaN(Date.parse(body.at))
      ? new Date(body.at)
      : new Date();

  try {
    // Verify the donor exists and pull email so we can populate
    // recipientEmail (helps reverse-lookup queries).
    const donor = (
      await db
        .select({ id: donors.id, email: donors.email })
        .from(donors)
        .where(eq(donors.id, id))
        .limit(1)
    )[0];
    if (!donor) {
      return NextResponse.json({ error: 'Donor not found' }, { status: 404 });
    }

    // Append a notes line into the subject so it persists in a single
    // column. communications has no body column.
    const noteSuffix = notes ? ` — ${notes.slice(0, 240)}` : '';
    const fullSubject = `[${direction}] ${subject}${noteSuffix}`;

    const inserted = await db
      .insert(communications)
      .values({
        subject: fullSubject,
        emailType: `Interaction · ${channel}`,
        status: 'Logged',
        sendDate: at.toISOString().slice(0, 10),
        recipientEmail: donor.email,
        relatedDonorId: donor.id,
      })
      .returning({ id: communications.id });

    return NextResponse.json({
      ok: true,
      interactionId: inserted[0].id,
      subject,
      direction,
      channel,
      at: at.toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}
