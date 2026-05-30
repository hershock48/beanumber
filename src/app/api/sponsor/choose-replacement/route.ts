/**
 * POST /api/sponsor/choose-replacement
 *   Body: { chosenChildRecordId: string }
 *
 * Sponsor picks their replacement kid from the staged candidates.
 * Validates that:
 *   1. The visitor has a valid sponsor session cookie.
 *   2. Their sponsorship has PendingCandidateChildIDs set.
 *   3. The chosen kid is one of the staged candidates.
 *
 * On success:
 *   - Transfers the departing kid's ShirtNumber to the chosen kid
 *     (the departing kid's old number lands in their archive slot,
 *     and the chosen kid's old number — if any — lands in theirs).
 *   - Sets Sponsorship.Children to the chosen kid.
 *   - Appends the departing kid's ChildID to PreviousChildIDs.
 *   - Stamps LastReassignedAt = now and clears ChildRevealedAt so
 *     the 'meet your new child' overlay fires on the next visit
 *     (after the chooser animates out).
 *   - Clears PendingCandidateChildIDs + PendingChoiceAt.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION } from '@/lib/constants';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY =
  process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';
const CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';
const SPONSORSHIPS_TABLE =
  process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships';

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

async function getSponsorCode(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(SESSION.COOKIE_NAME);
    if (!raw) return null;
    const session = JSON.parse(raw.value);
    if (new Date(session.expires) < new Date()) return null;
    return session.sponsorCode || null;
  } catch {
    return null;
  }
}

interface SponsorshipFields {
  SponsorCode?: string;
  Status?: { name?: string } | string;
  Children?: string[];
  PreviousChildIDs?: string;
  PendingCandidateChildIDs?: string;
}

async function findSponsorship(
  sponsorCode: string
): Promise<{ id: string; fields: SponsorshipFields } | null> {
  const safe = sponsorCode.replace(/"/g, '\\"');
  const formula = `{SponsorCode}="${safe}"`;
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    SPONSORSHIPS_TABLE
  )}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`;
  const res = await fetch(url, { headers: atHeaders(), cache: 'no-store' });
  if (!res.ok) return null;
  const data = await res.json();
  return data.records?.[0] || null;
}

interface ChildRecord {
  id: string;
  fields: { ShirtNumber?: number; DepartedAt?: string };
}

async function getChild(id: string): Promise<ChildRecord | null> {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    CHILDREN_TABLE
  )}/${id}`;
  const res = await fetch(url, { headers: atHeaders(), cache: 'no-store' });
  if (!res.ok) return null;
  return (await res.json()) as ChildRecord;
}

export async function POST(request: NextRequest) {
  const sponsorCode = await getSponsorCode();
  if (!sponsorCode) {
    return NextResponse.json(
      { error: 'No sponsor session' },
      { status: 401 }
    );
  }

  let body: { chosenChildRecordId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const chosenId = body.chosenChildRecordId;
  if (!chosenId || typeof chosenId !== 'string' || !chosenId.startsWith('rec')) {
    return NextResponse.json(
      { error: 'chosenChildRecordId required' },
      { status: 400 }
    );
  }

  const sponsorship = await findSponsorship(sponsorCode);
  if (!sponsorship) {
    return NextResponse.json(
      { error: 'Sponsorship not found' },
      { status: 404 }
    );
  }
  const pendingBlob = sponsorship.fields.PendingCandidateChildIDs || '';
  const candidateIds = pendingBlob
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);
  if (candidateIds.length === 0) {
    return NextResponse.json(
      { error: 'No pending choice for this sponsorship' },
      { status: 409 }
    );
  }
  if (!candidateIds.includes(chosenId)) {
    return NextResponse.json(
      { error: 'Chosen kid is not on the candidate list.' },
      { status: 400 }
    );
  }

  const chosen = await getChild(chosenId);
  if (!chosen) {
    return NextResponse.json(
      { error: 'Chosen kid not found' },
      { status: 404 }
    );
  }
  if (chosen.fields.DepartedAt) {
    return NextResponse.json(
      { error: 'Chosen kid is no longer at the campus.' },
      { status: 409 }
    );
  }

  // The departing kid is whoever this sponsorship currently points at.
  const departingId = (sponsorship.fields.Children as string[] | undefined)?.[0];
  if (!departingId) {
    return NextResponse.json(
      { error: 'Sponsorship has no current kid linked' },
      { status: 409 }
    );
  }
  const departing = await getChild(departingId);
  if (!departing) {
    return NextResponse.json(
      { error: 'Departing kid record not found' },
      { status: 404 }
    );
  }

  const departingShirtNumber = departing.fields.ShirtNumber;
  if (typeof departingShirtNumber !== 'number') {
    return NextResponse.json(
      { error: 'Departing kid has no shirt number to transfer.' },
      { status: 409 }
    );
  }

  // Look up departing's ChildID for the history append. The
  // ChildID lives on the record itself; fetch one more time with
  // the field included.
  const childIdRes = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      CHILDREN_TABLE
    )}/${departingId}`,
    { headers: atHeaders(), cache: 'no-store' }
  );
  let departingChildID = '';
  if (childIdRes.ok) {
    const data = await childIdRes.json();
    departingChildID = (data.fields?.ChildID as string) || '';
  }

  try {
    // 1. Swap shirt #s. Replacement takes the departing kid's number;
    //    departing kid's number lands in their archive.
    const chosenOldShirt = chosen.fields.ShirtNumber;
    {
      const fields: Record<string, unknown> = {
        [F_CHILDREN.shirtNumber]: departingShirtNumber,
      };
      if (typeof chosenOldShirt === 'number') {
        fields[F_CHILDREN.archivedShirtNumber] = chosenOldShirt;
      }
      await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
          CHILDREN_TABLE
        )}/${chosen.id}`,
        {
          method: 'PATCH',
          headers: atHeaders(),
          body: JSON.stringify({ fields, typecast: true }),
        }
      );
    }
    {
      const fields: Record<string, unknown> = {
        [F_CHILDREN.archivedShirtNumber]: departingShirtNumber,
        [F_CHILDREN.shirtNumber]: null,
      };
      await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
          CHILDREN_TABLE
        )}/${departingId}`,
        {
          method: 'PATCH',
          headers: atHeaders(),
          body: JSON.stringify({ fields, typecast: true }),
        }
      );
    }

    // 2. Update the sponsorship.
    const now = new Date().toISOString();
    const existingHistory = sponsorship.fields.PreviousChildIDs || '';
    const updatedHistory = existingHistory
      ? `${existingHistory}\n${departingChildID}`
      : departingChildID;
    await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        SPONSORSHIPS_TABLE
      )}/${sponsorship.id}`,
      {
        method: 'PATCH',
        headers: atHeaders(),
        body: JSON.stringify({
          fields: {
            [F_SPONSORSHIPS.children]: [chosen.id],
            [F_SPONSORSHIPS.previousChildIDs]: updatedHistory,
            [F_SPONSORSHIPS.lastReassignedAt]: now,
            // The chooser animation IS the reveal — mark it seen so
            // the post-reassign overlay doesn't double-fire on the
            // new kid's profile.
            [F_SPONSORSHIPS.childRevealedAt]: now,
            [F_SPONSORSHIPS.pendingCandidateChildIDs]: null,
            [F_SPONSORSHIPS.pendingChoiceAt]: null,
          },
          typecast: true,
        }),
      }
    );

    return NextResponse.json({
      ok: true,
      newShirtNumber: departingShirtNumber,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}
