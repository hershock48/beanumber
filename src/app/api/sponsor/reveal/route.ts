/**
 * Sponsor "reveal" endpoint.
 *
 * The entire product premise of Be A Number is that a buyer meets their
 * child in the physical-shirt-arrival moment: they open the package, see a
 * number on the tag, type it into beanumber.org, and a real kid looks
 * back. The sponsor portal must respect that ritual — we do not show the
 * child in the portal until the sponsor has actually seen their number.
 *
 * This endpoint records that moment. It is called in two places:
 *
 *   1. Silently (fire-and-forget) from /children/[number]/page.tsx when
 *      the visitor is a logged-in sponsor and the number on the page
 *      matches their assignment. This is the happy path: shirt arrives,
 *      sponsor types in their number, page loads, portal unlocks.
 *
 *   2. Explicitly from the sponsor dashboard, via a "reveal anyway"
 *      button, when the sponsor has lost their shirt or just wants to
 *      break the surprise early. They've made an informed choice.
 *
 * In both cases we require a valid sponsor_session cookie. We never let
 * an unauthenticated request flip the flag.
 *
 * Data layer: queries.ts + mutations.ts on Postgres. revealChildToSponsor
 * is idempotent &mdash; safe to call repeatedly from the beacon.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSponsorshipWithChildBySponsorCode } from '@/lib/db/queries';
import { revealChildToSponsor } from '@/lib/db/mutations';

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
    // --- Look up sponsorship (with linked kid hydrated) ------------
    const sponsorship = await getSponsorshipWithChildBySponsorCode(
      session.sponsorCode
    );
    if (!sponsorship) {
      return NextResponse.json(
        { revealed: false, reason: 'no_sponsorship' },
        { status: 200 }
      );
    }

    // If already revealed, no-op. This keeps the endpoint idempotent so
    // the beacon on /children/[n] is safe to call on every visit.
    if (sponsorship.childRevealedAt) {
      return NextResponse.json(
        {
          revealed: true,
          revealedAt: new Date(sponsorship.childRevealedAt).toISOString(),
          noop: true,
        },
        { status: 200 }
      );
    }

    // --- Optional number-match check -------------------------------
    // Only enforced when the caller supplied a number (the beacon on
    // /children/[n] does). The portal "reveal anyway" path passes no
    // number and skips this check.
    if (requestedNumber !== null) {
      const assignedNumber = sponsorship.childShirtNumber;
      if (assignedNumber === null || assignedNumber === undefined) {
        return NextResponse.json(
          { revealed: false, reason: 'no_child_link' },
          { status: 200 }
        );
      }
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
    const updated = await revealChildToSponsor(sponsorship.sponsorshipId);
    if (!updated) {
      // The sponsorship vanished between the lookup and the mutation
      // (vanishingly rare — admin delete, race condition). Soft-fail.
      return NextResponse.json(
        { revealed: false, reason: 'sponsorship_missing_on_update' },
        { status: 200 }
      );
    }
    const revealedAt = updated.childRevealedAt
      ? new Date(updated.childRevealedAt).toISOString()
      : new Date().toISOString();
    return NextResponse.json(
      { revealed: true, revealedAt, noop: false },
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
