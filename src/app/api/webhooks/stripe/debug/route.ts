import { NextResponse } from 'next/server';

// Diagnostic endpoint removed before launch. Was used during webhook
// debugging and is no longer needed.

export async function GET() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
