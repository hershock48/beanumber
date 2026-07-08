/**
 * POST /api/admin/push/kevin-share
 *
 * The admin-only endpoint Kevin hits when he wants to send one
 * personal push to a single sponsor — "here's a photo from the
 * campus", "this thing I saw made me think of you", etc.
 *
 * The kevinShare event is fenced hard in src/lib/push/send.ts:
 *   - single recipient only (multi-recipient becomes a newsletter)
 *   - 12h spacing per recipient
 *   - never templated by the client (title / body are fixed strings
 *     inside send.ts)
 *
 * Body:
 *   {
 *     recipientEmail: string,   // the sponsor whose device receives
 *     deepLink: string,         // /children/[N], /newsletter/[id],
 *                               // /me, or an external URL Kevin
 *                               // wants opened
 *     shareId?: string          // stable id for the share so
 *                               // repeated taps land on the same
 *                               // notification thread (optional)
 *   }
 *
 * Auth: admin only. Kevin's role, not Simon's — this is Kevin's
 * personal channel.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminRole } from '@/lib/admin-session';
import { sendPush, resolveMobileUserIdForEmail } from '@/lib/push/send';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const role = await getAdminRole();
  if (role !== 'admin') {
    return NextResponse.json(
      { error: 'kevinShare is admin-only' },
      { status: 401 }
    );
  }

  let body: {
    recipientEmail?: string;
    deepLink?: string;
    shareId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const recipientEmail = (body.recipientEmail ?? '').trim().toLowerCase();
  const deepLink = (body.deepLink ?? '').trim();
  if (!recipientEmail || !deepLink) {
    return NextResponse.json(
      { error: 'recipientEmail and deepLink are required' },
      { status: 400 }
    );
  }

  const userId = await resolveMobileUserIdForEmail(recipientEmail);
  if (!userId) {
    return NextResponse.json(
      { error: 'No mobile user matches that email' },
      { status: 404 }
    );
  }

  const result = await sendPush({
    kind: 'kevinShare',
    recipientUserId: userId,
    deepLink,
    shareId: body.shareId,
  });

  logger.info('[admin/push/kevin-share]', { recipientEmail, deepLink, result });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason || 'send failed', ...result },
      { status: 409 }
    );
  }
  return NextResponse.json({ ...result, ok: true });
}

export const dynamic = 'force-dynamic';
