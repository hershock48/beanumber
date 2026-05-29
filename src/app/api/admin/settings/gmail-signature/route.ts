/**
 * POST /api/admin/settings/gmail-signature
 *   Body: { signature: string }
 *
 * Stores Kevin's email signature in AppSettings. Used by the Gmail
 * send pipeline to append to every outbound email.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { setSetting, SETTING_KEYS } from '@/lib/admin/settings';

export async function POST(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: { signature?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const signature = typeof body.signature === 'string' ? body.signature : '';
  try {
    await setSetting(
      SETTING_KEYS.gmailSignature,
      signature,
      'Plain-text signature appended to every email sent from the admin.'
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}
