/**
 * POST /api/admin/roster/stage-candidates
 *   Body: { fromShirtNumber: number, candidateRecordIds?: string[] }
 *
 * Stages 3 replacement candidates onto every active sponsorship
 * tied to the kid at fromShirtNumber. Next time each sponsor visits
 * /[their #], they see the chooser instead of the regular profile.
 *
 * If candidateRecordIds isn't supplied, the system picks 3 kids
 * randomly from the same grade (active, not departed, not the
 * departing kid themselves). If the grade has fewer than 3 eligible
 * kids, picks from any grade. Order on disk is the order shown to
 * the sponsor.
 *
 * Admin only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { getAdminRole } from '@/lib/admin-session';
import { normalizeGrade } from '@/lib/admin/grade';
import { sendEmail } from '@/lib/email';
import { makeRecoveryToken } from '@/lib/recovery-tokens';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY =
  process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';
const CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';
const SPONSORSHIPS_TABLE =
  process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';

const F_SPONSORSHIPS = {
  pendingCandidateChildIDs: 'fldWZHlDz3fmu8YxS',
  pendingChoiceAt: 'fldg09iRhIkpOshTc',
};

function atHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

interface ChildFields {
  ShirtNumber?: number;
  GradeClass?: string;
  DepartedAt?: string;
}

interface ChildRecord {
  id: string;
  fields: ChildFields;
}

async function findKidByShirtNumber(n: number): Promise<ChildRecord | null> {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    CHILDREN_TABLE
  )}?filterByFormula=${encodeURIComponent(`{ShirtNumber}=${n}`)}&maxRecords=1`;
  const res = await fetch(url, { headers: atHeaders(), cache: 'no-store' });
  if (!res.ok) return null;
  const data = await res.json();
  return (data.records?.[0] as ChildRecord) || null;
}

async function listEligibleKids(
  excludeId: string
): Promise<ChildRecord[]> {
  const out: ChildRecord[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams();
    params.set('pageSize', '100');
    params.append('fields[]', 'ShirtNumber');
    params.append('fields[]', 'GradeClass');
    params.append('fields[]', 'DepartedAt');
    if (offset) params.set('offset', offset);
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      CHILDREN_TABLE
    )}?${params.toString()}`;
    const res = await fetch(url, { headers: atHeaders(), cache: 'no-store' });
    if (!res.ok) break;
    const data = await res.json();
    out.push(...((data.records || []) as ChildRecord[]));
    offset = data.offset;
  } while (offset);
  return out.filter(r => {
    const f = r.fields;
    if (r.id === excludeId) return false;
    if (typeof f.ShirtNumber !== 'number' || f.ShirtNumber < 1) return false;
    if (f.DepartedAt) return false;
    return true;
  });
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface AffectedSponsorship {
  id: string;
  sponsorEmail: string;
  sponsorCode: string;
  sponsorName: string;
}

/**
 * Find every Sponsorship currently linked to this child — active
 * monthly sponsors AND Holders (shirt-only number owners). All of
 * them get the chooser. The Holder additions June 2026 mean shirt
 * buyers who never went monthly are also part of the relationship
 * and deserve the pick experience when their kid leaves.
 */
async function findSponsorshipsForKid(
  childRecordId: string
): Promise<AffectedSponsorship[]> {
  const formula = `AND(
    FIND("${childRecordId}", ARRAYJOIN({Children}))>0,
    OR({Status}="Active", {Status}="Awaiting Sponsor", {Status}="Holder")
  )`.replace(/\s+/g, ' ');
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    SPONSORSHIPS_TABLE
  )}?filterByFormula=${encodeURIComponent(formula)}&pageSize=100`;
  const res = await fetch(url, { headers: atHeaders(), cache: 'no-store' });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.records || []).map((r: {
    id: string;
    fields?: {
      SponsorEmail?: string;
      SponsorCode?: string;
      SponsorName?: string;
    };
  }) => ({
    id: r.id,
    sponsorEmail: r.fields?.SponsorEmail || '',
    sponsorCode: r.fields?.SponsorCode || '',
    sponsorName: r.fields?.SponsorName || '',
  }));
}

export async function POST(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const role = (await getAdminRole()) || 'admin';
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  let body: {
    fromShirtNumber?: number;
    candidateRecordIds?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const fromShirtNumber = body.fromShirtNumber;
  if (
    typeof fromShirtNumber !== 'number' ||
    !Number.isInteger(fromShirtNumber) ||
    fromShirtNumber < 1
  ) {
    return NextResponse.json(
      { error: 'fromShirtNumber must be a positive integer' },
      { status: 400 }
    );
  }

  const departing = await findKidByShirtNumber(fromShirtNumber);
  if (!departing) {
    return NextResponse.json(
      { error: `No kid at shirt #${fromShirtNumber}` },
      { status: 404 }
    );
  }

  let candidates: string[];
  if (Array.isArray(body.candidateRecordIds) && body.candidateRecordIds.length > 0) {
    candidates = body.candidateRecordIds.filter(
      id => typeof id === 'string' && id.startsWith('rec')
    );
  } else {
    // Auto-pick 3 from same grade. If fewer than 3, pad from any grade.
    const allEligible = await listEligibleKids(departing.id);
    const targetGradeKey = normalizeGrade(departing.fields.GradeClass).key;
    const sameGrade = shuffle(
      allEligible.filter(
        r => normalizeGrade(r.fields.GradeClass).key === targetGradeKey
      )
    );
    const others = shuffle(
      allEligible.filter(
        r => normalizeGrade(r.fields.GradeClass).key !== targetGradeKey
      )
    );
    candidates = [...sameGrade, ...others].slice(0, 3).map(r => r.id);
  }

  if (candidates.length === 0) {
    return NextResponse.json(
      { error: 'No eligible candidates on the roster.' },
      { status: 409 }
    );
  }

  const sponsorships = await findSponsorshipsForKid(departing.id);
  if (sponsorships.length === 0) {
    return NextResponse.json({
      ok: true,
      staged: 0,
      candidates,
      note: 'No active sponsorships on this kid — nothing to stage.',
    });
  }

  const candidateBlob = candidates.join('\n');
  const stagedAt = new Date().toISOString();
  for (const s of sponsorships) {
    await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        SPONSORSHIPS_TABLE
      )}/${s.id}`,
      {
        method: 'PATCH',
        headers: atHeaders(),
        body: JSON.stringify({
          fields: {
            [F_SPONSORSHIPS.pendingCandidateChildIDs]: candidateBlob,
            [F_SPONSORSHIPS.pendingChoiceAt]: stagedAt,
          },
        }),
      }
    );
  }

  // Email every affected owner — Sponsors AND Holders — with a one-tap
  // auto-login link straight into their chooser. Departure becomes a
  // re-engagement moment instead of a dead end. Best-effort: failures
  // don't roll back the staging. Sent serially to keep this endpoint's
  // memory + latency footprint predictable for typical fan-out (1-30
  // affected owners per kid).
  const departingFirstName: string =
    (departing.fields as { FirstName?: string; DisplayName?: string }).FirstName ||
    'their kid';
  let emailsSent = 0;
  let emailsFailed = 0;
  for (const s of sponsorships) {
    if (!s.sponsorEmail || !s.sponsorCode) continue;
    try {
      const token = makeRecoveryToken(s.sponsorCode, fromShirtNumber);
      const callbackUrl = `${SITE_URL}/api/sponsor/recover/callback?t=${encodeURIComponent(token)}`;
      const greeting = s.sponsorName
        ? `Hey ${s.sponsorName.split(' ')[0]},`
        : 'Hey there,';
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: Georgia, 'Times New Roman', serif; line-height: 1.7; color: #333; max-width: 560px; margin: 0 auto; padding: 30px 20px;">
            <p style="margin-top: 0;">${greeting}</p>
            <p>
              ${departingFirstName} is no longer at the campus, which means
              your number — #${fromShirtNumber} — gets to point at a new
              kid. You get to pick who.
            </p>
            <p>
              I&rsquo;ve lined up three kids for you to choose from. Tap
              the button below to open the picker. One tap, and the new
              kid is yours.
            </p>
            <p style="text-align: center; margin: 28px 0;">
              <a href="${callbackUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em; text-transform: uppercase;">
                Pick a new kid for #${fromShirtNumber}
              </a>
            </p>
            <p style="color: #888; font-size: 13px;">
              The link signs you in for 30 days. If you have any questions, just reply &mdash; this email comes straight to me.
            </p>
            <hr style="border: none; border-top: 1px solid #e8e0d4; margin: 24px 0;">
            <p style="font-size: 12px; color: #999; line-height: 1.5;">
              Kevin Hershock<br>
              Be A Number, International<br>
              <a href="https://www.beanumber.org" style="color: #D4A843;">beanumber.org</a>
            </p>
          </body>
        </html>
      `;
      const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'Kevin@beanumber.org';
      const result = await sendEmail({
        to: { email: s.sponsorEmail, name: s.sponsorName || '' },
        from: { email: fromEmail, name: 'Be A Number' },
        subject: `#${fromShirtNumber} — pick a new kid`,
        html,
      });
      if (result.success) emailsSent += 1;
      else emailsFailed += 1;
    } catch (err) {
      emailsFailed += 1;
      console.error('[StageCandidates] Email send error:', err);
    }
  }

  return NextResponse.json({
    ok: true,
    staged: sponsorships.length,
    emailsSent,
    emailsFailed,
    candidates,
  });
}
