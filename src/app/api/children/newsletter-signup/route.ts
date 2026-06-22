/**
 * Newsletter-only signup from the /[number] reveal page (memo §2).
 *
 * Secondary, no-payment CTA below the sponsorship ask. Captures the
 * visitor's email so they get monthly campus updates without
 * committing to recurring billing. The whole point is that someone
 * who isn't ready to sponsor today can still stay in the loop, and
 * we can warm them up over time.
 *
 * Mechanic: upsert a Donors record by email, set communicationOptIn
 * = true, append a Notes line so we know the signup source. No drip
 * pipeline assignment yet — the existing pipelines are all
 * post-purchase. A future commit can expand the newsletter cron to
 * send to soft leads.
 *
 * Returns 200 on success (whether new record or existing one updated).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDonorByEmail } from '@/lib/db/queries';
import { upsertDonorByEmail } from '@/lib/db/mutations';

const signupSchema = z.object({
  email: z.string().email().max(255),
  shirtNumber: z.number().int().positive().optional(),
  childDisplayName: z.string().max(255).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = signupSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map(i => i.message).join('; ') },
        { status: 400 }
      );
    }
    const { email, shirtNumber, childDisplayName } = parsed.data;

    const lowered = email.toLowerCase().trim();
    const today = new Date().toISOString().split('T')[0];
    const noteLine = shirtNumber
      ? `Newsletter signup from /children/${shirtNumber}${
          childDisplayName ? ` (${childDisplayName})` : ''
        } on ${today}.`
      : `Newsletter signup on ${today}.`;

    const existing = await getDonorByEmail(lowered);

    if (existing) {
      // Update: ensure opt-in is true, append the source note (dedup
      // so we don't blow up the Notes column with repeat signups).
      const existingNotes = existing.notes || '';
      const mergedNotes = existingNotes.includes(noteLine)
        ? existingNotes
        : existingNotes
          ? `${existingNotes}\n${noteLine}`
          : noteLine;

      await upsertDonorByEmail({
        email: existing.email,
        communicationOptIn: true,
        notes: mergedNotes,
      });
      return NextResponse.json({ ok: true, updated: true });
    }

    // Create: minimal record, email + opt-in + source note.
    await upsertDonorByEmail({
      email: lowered,
      communicationOptIn: true,
      notes: noteLine,
    });
    return NextResponse.json({ ok: true, created: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Signup failed';
    console.error('[Newsletter Signup] Error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
