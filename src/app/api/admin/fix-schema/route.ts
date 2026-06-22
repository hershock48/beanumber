/**
 * Historical one-time tool for adding singleSelect options to the
 * Airtable Child Updates table. Under the Postgres model, status fields
 * are plain text and "adding an option" doesn't exist — app-level Zod
 * validation enforces values. This route is kept as a stub so old
 * bookmarks / docs don't 404, but it no longer does anything.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  requireAdminAuth(request);
  return NextResponse.json({
    ok: true,
    message:
      'Schema fixes are not needed under the Postgres data model. Status fields are plain text validated in app code.',
  });
}
