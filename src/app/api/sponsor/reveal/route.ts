import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// Sponsor "reveal" endpoint.
//
// The entire product premise of Be A Number is that a buyer meets their
// child in the physical-shirt-arrival moment: they open the package, see a
// number on the tag, type it into beanumber.org, and a real kid looks
// back. The sponsor portal must respect that ritual — we do not show the
// child in the portal until the sponsor has actually seen their number.
//
// This endpoint records that moment. It is called in two places:
//
//   1. Silently (fire-and-forget) from /children/[number]/page.tsx when
//      the visitor is a logged-in sponsor and the number on the page
//      matches their assignment. This is the happy path: shirt arrives,
//      sponsor types in their number, page loads, portal unlocks.
//
//   2. Explicitly from the sponsor dashboard, via a "reveal anyway"
//      button, when the sponsor has lost their shirt or just wants to
//      break the surprise early. They've made an informed choice.
//
// In both cases we require a valid sponsor_session cookie. We never let
// an unauthenticated request flip the flag.

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_SPONSORSHIPS_TABLE =
  process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships';
const AIRTABLE_CHILDREN_TABLE =
  process.env.AIRTABLE_CHILDREN_TABLE || 'Children';

interface SponsorSession {
  sponsorCode: string;
  email: string;
  expires: string;
}

async function readSession(): Promise<SponsorSession | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('sponsor_session');
  if (!sessionCookie) return null;

  try {
    const session = JSON.parse(sessionCookie.value) as SponsorSession;
    if (new Date(session.expires) < new Date()) return null;
    return session;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  // ------------------------------------------------------------------
  // Auth gate. If there's no valid sponsor session, do nothing.
  // We return 200 with {revealed: false, reason: 'no_session'} rather
  // than 401 because the beacon on /children/[n] fires for every visitor
  // and we don't want to pollute logs or alarm clients.
  // ------------------------------------------------------------------
  const session = await readSession();
  if (!session) {
    return NextResponse.json(
      { revealed: false, reason: 'no_session' },
      { status: 200 }
    );
  }

  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    return NextResponse.json(
      { error: 'Airtable not configured' },
      { status: 500 }
    );
  }

  // ------------------------------------------------------------------
  // Parse optional { number } from the body. When present, we verify it
  // matches the sponsor's assigned child's ShirtNumber. When absent, we
  // treat the call as a "reveal anyway" from the portal (no match check).
  // ------------------------------------------------------------------
  let requestedNumber: number | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    if (body && typeof body.number !== 'undefined') {
      const n = Number(body.number);
      if (Number.isFinite(n) && n > 0) requestedNumber = n;
    }
  } catch {
    // No body is fine — means this is a portal "reveal anyway" click.
  }

  try {
    // --- Look up sponsorship ---------------------------------------
    const sponsorshipFormula = `{SponsorCode} = "${session.sponsorCode}"`;
    const sponsorshipRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_SPONSORSHIPS_TABLE}?filterByFormula=${encodeURIComponent(sponsorshipFormula)}&maxRecords=1`,
      {
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      }
    );
    if (!sponsorshipRes.ok) {
      return NextResponse.json(
        { error: 'Sponsorship lookup failed' },
        { status: 500 }
      );
    }
    const sponsorshipData = await sponsorshipRes.json();
    const sponsorship = sponsorshipData.records?.[0];
    if (!sponsorship) {
      return NextResponse.json(
        { revealed: false, reason: 'no_sponsorship' },
        { status: 200 }
      );
    }

    const sponsorshipId: string = sponsorship.id;
    const alreadyRevealedAt = sponsorship.fields?.ChildRevealedAt as
      | string
      | undefined;

    // If already revealed, no-op. This keeps the endpoint idempotent so
    // the beacon on /children/[n] is safe to call on every visit.
    if (alreadyRevealedAt) {
      return NextResponse.json(
        { revealed: true, revealedAt: alreadyRevealedAt, noop: true },
        { status: 200 }
      );
    }

    // --- Optional number-match check -------------------------------
    // Only enforced when the caller supplied a number (the beacon on
    // /children/[n] does). The portal "reveal anyway" path passes no
    // number and skips this check.
    if (requestedNumber !== null) {
      // Look up the child record the sponsorship is linked to, get its
      // ShirtNumber, compare to the number on the URL.
      const childLinks = sponsorship.fields?.Children;
      const childRecordId = Array.isArray(childLinks) ? childLinks[0] : null;
      if (!childRecordId) {
        return NextResponse.json(
          { revealed: false, reason: 'no_child_link' },
          { status: 200 }
        );
      }
      const childRes = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_CHILDREN_TABLE}/${childRecordId}`,
        {
          headers: {
            Authorization: `Bearer ${AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
        }
      );
      if (!childRes.ok) {
        return NextResponse.json(
          { revealed: false, reason: 'child_lookup_failed' },
          { status: 200 }
        );
      }
      const childRecord = await childRes.json();
      const assignedNumber = Number(childRecord.fields?.ShirtNumber);
      if (
        !Number.isFinite(assignedNumber) ||
        assignedNumber !== requestedNumber
      ) {
        // Sponsor visited a child page that isn't theirs. That's fine —
        // they might be browsing — we just don't flip the reveal flag.
        return NextResponse.json(
          { revealed: false, reason: 'number_mismatch' },
          { status: 200 }
        );
      }
    }

    // --- Set ChildRevealedAt ---------------------------------------
    const nowIso = new Date().toISOString();
    const patchRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_SPONSORSHIPS_TABLE}/${sponsorshipId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: { ChildRevealedAt: nowIso },
        }),
      }
    );
    if (!patchRes.ok) {
      // If the field doesn't exist in Airtable yet (Kevin hasn't added
      // the column), we log and gracefully report "unavailable" so the
      // portal code can fall back to treating the sponsor as revealed.
      const body = await patchRes.text();
      console.warn('[sponsor/reveal] Failed to set ChildRevealedAt:', body);
      return NextResponse.json(
        {
          revealed: false,
          reason: 'airtable_patch_failed',
          detail: 'ChildRevealedAt field may not exist yet',
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { revealed: true, revealedAt: nowIso, noop: false },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('[sponsor/reveal] Error:', err);
    return NextResponse.json(
      { error: err?.message || 'Reveal failed' },
      { status: 500 }
    );
  }
}
