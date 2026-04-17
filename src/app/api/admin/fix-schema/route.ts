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

  const results: any[] = [];

  // Approach 1: Try meta API without type field
  try {
    const url1 = `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables/${TABLE_ID}/fields/${FIELD_ID}`;
    const res1 = await fetch(url1, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        options: {
          choices: [
            { id: 'selwKJNMYIffyT08g' },
            { id: 'selaFlfWb4I7lQs3T' },
            { id: 'selsITGV1kc9EWAhj' },
            { id: 'sel0Rg2L5dtuo82r7' },
            { id: 'selOx1tUDJqvze8P5' },
            { name: 'Sponsor Message' },
            { name: 'Requested Update' },
          ],
        },
      }),
    });
    results.push({ approach: 'meta-api-minimal', status: res1.status, body: await res1.text() });
  } catch (e: any) {
    results.push({ approach: 'meta-api-minimal', error: e.message });
  }

  // Approach 2: Try creating a record with the new UpdateType value
  // (some Airtable configs auto-create singleSelect options on write)
  try {
    const url2 = `https://api.airtable.com/v0/${BASE_ID}/Child%20Updates`;
    const res2 = await fetch(url2, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          'UpdateType': 'Sponsor Message',
          'Title': 'SCHEMA TEST — DELETE ME',
          'Status': 'Draft',
        },
        typecast: true,
      }),
    });
    const body2 = await res2.text();
    results.push({ approach: 'typecast-record', status: res2.status, body: body2 });
  } catch (e: any) {
    results.push({ approach: 'typecast-record', error: e.message });
  }

  return NextResponse.json({ results });
}
