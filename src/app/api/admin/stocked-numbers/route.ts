/**
 * Stocked numbers: every number Kevin has ever printed on an in-house
 * tee. The Printful assigner never issues one of these.
 *
 * GET  /api/admin/stocked-numbers            { numbers: number[] }
 * PUT  /api/admin/stocked-numbers            { text: "1-53, 60, 62" } or { numbers: [...] }
 *
 * PUT replaces the whole list. Auth: cookie or X-Admin-Token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { listStockedNumbers, parseNumberList, replaceStockedNumbers } from '@/lib/shirt-numbers';

export async function GET(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const numbers = await listStockedNumbers();
    return NextResponse.json({ numbers });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: { text?: unknown; numbers?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const numbers = Array.isArray(body.numbers)
    ? (body.numbers as unknown[]).map(n => Number(n))
    : typeof body.text === 'string'
      ? parseNumberList(body.text)
      : null;
  if (!numbers) {
    return NextResponse.json({ error: 'Send { text } or { numbers }' }, { status: 400 });
  }
  try {
    const saved = await replaceStockedNumbers(numbers);
    return NextResponse.json({ numbers: saved, count: saved.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
