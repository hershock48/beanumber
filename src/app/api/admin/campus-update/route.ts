/**
 * Admin · Campus update — Simon's monthly newsletter draft.
 *
 * GET /api/admin/campus-update
 *   Returns this month's draft Newsletter (matched by deterministic
 *   title "Campus update — <Month> <Year>") or `{ exists: false }`.
 *
 * POST /api/admin/campus-update
 *   Body: { body: string, photo?: { filename, contentType, data (base64) } }
 *   Creates or updates this month's draft. status='Draft', author
 *   set from session role.
 *
 *   The Airtable era stamped a LastEditedBySimon timestamp for Kevin's
 *   review banner; Postgres schema has no equivalent column on
 *   newsletters, so that signal is dropped under the migration (Simon
 *   and Kevin both write directly; Kevin polishes in the full editor).
 *
 * Kevin polishes the draft over in /admin/newsletter where the full
 * editor lives. This endpoint is minimal — body + photo are all
 * Simon needs to give.
 *
 * Auth: cookie or X-Admin-Token (either role).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { getAdminRole } from '@/lib/admin-session';
import { db } from '@/lib/db/client';
import { newsletters } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { uploadAttachment } from '@/lib/storage';

const MAX_PHOTO_BASE64_BYTES = 5 * 1024 * 1024;

function buildMonthTitle(d: Date): string {
  const month = d.toLocaleString('en-US', { month: 'long' });
  return `Campus update — ${month} ${d.getFullYear()}`;
}

async function findThisMonthDraft() {
  const title = buildMonthTitle(new Date());
  const rows = await db
    .select()
    .from(newsletters)
    .where(eq(newsletters.title, title))
    .limit(1);
  return rows[0] || null;
}

// ───────────────────────── GET ─────────────────────────

export async function GET(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const rec = await findThisMonthDraft();
    if (!rec) {
      return NextResponse.json({
        exists: false,
        title: buildMonthTitle(new Date()),
      });
    }
    return NextResponse.json({
      exists: true,
      recordId: rec.id,
      title: rec.title,
      body: rec.bodyHtml || '',
      heroPhotoUrl: rec.heroPhotoUrl || null,
      status: rec.status || 'Draft',
      // Preserved for client compat; under the Postgres schema there's
      // no per-author edit timestamp, so we always return null.
      lastEditedBySimon: null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}

// ───────────────────────── POST ─────────────────────────

export async function POST(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    body?: string;
    photo?: {
      filename: string;
      contentType: string;
      data: string;
    };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const text = typeof body.body === 'string' ? body.body : '';
  const role = await getAdminRole();
  const now = new Date();
  const title = buildMonthTitle(now);

  try {
    let recordId: string;
    const existing = await findThisMonthDraft();
    const isCreate = !existing;

    if (existing) {
      recordId = existing.id;
      await db
        .update(newsletters)
        .set({ bodyHtml: text, updatedAt: now })
        .where(eq(newsletters.id, recordId));
    } else {
      const inserted = await db
        .insert(newsletters)
        .values({
          title,
          subject: `${now.toLocaleString('en-US', { month: 'long' })} ${now.getFullYear()} from the campus`,
          bodyHtml: text,
          status: 'Draft',
          author: role === 'simon' ? 'Simon (campus)' : 'Kevin',
        })
        .returning({ id: newsletters.id });
      recordId = inserted[0].id;
    }

    // Optional photo attach — only if client sent one.
    if (body.photo?.filename && body.photo.contentType && body.photo.data) {
      if (body.photo.data.length > MAX_PHOTO_BASE64_BYTES) {
        return NextResponse.json(
          { error: 'Photo too large (max ~3.7 MB). Compress and retry.' },
          { status: 413 }
        );
      }
      const result = await uploadAttachment({
        kind: 'campus-update',
        scope: recordId,
        filename: body.photo.filename,
        contentType: body.photo.contentType,
        data: body.photo.data,
      });
      await db
        .update(newsletters)
        .set({ heroPhotoUrl: result.publicUrl, updatedAt: new Date() })
        .where(eq(newsletters.id, recordId));
    }

    return NextResponse.json({
      ok: true,
      recordId,
      created: isCreate,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}
