/**
 * POST /api/sponsor/choose-replacement — RETIRED.
 *
 * The chooser flow (sponsor picks one of 3 candidate kids when their
 * own kid departs) was retired in June 2026. Departure now uses
 * auto-reveal: the admin endpoint (/api/admin/roster/stage-candidates,
 * legacy URL, new behavior) picks ONE replacement for all sponsors of
 * the departing kid and reassigns each Sponsorship at the source. The
 * RevealOverlay on /[N] fires the &ldquo;meet your new kid&rdquo; moment
 * automatically on the next visit.
 *
 * See core_model.md §0b for the model rationale: humans don&rsquo;t pick
 * kids, the Number picks. A chooser UI contradicted that. Replacing
 * it with auto-reveal also removes a brittle data path
 * (PendingCandidateChildIDs blob fan-out) and gives us a second
 * reveal moment for sponsors — same magic as the first time.
 *
 * The route stays at this URL returning 410 Gone in case any stale
 * client (an in-flight email link, a bookmarked tab) POSTs to it.
 * The 410 + error message tells the client the page they came from
 * is stale and to refresh.
 */

import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error:
        'The chooser flow has been retired. Departure now auto-reveals a new kid for your Number — refresh your page and the new kid will be waiting.',
    },
    { status: 410 }
  );
}
