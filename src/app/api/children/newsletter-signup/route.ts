/**
 * Newsletter-only signup from the /[number] reveal page (memo §2).
 *
 * Secondary, no-payment CTA below the sponsorship ask. Captures the
 * visitor's email so they get monthly campus updates without
 * committing to recurring billing. The whole point is that someone
 * who isn't ready to sponsor today can still stay in the loop, and
 * we can warm them up over time.
 *
 * Mechanic: upsert a Donors record by email, set Communication
 * Opt-In = true, mark a Notes line so we know the signup source.
 * No drip pipeline assignment yet — the existing pipelines are all
 * post-purchase. A future commit can expand the newsletter cron to
 * send to soft leads.
 *
 * Returns 200 on success (whether new record or existing one updated).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_DONORS_TABLE = process.env.AIRTABLE_DONORS_TABLE || 'Donors';

const headers = () => ({
  Authorization: `Bearer ${AIRTABLE_API_KEY}`,
  'Content-Type': 'application/json',
});

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

    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      console.error('[Newsletter Signup] Airtable credentials missing');
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    const lowered = email.toLowerCase().trim();
    const today = new Date().toISOString().split('T')[0];
    const noteLine = shirtNumber
      ? `Newsletter signup from /children/${shirtNumber}${
          childDisplayName ? ` (${childDisplayName})` : ''
        } on ${today}.`
      : `Newsletter signup on ${today}.`;

    // Look up existing donor by email (case-insensitive).
    const formula = `LOWER({Email Address}) = "${lowered}"`;
    const listUrl =
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONORS_TABLE}` +
      `?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`;
    const listRes = await fetch(listUrl, { headers: headers() });
    if (!listRes.ok) {
      console.error('[Newsletter Signup] Donor lookup failed', listRes.status);
      return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
    }
    const listData = await listRes.json();
    const existing = listData.records?.[0];

    if (existing) {
      // Update: ensure opt-in is true, append the source note.
      const existingNotes = (existing.fields?.Notes as string | undefined) || '';
      const mergedNotes = existingNotes.includes(noteLine)
        ? existingNotes
        : (existingNotes ? `${existingNotes}\n${noteLine}` : noteLine);
      const patchUrl =
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONORS_TABLE}/${existing.id}`;
      const patchRes = await fetch(patchUrl, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({
          fields: {
            'Communication Opt-In': true,
            Notes: mergedNotes,
          },
        }),
      });
      if (!patchRes.ok) {
        const body = await patchRes.text();
        console.error('[Newsletter Signup] Donor update failed', patchRes.status, body.slice(0, 300));
        return NextResponse.json({ error: 'Update failed' }, { status: 500 });
      }
      return NextResponse.json({ ok: true, updated: true });
    }

    // Create: minimal record, email + opt-in + source note.
    const createUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONORS_TABLE}`;
    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        fields: {
          'Email Address': lowered,
          'Communication Opt-In': true,
          Notes: noteLine,
        },
      }),
    });
    if (!createRes.ok) {
      const body = await createRes.text();
      console.error('[Newsletter Signup] Donor create failed', createRes.status, body.slice(0, 300));
      return NextResponse.json({ error: 'Create failed' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, created: true });
  } catch (error: any) {
    console.error('[Newsletter Signup] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Signup failed' },
      { status: 500 }
    );
  }
}
