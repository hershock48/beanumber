import { NextResponse } from 'next/server';

// Never cache. The enrolled roster changes and we don't want the homepage grid
// or the fallback child lookup serving stale data.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface AirtableChildRecord {
  id: string;
  createdTime?: string;
  fields: {
    ChildID?: string;
    DisplayName?: string;
    FirstName?: string;
    LastInitial?: string;
    DateOfBirth?: string;
    GradeClass?: string;
    ProfilePhoto?: Array<{ url: string; filename: string }>;
    Notes?: string;
    Loves?: string;
    Status?: string;
    ShirtNumber?: number;
    EnrollmentDate?: string;
    ReservedForAuction?: boolean;
  };
}

interface OutgoingChild {
  id: string;
  child_id: string;
  first_name: string;
  last_initial?: string;
  display_name?: string;
  age?: number;
  grade_class?: string;
  photo_url?: string;
  fun_fact?: string;
  shirt_number_start?: number;
  shirt_number_end?: number;
}

async function airtableRequest<T>(endpoint: string): Promise<T> {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) {
    console.error('[api/children] Airtable not configured', {
      hasKey: !!apiKey,
      hasBase: !!baseId,
    });
    throw new Error('Airtable not configured');
  }

  const url = `https://api.airtable.com/v0/${baseId}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error('[api/children] Airtable error', {
      url,
      status: response.status,
      body: body.slice(0, 500),
    });
    throw new Error(`Airtable error: ${response.status}`);
  }
  return response.json();
}

function computeAge(dateOfBirth?: string): number | undefined {
  if (!dateOfBirth) return undefined;
  const birth = new Date(dateOfBirth);
  if (isNaN(birth.getTime())) return undefined;
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    years -= 1;
  }
  return years >= 0 ? years : undefined;
}

function toOutgoing(record: AirtableChildRecord): OutgoingChild {
  const f = record.fields;
  const firstName = f.FirstName || f.DisplayName?.split(' ')[0] || 'Child';
  const photo = f.ProfilePhoto?.[0]?.url;
  const age = computeAge(f.DateOfBirth);

  return {
    id: record.id,
    child_id: f.ChildID || record.id,
    first_name: firstName,
    last_initial: f.LastInitial,
    display_name: f.DisplayName,
    age,
    grade_class: f.GradeClass,
    photo_url: photo,
    fun_fact: f.Loves || undefined,
    shirt_number_start: typeof f.ShirtNumber === 'number' ? f.ShirtNumber : undefined,
    shirt_number_end: typeof f.ShirtNumber === 'number' ? f.ShirtNumber : undefined,
  };
}

// Status values in Airtable have inconsistent casing ("active" vs "Active").
// Treat any non-graduated status as visible on the homepage.
function isVisibleStatus(status?: string): boolean {
  if (!status) return false;
  const normalized = status.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === 'graduated') return false;
  if (normalized === 'archived') return false;
  if (normalized === 'inactive') return false;
  return true;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const numberParam = searchParams.get('number');
  const childrenTable = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';

  try {
    // Single-child lookup by shirt number (used by legacy callers).
    if (numberParam) {
      const num = parseInt(numberParam, 10);
      if (isNaN(num)) {
        return NextResponse.json(
          { error: 'Invalid number', child: null },
          { status: 400 }
        );
      }

      const formula = encodeURIComponent(`{ShirtNumber}=${num}`);
      const res = await airtableRequest<{ records: AirtableChildRecord[] }>(
        `/${encodeURIComponent(childrenTable)}?filterByFormula=${formula}&maxRecords=1`
      );

      if (!res.records.length) {
        return NextResponse.json(
          { error: 'Child not found', child: null },
          { status: 404 }
        );
      }

      return NextResponse.json({ child: toOutgoing(res.records[0]) });
    }

    // Full roster for the homepage grid. Fetch everything that has a shirt
    // number assigned, then filter out graduated/inactive in code (Airtable's
    // formula engine is case-sensitive on singleSelect names, and we have
    // "active" and "Active" both in the data).
    const formula = encodeURIComponent('NOT({ShirtNumber}=BLANK())');
    const res = await airtableRequest<{ records: AirtableChildRecord[] }>(
      `/${encodeURIComponent(childrenTable)}?filterByFormula=${formula}&pageSize=100`
    );

    const children = res.records
      // Hide reserved-for-auction slots from the public roster. They exist as
      // Child records so the system can hold the number, but they aren't real
      // kids waiting for sponsorship.
      .filter(r => !r.fields.ReservedForAuction)
      .filter(r => isVisibleStatus(r.fields.Status))
      .map(toOutgoing)
      // Oldest enrolled first, so shirts assigned in enrollment order surface
      // earliest children to new visitors.
      .sort((a, b) => (a.shirt_number_start ?? 0) - (b.shirt_number_start ?? 0));

    return NextResponse.json({ children });
  } catch (error) {
    console.error('[api/children] Request failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        children: [],
      },
      { status: 500 }
    );
  }
}
