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
    const payload = {
      name: 'UpdateType',
      type: 'singleSelect',
      options: {
        choices: [
          { id: 'selwKJNMYIffyT08g', name: 'Progress Report', color: 'blueBright' },
          { id: 'selaFlfWb4I7lQs3T', name: 'Photo Update', color: 'greenBright' },
          { id: 'selsITGV1kc9EWAhj', name: 'Special Note', color: 'purpleBright' },
          { id: 'sel0Rg2L5dtuo82r7', name: 'Holiday Greeting', color: 'yellowBright' },
          { id: 'selOx1tUDJqvze8P5', name: 'Milestone', color: 'orangeBright' },
          { name: 'Sponsor Message', color: 'pinkBright' },
          { name: 'Requested Update', color: 'redBright' },
        ],
      },
    };

    const url = `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables/${TABLE_ID}/fields/${FIELD_ID}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    return NextResponse.json({ status: res.status, url, payload, response: text });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
}
