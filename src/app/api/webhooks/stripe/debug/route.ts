import { NextRequest, NextResponse } from 'next/server';

// Diagnostic endpoint — reproduces the exact Airtable calls the webhook
// makes and returns the full error. Hit GET /api/webhooks/stripe/debug
// from a browser to see what's failing. DELETE THIS after diagnosis.

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_DONORS_TABLE = process.env.AIRTABLE_DONORS_TABLE || 'Donors';
const AIRTABLE_DONATIONS_TABLE = process.env.AIRTABLE_DONATIONS_TABLE || 'Donations';

function getAirtableHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

export async function GET(request: NextRequest) {
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    env: {
      AIRTABLE_API_KEY_SET: !!AIRTABLE_API_KEY,
      AIRTABLE_API_KEY_PREFIX: AIRTABLE_API_KEY?.slice(0, 6) || 'NOT SET',
      AIRTABLE_BASE_ID: AIRTABLE_BASE_ID || 'NOT SET',
      STRIPE_SECRET_KEY_SET: !!process.env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET_SET: !!process.env.STRIPE_WEBHOOK_SECRET,
      SENDGRID_API_KEY_SET: !!process.env.SENDGRID_API_KEY,
      GMAIL_USER_SET: !!process.env.GMAIL_USER,
      GMAIL_APP_PASSWORD_SET: !!process.env.GMAIL_APP_PASSWORD,
    },
  };

  // Test 1: Search Donors table
  try {
    const formula = `{Email Address} = "debug-test@example.com"`;
    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONORS_TABLE}?filterByFormula=${encodeURIComponent(formula)}`,
      { headers: getAirtableHeaders() }
    );
    const body = await res.text();
    results.donorSearch = { status: res.status, ok: res.ok, body: body.slice(0, 500) };
  } catch (err: any) {
    results.donorSearch = { error: err.message };
  }

  // Test 2: Search Donations table
  try {
    const formula = `{Stripe Payment Intent ID} = "pi_debug_test_000"`;
    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONATIONS_TABLE}?filterByFormula=${encodeURIComponent(formula)}`,
      { headers: getAirtableHeaders() }
    );
    const body = await res.text();
    results.donationSearch = { status: res.status, ok: res.ok, body: body.slice(0, 500) };
  } catch (err: any) {
    results.donationSearch = { error: err.message };
  }

  // Test 3: Try creating a donor (dry run — we'll create then immediately delete)
  let testDonorId: string | null = null;
  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONORS_TABLE}`,
      {
        method: 'POST',
        headers: getAirtableHeaders(),
        body: JSON.stringify({
          fields: {
            'Donor Name': 'DEBUG TEST — delete me',
            'Email Address': 'debug-test-delete-me@example.com',
          },
        }),
      }
    );
    const body = await res.text();
    results.donorCreate = { status: res.status, ok: res.ok, body: body.slice(0, 500) };
    if (res.ok) {
      testDonorId = JSON.parse(body).id;
    }
  } catch (err: any) {
    results.donorCreate = { error: err.message };
  }

  // Test 4: Try creating a donation linked to that test donor
  let testDonationId: string | null = null;
  if (testDonorId) {
    try {
      const res = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONATIONS_TABLE}`,
        {
          method: 'POST',
          headers: getAirtableHeaders(),
          body: JSON.stringify({
            fields: {
              'Stripe Payment Intent ID': 'pi_debug_test_' + Date.now(),
              'Stripe Checkout Session ID': 'cs_debug_test',
              'Stripe Customer ID': '',
              'Donation Amount': 1.00,
              'Currency': 'USD',
              'Donation Date': new Date().toISOString().split('T')[0],
              'Payment Status': 'Succeeded',
              'Recurring Donation': false,
              'Donor': [testDonorId],
              'Donor Email at Donation': 'debug-test@example.com',
              'Donation Source': 'Website',
              'Donation Note': 'DEBUG TEST — delete me',
            },
          }),
        }
      );
      const body = await res.text();
      results.donationCreate = { status: res.status, ok: res.ok, body: body.slice(0, 500) };
      if (res.ok) {
        testDonationId = JSON.parse(body).id;
      }
    } catch (err: any) {
      results.donationCreate = { error: err.message };
    }
  }

  // Cleanup: delete test records
  if (testDonationId) {
    try {
      await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONATIONS_TABLE}/${testDonationId}`,
        { method: 'DELETE', headers: getAirtableHeaders() }
      );
      results.donationCleanup = 'deleted';
    } catch { results.donationCleanup = 'failed'; }
  }
  if (testDonorId) {
    try {
      await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONORS_TABLE}/${testDonorId}`,
        { method: 'DELETE', headers: getAirtableHeaders() }
      );
      results.donorCleanup = 'deleted';
    } catch { results.donorCleanup = 'failed'; }
  }

  // Test 5: Try sending a test email (dry check — just verify the module loads)
  try {
    const { sendEmail } = await import('@/lib/email');
    results.emailModuleLoaded = true;
    // Don't actually send — just verify the function exists
    results.emailFunctionType = typeof sendEmail;
  } catch (err: any) {
    results.emailModuleLoaded = false;
    results.emailModuleError = err.message;
  }

  // Test 6: Try loading Stripe
  try {
    const StripeModule = (await import('stripe')).default;
    const stripe = new StripeModule(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-12-15.clover' as any,
    });
    results.stripeLoaded = true;
    // Quick sanity check — list 1 event
    const events = await stripe.events.list({ limit: 1 });
    results.stripeApiCall = { ok: true, eventCount: events.data.length };
  } catch (err: any) {
    results.stripeLoaded = false;
    results.stripeError = err.message;
  }

  return NextResponse.json(results, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
