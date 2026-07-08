/**
 * POST /api/mobile/v1/push/log-prompt
 *
 * Records that we asked the user for notification permission (or
 * that they answered). The client also enforces a local 60-day
 * cooldown, but a reinstall wipes local state — the server copy is
 * the durable one.
 *
 * Body:
 *   {
 *     kind: 'monthly-first-note' | 'holder-first-return',
 *     outcome?: 'granted' | 'declined'  // omit when just recording
 *                                       // the ask itself
 *   }
 *
 * Response: 200 { ok: true, id }
 * Auth: mobile bearer.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { pushPromptHistory } from '@/lib/db/schema';
import { requireMobileAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';

const ALLOWED_KINDS = new Set([
  'monthly-first-note',
  'holder-first-return',
]);
const ALLOWED_OUTCOMES = new Set(['granted', 'declined']);

export async function POST(request: NextRequest) {
  let viewer;
  try {
    viewer = await requireMobileAuth(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status: 401 });
  }

  let body: { kind?: string; outcome?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const kind = (body.kind ?? '').trim();
  if (!ALLOWED_KINDS.has(kind)) {
    return NextResponse.json(
      { error: `kind must be one of ${[...ALLOWED_KINDS].join(', ')}` },
      { status: 400 }
    );
  }
  const outcome = (body.outcome ?? '').trim();
  if (outcome && !ALLOWED_OUTCOMES.has(outcome)) {
    return NextResponse.json(
      { error: `outcome must be one of ${[...ALLOWED_OUTCOMES].join(', ')}` },
      { status: 400 }
    );
  }

  const inserted = await db
    .insert(pushPromptHistory)
    .values({
      userId: viewer.userId,
      kind,
      outcome: outcome || null,
    })
    .returning({ id: pushPromptHistory.id });

  logger.info('[push/log-prompt] recorded', {
    userId: viewer.userId,
    kind,
    outcome: outcome || null,
  });

  return NextResponse.json({ ok: true, id: inserted[0]?.id });
}

export const dynamic = 'force-dynamic';
