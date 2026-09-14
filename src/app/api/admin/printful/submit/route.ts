/**
 * POST /api/admin/printful/submit  { fulfillmentId }
 *
 * Retry a Printful row that failed to submit (or never did). Same
 * orchestrator the Stripe webhook uses. Auth: cookie or X-Admin-Token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { submitPrintfulOrder } from '@/lib/printful/orders';

export async function POST(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: { fulfillmentId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const id = typeof body.fulfillmentId === 'string' ? body.fulfillmentId : '';
  if (!id) return NextResponse.json({ error: 'fulfillmentId is required' }, { status: 400 });

  const result = await submitPrintfulOrder(id);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
