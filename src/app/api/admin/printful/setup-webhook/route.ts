/**
 * POST /api/admin/printful/setup-webhook
 *
 * Registers this site's Printful webhook URL (with the shared secret
 * in the query string) for the shipped / failed / hold / canceled /
 * updated events. Run once after PRINTFUL_API_KEY and
 * PRINTFUL_WEBHOOK_SECRET are set in Vercel; safe to run again, it
 * replaces the previous registration.
 *
 * GET returns what Printful currently has registered.
 * Auth: cookie or X-Admin-Token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { getWebhook, isPrintfulConfigured, setWebhook } from '@/lib/printful/client';

function webhookUrl(): string | null {
  const secret = process.env.PRINTFUL_WEBHOOK_SECRET;
  if (!secret) return null;
  const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org').replace(/\/$/, '');
  return `${site}/api/webhooks/printful?key=${encodeURIComponent(secret)}`;
}

export async function GET(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isPrintfulConfigured()) {
    return NextResponse.json({ error: 'PRINTFUL_API_KEY is not set' }, { status: 503 });
  }
  try {
    const current = await getWebhook();
    return NextResponse.json({ current, wanted: webhookUrl()?.replace(/key=[^&]+/, 'key=***') });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isPrintfulConfigured()) {
    return NextResponse.json({ error: 'PRINTFUL_API_KEY is not set' }, { status: 503 });
  }
  const url = webhookUrl();
  if (!url) {
    return NextResponse.json({ error: 'PRINTFUL_WEBHOOK_SECRET is not set' }, { status: 503 });
  }
  try {
    const result = await setWebhook(url);
    return NextResponse.json({ ok: true, registered: url.replace(/key=[^&]+/, 'key=***'), result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 502 });
  }
}
