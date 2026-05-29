/**
 * Admin · Campus update — Simon's monthly newsletter draft.
 *
 * GET /api/admin/campus-update
 *   Returns this month's draft Newsletter (the one tagged with the
 *   current MonthKey), or `{ exists: false }` if there isn't one yet.
 *
 * POST /api/admin/campus-update
 *   Body: { body: string, photo?: { filename, contentType, data (base64) } }
 *   Creates or updates this month's draft. The Newsletter row uses
 *   a deterministic Title ("Campus update — May 2026"), Status="Draft",
 *   Author=role, and the LastEditedBySimon flag set to NOW when the
 *   caller is Simon.
 *
 *   If a photo is included, it gets posted to the HeroPhoto field
 *   via Airtable's content upload endpoint.
 *
 * Kevin polishes the draft over in /admin/newsletter where the full
 * editor lives (subject, teaser, send, etc.). This endpoint is
 * intentionally minimal — body + photo are all Simon needs to give.
 *
 * Auth: admin cookie OR X-Admin-Token (either role).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { getAdminRole } from '@/lib/admin-session';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY =
  process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';
const NEWSLETTERS_TABLE =
  process.env.AIRTABLE_NEWSLETTERS_TABLE || 'Newsletters';

// Field IDs (kept stable against UI renames).
const F = {
  title: 'fldOWGywPoRjVeL5u',
  subject: 'fldmLyYnyBUxsKbXe',
  bodyHtml: 'fldeZmBFjv5b7dkxE',
  heroPhoto: 'fld3pQyWeRgfCOoaJ',
  status: 'fldHfQz2SqVehFXjo',
  author: 'fld2QFFT0sucXNgGD',
  lastEditedBySimon: 'fldBVOTA9T7UdQj2G',
};

const MAX_PHOTO_BASE64_BYTES = 5 * 1024 * 1024;

function atHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

/**
 * "Campus update — May 2026" — used as the unique key for finding
 * or creating the current month's draft.
 */
function buildMonthTitle(d: Date): string {
  const month = d.toLocaleString('en-US', { month: 'long' });
  return `Campus update — ${month} ${d.getFullYear()}`;
}

/**
 * Fetches this month's Newsletter row (matched by Title). Returns
 * the raw Airtable record or null.
 */
async function fetchThisMonthDraft(): Promise<{
  id: string;
  fields: Record<string, unknown>;
} | null> {
  const title = buildMonthTitle(new Date());
  const formula = encodeURIComponent(`{Title}="${title.replace(/"/g, '\\"')}"`);
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    NEWSLETTERS_TABLE
  )}?filterByFormula=${formula}&maxRecords=1`;
  const res = await fetch(url, { headers: atHeaders(), cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Lookup failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const rec = data.records?.[0];
  return rec ? { id: rec.id as string, fields: rec.fields || {} } : null;
}

// ───────────────────────── GET ─────────────────────────

export async function GET(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const rec = await fetchThisMonthDraft();
    if (!rec) {
      return NextResponse.json({
        exists: false,
        title: buildMonthTitle(new Date()),
      });
    }
    const f = rec.fields;
    const heroArr = (f.HeroPhoto as Array<{ url: string; thumbnails?: { large?: { url: string } } }>) || [];
    const heroUrl = heroArr[0]?.thumbnails?.large?.url || heroArr[0]?.url || null;
    return NextResponse.json({
      exists: true,
      recordId: rec.id,
      title: (f.Title as string) || '',
      body: (f.BodyHTML as string) || '',
      heroPhotoUrl: heroUrl,
      status: (f.Status as string) || 'Draft',
      lastEditedBySimon: (f.LastEditedBySimon as string) || null,
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
      data: string; // base64, no data: prefix
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
    // Find or create the current-month row.
    let recordId: string;
    const existing = await fetchThisMonthDraft();
    const isCreate = !existing;

    const patchFields: Record<string, unknown> = {
      [F.bodyHtml]: text,
    };
    // Only Simon sets LastEditedBySimon. Kevin's edits don't trigger
    // his own review banner.
    if (role === 'simon') {
      patchFields[F.lastEditedBySimon] = now.toISOString();
    }

    if (existing) {
      recordId = existing.id;
      const patchUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        NEWSLETTERS_TABLE
      )}/${recordId}`;
      const res = await fetch(patchUrl, {
        method: 'PATCH',
        headers: atHeaders(),
        body: JSON.stringify({ fields: patchFields }),
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: `Update failed: ${res.status} ${await res.text()}` },
          { status: 502 }
        );
      }
    } else {
      // New draft — seed Title, Subject, Status, Author too.
      const createFields: Record<string, unknown> = {
        ...patchFields,
        [F.title]: title,
        [F.subject]: `${now.toLocaleString('en-US', { month: 'long' })} ${now.getFullYear()} from the campus`,
        [F.status]: 'Draft',
        [F.author]: role === 'simon' ? 'Simon (campus)' : 'Kevin',
      };
      const createUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        NEWSLETTERS_TABLE
      )}`;
      const res = await fetch(createUrl, {
        method: 'POST',
        headers: atHeaders(),
        body: JSON.stringify({ fields: createFields, typecast: true }),
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: `Create failed: ${res.status} ${await res.text()}` },
          { status: 502 }
        );
      }
      const created = await res.json();
      recordId = created.id;
    }

    // Optional photo attach — only if the client sent one.
    if (body.photo?.filename && body.photo.contentType && body.photo.data) {
      if (body.photo.data.length > MAX_PHOTO_BASE64_BYTES) {
        return NextResponse.json(
          { error: 'Photo too large (max ~3.7 MB). Compress and retry.' },
          { status: 413 }
        );
      }
      const uploadUrl = `https://content.airtable.com/v0/${AIRTABLE_BASE_ID}/${recordId}/${F.heroPhoto}/uploadAttachment`;
      const upRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: atHeaders(),
        body: JSON.stringify({
          contentType: body.photo.contentType,
          filename: body.photo.filename,
          file: body.photo.data,
        }),
      });
      if (!upRes.ok) {
        return NextResponse.json(
          { error: `Photo upload failed: ${upRes.status} ${await upRes.text()}` },
          { status: 502 }
        );
      }
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
