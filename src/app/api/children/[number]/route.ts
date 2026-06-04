/**
 * GET /api/children/[number]
 *
 * Returns a single kid by shirt number as JSON. Mobile app calls
 * this when the sponsor types a number on the home screen. The
 * existing web-side server-rendered /children/[number]/page.tsx
 * stays as it is — this is a new additive endpoint that surfaces
 * the same data over JSON for non-Next.js clients.
 *
 * Public endpoint. Same fields the public profile page renders;
 * sponsor-gated fields (report cards, letters, billing) are NOT
 * included — those require an authenticated session and live on
 * the sponsor portal endpoint.
 *
 * Returns 200 with kid JSON, 404 if no kid matches that shirt
 * number, 500 on Airtable errors. Reserved-for-auction numbers
 * return 200 with `{ reserved: true }` so the client can render
 * the right state without a second API call.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface AirtableChildRecord {
  id: string;
  fields: {
    ChildID?: string;
    DisplayName?: string;
    FirstName?: string;
    LastInitial?: string;
    ShirtNumber?: number;
    GradeClass?: string;
    ProfilePhoto?: Array<{ url: string; filename: string }>;
    Notes?: string;
    DateOfBirth?: string;
    Status?: string;
    ReservedForAuction?: boolean;
    HomeVillage?: string;
    FamilyContext?: string;
    Loves?: string;
    ChildQuote?: string;
    TeacherName?: string;
    TeacherQuote?: string;
    NameMeaning?: string;
    StudentOfMonth?: string;
    StudentOfMonthReason?: string;
    DepartedAt?: string;
    DepartureNote?: string;
  };
}

async function airtableRequest<T>(endpoint: string): Promise<T> {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) {
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

export async function GET(
  _request: Request,
  context: { params: Promise<{ number: string }> }
) {
  const { number } = await context.params;
  const shirtNumber = parseInt(number, 10);
  if (isNaN(shirtNumber) || shirtNumber <= 0) {
    return NextResponse.json(
      { error: 'Invalid shirt number' },
      { status: 400 }
    );
  }

  const childrenTable = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';
  try {
    const formula = encodeURIComponent(`{ShirtNumber}=${shirtNumber}`);
    const res = await airtableRequest<{ records: AirtableChildRecord[] }>(
      `/${encodeURIComponent(childrenTable)}?filterByFormula=${formula}&maxRecords=1`
    );

    if (!res.records.length) {
      return NextResponse.json(
        { error: 'No kid found for that number' },
        { status: 404 }
      );
    }

    const record = res.records[0];
    const f = record.fields;

    // Reserved-for-auction short circuit. The kid record exists to
    // hold the number; we don't have a profile to surface.
    if (f.ReservedForAuction) {
      return NextResponse.json({
        reserved: true,
        shirt_number: shirtNumber,
      });
    }

    return NextResponse.json({
      reserved: false,
      record_id: record.id,
      child_id: f.ChildID || '',
      display_name:
        f.DisplayName ||
        `${f.FirstName || 'Child'} ${f.LastInitial || ''}`.trim(),
      first_name: f.FirstName || 'Child',
      last_initial: f.LastInitial,
      age: computeAge(f.DateOfBirth),
      grade_class: f.GradeClass,
      shirt_number: typeof f.ShirtNumber === 'number' ? f.ShirtNumber : shirtNumber,
      photo_url: f.ProfilePhoto?.[0]?.url,
      photo_urls: (f.ProfilePhoto || []).map(p => p.url).filter(Boolean),
      home_village: f.HomeVillage,
      family_context: f.FamilyContext,
      loves: f.Loves,
      child_quote: f.ChildQuote,
      teacher_name: f.TeacherName,
      teacher_quote: f.TeacherQuote,
      name_meaning: f.NameMeaning,
      notes: f.Notes,
      student_of_month: f.StudentOfMonth,
      student_of_month_reason: f.StudentOfMonthReason,
      departed_at: f.DepartedAt,
      departure_note: f.DepartureNote,
    });
  } catch (error) {
    console.error('[api/children/N] Error', {
      shirtNumber,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to fetch kid' },
      { status: 500 }
    );
  }
}
