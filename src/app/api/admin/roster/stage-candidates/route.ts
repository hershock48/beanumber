/**
 * POST /api/admin/roster/stage-candidates
 *   Body: { fromShirtNumber: number, replacementRecordId?: string }
 *
 * Auto-reveal-on-depart. When a kid leaves the campus, the system
 * picks ONE replacement (random from the same-grade pool, fallback
 * to any non-departed kid) and reassigns every active sponsorship
 * tied to the departing kid&rsquo;s number to that one new kid. Next
 * time each sponsor visits /[their #], the RevealOverlay fires —
 * &ldquo;[old name] has moved on. Hold to meet your new kid.&rdquo; — and
 * shows the new kid&rsquo;s name + photo. Same magic as the first
 * reveal, second time.
 *
 * The endpoint replaced the old chooser-staging flow (June 2026).
 * The previous version staged 3 candidate cards onto each
 * Sponsorship and the sponsor picked one. That contradicted
 * core_model.md §0b (we don&rsquo;t let humans pick kids, the Number
 * picks) and had a brittle chooser UI. The endpoint URL stayed
 * the same so the admin ReassignBlock caller didn&rsquo;t need to move;
 * the behavior changed underneath.
 *
 * On success, atomic-ish:
 *   1. Departed kid: move ShirtNumber → ArchivedShirtNumber, clear ShirtNumber.
 *   2. Replacement: if they had a ShirtNumber, move it to ArchivedShirtNumber.
 *      Set replacement&rsquo;s ShirtNumber = departed kid&rsquo;s old number.
 *   3. For every Active/Holder/Awaiting-Sponsor Sponsorship on the
 *      departed kid:
 *        - Append departed kid&rsquo;s ChildID to PreviousChildIDs
 *        - Swap Children link: departed → replacement
 *        - Set LastReassignedAt = now
 *        - Clear ChildRevealedAt (so RevealOverlay fires next visit)
 *        - Clear PendingCandidateChildIDs + PendingChoiceAt (legacy
 *          chooser fields; defensive cleanup)
 *   4. Email each affected owner with the auto-login link.
 *
 * Admin only.
 *
 * Pool-funding consequence (core_model.md §1): ONE replacement
 * covers ALL sponsors of the departing kid. The Number is the
 * thing that gets a new identity, not each individual sponsor&rsquo;s
 * relationship — they all share the new kid. Multiple sponsors
 * per kid is the default in this model, not a collision.
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

const F_CHILDREN = {
  shirtNumber: 'fldFLnW4dMCjyKFkO',
  archivedShirtNumber: 'fld01whJoezADPNB6',
};
const F_SPONSORSHIPS = {
  children: 'fld5hJJWvO9E2qVFg',
  previousChildIDs: 'fldM0JVmkm6ezr4Vc',
  lastReassignedAt: 'fldAggq3BvZKaIFDi',
  childRevealedAt: 'fldxnWrpn1QMFQUOf',
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
  ChildID?: string;
  ShirtNumber?: number;
  ArchivedShirtNumber?: number;
  FirstName?: string;
  DisplayName?: string;
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

async function getKidByRecordId(id: string): Promise<ChildRecord | null> {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    CHILDREN_TABLE
  )}/${id}`;
  const res = await fetch(url, { headers: atHeaders(), cache: 'no-store' });
  if (!res.ok) return null;
  return (await res.json()) as ChildRecord;
}

async function listEligibleKids(excludeId: string): Promise<ChildRecord[]> {
  const out: ChildRecord[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams();
    params.set('pageSize', '100');
    params.append('fields[]', 'ChildID');
    params.append('fields[]', 'ShirtNumber');
    params.append('fields[]', 'FirstName');
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
 * them get re-revealed onto the same new kid.
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
  return (data.records || []).map(
    (r: {
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
    })
  );
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
    replacementRecordId?: string;
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

  // Pick the replacement. If the admin pre-selected one, honor it.
  // Otherwise: prefer same-grade, fall back to any non-departed kid.
  // Same selection pool the old chooser used to surface — we&rsquo;re
  // just picking one instead of three.
  let replacement: ChildRecord | null = null;
  if (
    typeof body.replacementRecordId === 'string' &&
    body.replacementRecordId.startsWith('rec')
  ) {
    replacement = await getKidByRecordId(body.replacementRecordId);
    if (!replacement) {
      return NextResponse.json(
        { error: 'Replacement record not found' },
        { status: 404 }
      );
    }
  } else {
    const allEligible = await listEligibleKids(departing.id);
    if (allEligible.length === 0) {
      return NextResponse.json(
        { error: 'No eligible candidates on the roster.' },
        { status: 409 }
      );
    }
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
    replacement = sameGrade[0] || others[0] || null;
  }
  if (!replacement) {
    return NextResponse.json(
      { error: 'Failed to select a replacement.' },
      { status: 500 }
    );
  }

  const sponsorships = await findSponsorshipsForKid(departing.id);

  // ── ShirtNumber transfer ────────────────────────────────────────
  // 1. Departed kid: ShirtNumber → ArchivedShirtNumber, clear ShirtNumber.
  // 2. Replacement: if they had a ShirtNumber, archive it. Set ShirtNumber
  //    to the departed kid&rsquo;s old number.
  //
  // The transfers happen even when no sponsors are linked — it&rsquo;s about
  // the public-facing kid-at-#N resolution, not just the relationships.

  const departingArchivedFromCurrent: number | null =
    typeof departing.fields.ShirtNumber === 'number'
      ? departing.fields.ShirtNumber
      : null;

  // Update departed kid
  await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      CHILDREN_TABLE
    )}/${departing.id}`,
    {
      method: 'PATCH',
      headers: atHeaders(),
      body: JSON.stringify({
        fields: {
          [F_CHILDREN.shirtNumber]: null,
          ...(departingArchivedFromCurrent !== null
            ? { [F_CHILDREN.archivedShirtNumber]: departingArchivedFromCurrent }
            : {}),
        },
      }),
    }
  );

  // Update replacement
  const replacementCurrentShirtNumber: number | null =
    typeof replacement.fields.ShirtNumber === 'number'
      ? replacement.fields.ShirtNumber
      : null;
  await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      CHILDREN_TABLE
    )}/${replacement.id}`,
    {
      method: 'PATCH',
      headers: atHeaders(),
      body: JSON.stringify({
        fields: {
          [F_CHILDREN.shirtNumber]: fromShirtNumber,
          ...(replacementCurrentShirtNumber !== null
            ? { [F_CHILDREN.archivedShirtNumber]: replacementCurrentShirtNumber }
            : {}),
        },
      }),
    }
  );

  // ── Sponsorship rewrites ────────────────────────────────────────
  // For each affected Sponsorship: swap Children, append PreviousChildIDs,
  // stamp LastReassignedAt, clear ChildRevealedAt so the reveal fires.
  const now = new Date().toISOString();
  const departingChildID = departing.fields.ChildID || '';
  let reassignedCount = 0;
  for (const s of sponsorships) {
    // Fetch current PreviousChildIDs so we can append
    let previousChildIDsText = '';
    try {
      const r = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
          SPONSORSHIPS_TABLE
        )}/${s.id}`,
        { headers: atHeaders(), cache: 'no-store' }
      );
      if (r.ok) {
        const d = await r.json();
        previousChildIDsText = (d?.fields?.PreviousChildIDs as string) || '';
      }
    } catch {}
    const updatedHistory = departingChildID
      ? previousChildIDsText
        ? `${previousChildIDsText}\n${departingChildID}`
        : departingChildID
      : previousChildIDsText;

    await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        SPONSORSHIPS_TABLE
      )}/${s.id}`,
      {
        method: 'PATCH',
        headers: atHeaders(),
        body: JSON.stringify({
          fields: {
            [F_SPONSORSHIPS.children]: [replacement.id],
            [F_SPONSORSHIPS.previousChildIDs]: updatedHistory,
            [F_SPONSORSHIPS.lastReassignedAt]: now,
            [F_SPONSORSHIPS.childRevealedAt]: null,
            // Defensive: clear any leftover chooser staging from the
            // legacy flow. New writes never set these, but a sponsor
            // mid-chooser when the model changed should be auto-revealed
            // out of it.
            [F_SPONSORSHIPS.pendingCandidateChildIDs]: null,
            [F_SPONSORSHIPS.pendingChoiceAt]: null,
          },
        }),
      }
    );
    reassignedCount += 1;
  }

  // ── Email each owner ────────────────────────────────────────────
  // Best-effort: failures don&rsquo;t roll back the reassignment. Each
  // sponsor gets an auto-login link straight to /[their #] where the
  // RevealOverlay fires on arrival.
  const departingFirstName =
    departing.fields.FirstName ||
    departing.fields.DisplayName?.split(' ')[0] ||
    'your kid';
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
              ${departingFirstName} is no longer at the campus. Your
              Number — #${fromShirtNumber} — has a new kid waiting
              behind it.
            </p>
            <p>
              Tap below to meet them.
            </p>
            <p style="text-align: center; margin: 28px 0;">
              <a href="${callbackUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em; text-transform: uppercase;">
                Meet your new kid
              </a>
            </p>
            <p style="color: #888; font-size: 13px;">
              The link signs you in for 30 days. Any questions, just reply &mdash; comes straight to me.
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
        subject: `#${fromShirtNumber} — meet your new kid`,
        html,
      });
      if (result.success) emailsSent += 1;
      else emailsFailed += 1;
    } catch (err) {
      emailsFailed += 1;
      console.error('[AutoReveal] Email send error:', err);
    }
  }

  return NextResponse.json({
    ok: true,
    staged: reassignedCount, // legacy key — number of sponsors handled
    reassigned: reassignedCount,
    emailsSent,
    emailsFailed,
    replacementRecordId: replacement.id,
    replacementFirstName:
      replacement.fields.FirstName || replacement.fields.DisplayName || null,
  });
}
