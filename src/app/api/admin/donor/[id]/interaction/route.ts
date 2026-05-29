/**
 * Admin · Donor — log an interaction.
 *
 * POST /api/admin/donor/<id>/interaction
 *   Body: {
 *     subject?: string,
 *     direction?: 'outbound' | 'inbound',
 *     channel?: 'email' | 'phone' | 'text' | 'event' | 'other',
 *     notes?: string,
 *     at?: string (ISO),
 *     relatedTodayItem?: string,
 *   }
 *
 * Creates an Interactions row linked to the donor. All fields
 * optional — minimum is just the donor id from the URL, which means
 * a one-click "Mark contacted" call defaults to:
 *   - direction = outbound
 *   - channel = email
 *   - subject = "Reached out"
 *   - at = now
 *
 * The "Add interaction" form provides explicit values.
 *
 * Auth: cookie or X-Admin-Token (admin only).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY =
  process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';
const INTERACTIONS_TABLE =
  process.env.AIRTABLE_INTERACTIONS_TABLE || 'Interactions';

const F = {
  subject: 'fldlqqv1NK1oTU6FV',
  donor: 'fldnII8EQzgZBUksB',
  direction: 'fldp59ikGDl16VtRN',
  channel: 'fldskE86vHE2dKPSL',
  notes: 'fldao80pSvvtzS5MF',
  at: 'fldN6i1VRSq1e9rRS',
  loggedBy: 'fldvuxp4H8PgnHY1Q',
  relatedTodayItem: 'fldueKWnzK6Zl9P4c',
};

const ALLOWED_DIRECTIONS = new Set(['outbound', 'inbound']);
const ALLOWED_CHANNELS = new Set(['email', 'phone', 'text', 'event', 'other']);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  if (!id || !id.startsWith('rec')) {
    return NextResponse.json({ error: 'Invalid donor id' }, { status: 400 });
  }

  let body: {
    subject?: string;
    direction?: string;
    channel?: string;
    notes?: string;
    at?: string;
    relatedTodayItem?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const direction = ALLOWED_DIRECTIONS.has(body.direction || '')
    ? (body.direction as string)
    : 'outbound';
  const channel = ALLOWED_CHANNELS.has(body.channel || '')
    ? (body.channel as string)
    : 'email';
  const subject =
    typeof body.subject === 'string' && body.subject.trim()
      ? body.subject.trim()
      : direction === 'outbound'
        ? 'Reached out'
        : 'Heard from them';
  const notes = typeof body.notes === 'string' ? body.notes : '';
  const at = body.at && !Number.isNaN(Date.parse(body.at)) ? body.at : new Date().toISOString();
  const relatedTodayItem =
    typeof body.relatedTodayItem === 'string' ? body.relatedTodayItem : '';

  const fields: Record<string, unknown> = {
    [F.subject]: subject,
    [F.donor]: [id],
    [F.direction]: direction,
    [F.channel]: channel,
    [F.at]: at,
    [F.loggedBy]: 'Kevin',
  };
  if (notes) fields[F.notes] = notes;
  if (relatedTodayItem) fields[F.relatedTodayItem] = relatedTodayItem;

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    INTERACTIONS_TABLE
  )}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields, typecast: true }),
  });
  if (!res.ok) {
    return NextResponse.json(
      { error: `Airtable create failed: ${res.status} ${await res.text()}` },
      { status: 502 }
    );
  }
  const created = await res.json();
  return NextResponse.json({
    ok: true,
    interactionId: created.id,
    subject,
    direction,
    channel,
    at,
  });
}
