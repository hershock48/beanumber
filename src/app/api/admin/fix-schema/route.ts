import { NextResponse } from 'next/server';

// One-time route to add missing singleSelect options + clean up test records.
// DELETE THIS FILE after running.

export async function GET() {
  const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
  const BASE_ID = 'app73ZPGbM0BQTOZW';

  if (!AIRTABLE_API_KEY) {
    return NextResponse.json({ error: 'No API key' }, { status: 500 });
  }

  const results: any[] = [];
  const recordsToDelete: string[] = ['recrYgH02fCtiymSc']; // first test record

  // Create "Requested Update" option via typecast
  try {
    const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/Child%20Updates`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          'UpdateType': 'Requested Update',
          'Title': 'SCHEMA TEST — DELETE ME',
          'Status': 'Draft',
        },
        typecast: true,
      }),
    });
    const body = await res.json();
    results.push({ step: 'create-requested-update', status: res.status, id: body.id });
    if (body.id) recordsToDelete.push(body.id);
  } catch (e: any) {
    results.push({ step: 'create-requested-update', error: e.message });
  }

  // Delete all test records
  for (const id of recordsToDelete) {
    try {
      const res = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/Child%20Updates/${id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
        }
      );
      results.push({ step: `delete-${id}`, status: res.status });
    } catch (e: any) {
      results.push({ step: `delete-${id}`, error: e.message });
    }
  }

  return NextResponse.json({ results });
}
