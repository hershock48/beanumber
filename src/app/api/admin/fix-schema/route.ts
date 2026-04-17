import { NextResponse } from 'next/server';

// One-time route to add missing singleSelect options to Child Updates.UpdateType
// DELETE THIS FILE after running it once.

export async function GET() {
  const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
  const BASE_ID = 'app73ZPGbM0BQTOZW';
  const TABLE_ID = 'tblrmtVBVzL7zCQDE';
  const FIELD_ID = 'fldk8X8eBbEEDVQhk'; // UpdateType

  if (!AIRTABLE_API_KEY) {
    return NextResponse.json({ error: 'No API key' }, { status: 500 });
  }

  try {
    const res = await fetch(
      `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables/${TABLE_ID}/fields/${FIELD_ID}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'singleSelect',
          options: {
            choices: [
              { name: 'Sponsor Message', color: 'pinkBright' },
              { name: 'Requested Update', color: 'redBright' },
            ],
          },
        }),
      }
    );

    const data = await res.json();
    return NextResponse.json({ status: res.status, data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
