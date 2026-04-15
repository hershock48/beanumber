import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';

// Initialize Stripe lazily
async function getStripe() {
  const StripeModule = (await import('stripe')).default;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error('[Webhook] STRIPE_SECRET_KEY is not set');
    throw new Error('Payment system configuration error');
  }
  return new StripeModule(secretKey, {
    apiVersion: '2025-12-15.clover',
  });
}

// Validate required environment variables for webhook
function validateWebhookEnvVars() {
  const required = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    AIRTABLE_API_KEY: process.env.AIRTABLE_API_KEY,
    AIRTABLE_BASE_ID: process.env.AIRTABLE_BASE_ID,
  };
  
  const missing = Object.entries(required)
    .filter(([_, value]) => !value)
    .map(([key]) => key);
  
  if (missing.length > 0) {
    console.error('[Webhook] Missing required environment variables:', missing);
    // Don't throw - log and continue (webhook should still respond to Stripe)
  }
}

// Rate limiter for Airtable API (5 requests per second)
class RateLimiter {
  private queue: Array<() => void> = [];
  private tokens: number;
  private maxTokens: number;
  private refillRate: number; // tokens per second

  constructor(maxTokens: number, perSeconds: number = 1) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = maxTokens / perSeconds;
    this.startRefill();
  }

  private startRefill() {
    setInterval(() => {
      this.tokens = Math.min(this.maxTokens, this.tokens + this.refillRate / 10);
      this.processQueue();
    }, 100); // Check every 100ms
  }

  private processQueue() {
    while (this.queue.length > 0 && this.tokens >= 1) {
      this.tokens -= 1;
      const resolve = this.queue.shift();
      if (resolve) resolve();
    }
  }

  async removeTokens(count: number): Promise<void> {
    return new Promise((resolve) => {
      for (let i = 0; i < count; i++) {
        this.queue.push(resolve);
      }
      this.processQueue();
    });
  }
}

const airtableRateLimiter = new RateLimiter(5, 1);

// Airtable API helper with retry logic
async function airtableAPICall<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  await airtableRateLimiter.removeTokens(1);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      if (attempt === maxRetries) throw error;
      
      // Exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`[Airtable] Retry attempt ${attempt} after ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
}

// Airtable API configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_DONORS_TABLE = process.env.AIRTABLE_DONORS_TABLE || 'Donors';
const AIRTABLE_DONATIONS_TABLE = process.env.AIRTABLE_DONATIONS_TABLE || 'Donations';
const AIRTABLE_COMMUNICATIONS_TABLE = process.env.AIRTABLE_COMMUNICATIONS_TABLE || 'Communications';
const AIRTABLE_SPONSORSHIPS_TABLE = process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships';
const AIRTABLE_CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';

function getAirtableHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

// Map free-text referral answer to one of the How They Heard single-select choices.
// Everything that doesn't match goes to Notes verbatim.
function classifyReferral(raw: string): { choice: string | null; rawNote: string } {
  const text = raw.trim();
  if (!text) return { choice: null, rawNote: '' };
  const lower = text.toLowerCase();

  if (/instagram|facebook|tiktok|twitter|x\.com|social|insta|fb|ig/.test(lower)) {
    return { choice: 'Social media', rawNote: text };
  }
  if (/shirt|tee|t-shirt/.test(lower)) {
    return { choice: 'Saw a shirt', rawNote: text };
  }
  if (/church|pastor|congregation|sermon/.test(lower)) {
    return { choice: 'Church', rawNote: text };
  }
  if (/event|fundrais|gala|dinner|speak/.test(lower)) {
    return { choice: 'Event', rawNote: text };
  }
  if (/news|article|podcast|radio|tv|press|media/.test(lower)) {
    return { choice: 'News/Media', rawNote: text };
  }
  if (/search|google|bing|duckduckgo/.test(lower)) {
    return { choice: 'Web search', rawNote: text };
  }
  if (/friend|family|mom|dad|sister|brother|told me|mentioned|referr|word of mouth|recommend/.test(lower)) {
    return { choice: 'Word of mouth', rawNote: text };
  }
  if (/sponsor/.test(lower)) {
    return { choice: 'Sponsor referral', rawNote: text };
  }
  return { choice: 'Other', rawNote: text };
}

// Find or create donor with deduplication
async function findOrCreateDonor(
  stripeCustomerId: string | null,
  email: string | null,
  donorData: {
    name: string;
    organization?: string;
    email: string;
    phone?: string;
    address?: string;
    referral?: string;
  }
): Promise<string> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error('Airtable credentials not configured');
  }

  // Step 1: Search by Stripe Customer ID first
  if (stripeCustomerId) {
    const formula = `{Stripe Customer ID} = "${stripeCustomerId}"`;
    const response = await airtableAPICall(() =>
      fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONORS_TABLE}?filterByFormula=${encodeURIComponent(formula)}`,
        {
          headers: getAirtableHeaders(),
        }
      )
    );

    if (response.ok) {
      const data = await response.json();
      if (data.records && data.records.length > 0) {
        console.log('[Airtable] Found donor by Stripe Customer ID:', data.records[0].id);
        return data.records[0].id;
      }
    }
  }

  // Step 2: Search by email if no Stripe ID match
  if (email) {
    const formula = `{Email Address} = "${email}"`;
    const response = await airtableAPICall(() =>
      fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONORS_TABLE}?filterByFormula=${encodeURIComponent(formula)}`,
        {
          headers: getAirtableHeaders(),
        }
      )
    );

    if (response.ok) {
      const data = await response.json();
      if (data.records && data.records.length > 0) {
        const donorId = data.records[0].id;
        console.log('[Airtable] Found donor by email:', donorId);
        
        // Update with Stripe Customer ID if we have it
        if (stripeCustomerId) {
          await airtableAPICall(() =>
            fetch(
              `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONORS_TABLE}/${donorId}`,
              {
                method: 'PATCH',
                headers: getAirtableHeaders(),
                body: JSON.stringify({
                  fields: {
                    'Stripe Customer ID': stripeCustomerId,
                  },
                }),
              }
            )
          );
        }
        
        return donorId;
      }
    }
  }

  // Step 3: Create new donor if no matches
  const newDonorFields: any = {
    'Donor Name': donorData.name,
    'Email Address': donorData.email,
  };

  if (donorData.organization) {
    newDonorFields['Organization Name'] = donorData.organization;
  }
  if (donorData.phone) {
    newDonorFields['Phone Number'] = donorData.phone;
  }
  if (donorData.address) {
    newDonorFields['Mailing Address'] = donorData.address;
  }
  if (stripeCustomerId) {
    newDonorFields['Stripe Customer ID'] = stripeCustomerId;
  }
  if (donorData.referral) {
    const { choice, rawNote } = classifyReferral(donorData.referral);
    if (choice) {
      newDonorFields['How They Heard'] = choice;
    }
    if (rawNote) {
      newDonorFields['Notes'] = `Heard about BAN via: "${rawNote}"`;
    }
  }

  const response = await airtableAPICall(() =>
    fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONORS_TABLE}`,
      {
        method: 'POST',
        headers: getAirtableHeaders(),
        body: JSON.stringify({
          fields: newDonorFields,
        }),
      }
    )
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Airtable API error: ${error}`);
  }

  const data = await response.json();
  console.log('[Airtable] Created new donor:', data.id);
  return data.id;
}

// Create or update donation record (idempotent)
async function upsertDonation(
  paymentIntentId: string,
  donationData: {
    sessionId: string;
    customerId: string | null;
    donorId: string;
    amount: number;
    currency: string;
    donationDate: string;
    isRecurring: boolean;
    subscriptionId: string | null;
    status: string;
    email: string;
    name: string;
    organization?: string;
    address?: any;
    donationSource?: string;
    notes?: string;
    childRecordId?: string;
  }
): Promise<string> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error('Airtable credentials not configured');
  }

  // Check if donation already exists (idempotency)
  const formula = `{Stripe Payment Intent ID} = "${paymentIntentId}"`;
  const searchResponse = await airtableAPICall(() =>
    fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONATIONS_TABLE}?filterByFormula=${encodeURIComponent(formula)}`,
      {
        headers: getAirtableHeaders(),
      }
    )
  );

  if (searchResponse.ok) {
    const searchData = await searchResponse.json();
    if (searchData.records && searchData.records.length > 0) {
      console.log('[Airtable] Donation already exists:', searchData.records[0].id);
      return searchData.records[0].id;
    }
  }

  // Create new donation record
  const donationFields: any = {
    'Stripe Payment Intent ID': paymentIntentId,
    'Stripe Checkout Session ID': donationData.sessionId,
    'Stripe Customer ID': donationData.customerId || '',
    'Donation Amount': donationData.amount,
    'Currency': donationData.currency.toUpperCase(),
    'Donation Date': donationData.donationDate,
    'Payment Status': donationData.status,
    'Recurring Donation': donationData.isRecurring,
    'Donor': [donationData.donorId], // Link to donor record
    'Donor Email at Donation': donationData.email,
    'Donation Source': donationData.donationSource || 'Website',
  };

  if (donationData.notes) {
    donationFields['Donation Note'] = donationData.notes;
  }

  if (donationData.childRecordId) {
    donationFields['Child'] = [donationData.childRecordId];
  }

  if (donationData.subscriptionId) {
    donationFields['Subscription ID'] = donationData.subscriptionId;
  }
  if (donationData.organization) {
    donationFields['Organization Name'] = donationData.organization;
  }
  if (donationData.address) {
    if (donationData.address.line1) {
      donationFields['Address Line 1'] = donationData.address.line1;
    }
    if (donationData.address.city) {
      donationFields['City'] = donationData.address.city;
    }
    if (donationData.address.state) {
      donationFields['State'] = donationData.address.state;
    }
    if (donationData.address.postal_code) {
      donationFields['Postal Code'] = donationData.address.postal_code;
    }
    if (donationData.address.country) {
      donationFields['Country'] = donationData.address.country;
    }
  }

  const response = await airtableAPICall(() =>
    fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONATIONS_TABLE}`,
      {
        method: 'POST',
        headers: getAirtableHeaders(),
        body: JSON.stringify({
          fields: donationFields,
        }),
      }
    )
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Airtable API error: ${error}`);
  }

  const data = await response.json();
  console.log('[Airtable] Created donation record:', data.id);
  return data.id;
}

// Create communication record
async function createCommunicationRecord(
  donationId: string,
  donorId: string,
  emailData: {
    email: string;
    subject: string;
    body: string;
    status: string;
  }
): Promise<string> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error('Airtable credentials not configured');
  }

  const communicationFields: any = {
    'Subject': emailData.subject,
    'Email Body': emailData.body,
    'Send Date': new Date().toISOString(),
    'Recipient Email': emailData.email,
    'Status': emailData.status,
    'Email Type': 'Thank You',
    'Related Donation': [donationId],
    'Related Donor': [donorId],
  };

  const response = await airtableAPICall(() =>
    fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_COMMUNICATIONS_TABLE}`,
      {
        method: 'POST',
        headers: getAirtableHeaders(),
        body: JSON.stringify({
          fields: communicationFields,
        }),
      }
    )
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Airtable API error: ${error}`);
  }

  const data = await response.json();
  console.log('[Airtable] Created communication record:', data.id);
  return data.id;
}

// Send thank-you email via SendGrid
async function sendThankYouEmail(donationData: {
  email: string;
  name: string;
  amount: number;
  currency: string;
  isRecurring: boolean;
  donationDate: string;
}): Promise<void> {
  const sendGridApiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'Kevin@beanumber.org';

  if (!sendGridApiKey) {
    console.log('[Webhook] SendGrid API key not set, skipping email');
    return;
  }

  if (!donationData.email) {
    console.log('[Webhook] No customer email, skipping thank-you email');
    return;
  }

  const firstName = donationData.name.split(' ')[0];
  const amountStr = `$${donationData.amount.toFixed(2)}`;
  const dateStr = new Date(donationData.donationDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const emailBody = {
    personalizations: [
      {
        to: [{ email: donationData.email, name: donationData.name }],
        subject: donationData.isRecurring
          ? 'You just became a monthly sponsor.'
          : 'Thank you. This matters.',
      },
    ],
    from: { email: fromEmail, name: 'Kevin at Be A Number' },
    content: [
      {
        type: 'text/html',
        value: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: Georgia, 'Times New Roman', serif; line-height: 1.7; color: #333; max-width: 560px; margin: 0 auto; padding: 30px 20px;">

              <p style="margin-top: 0;">Hey ${firstName},</p>

              <p>I wanted to say thank you personally. Your ${donationData.isRecurring ? 'monthly ' : ''}gift of ${amountStr} goes directly to the ground. To a six-acre campus in Northern Uganda where 380 kids go to school, 700+ patients get medical care, and 60 women are learning trades that will change their families.</p>

              <p>We run at 96.7% program efficiency. That means almost every dollar you just gave lands where it\u2019s supposed to.</p>

              ${donationData.isRecurring ? `<p>As a monthly sponsor, you\u2019re not just donating. You\u2019re becoming part of the system that keeps this community running. I\u2019ll make sure you hear from us regularly so you can see exactly what your support is doing.</p>` : `<p>Even a one-time gift moves the needle here. If you ever want to go deeper (sponsor a child, visit the campus, or just learn more about the work), I\u2019m always reachable.</p>`}

              <p style="color: #999; font-size: 14px; margin-top: 24px; margin-bottom: 4px;">Your receipt:</p>
              <p style="font-size: 14px; color: #555; margin-top: 0;">
                ${amountStr} \u00b7 ${donationData.isRecurring ? 'Monthly recurring' : 'One-time'} \u00b7 ${dateStr}<br>
                <span style="font-size: 13px; color: #999;">Tax-deductible under 501(c)(3) \u00b7 EIN: 93-1948872</span>
              </p>

              <p>Thanks for being part of this,<br>
              <strong>Kevin</strong></p>

              <hr style="border: none; border-top: 1px solid #e8e0d4; margin: 30px 0;">

              <p style="font-size: 12px; color: #999; line-height: 1.5;">
                Be A Number, International<br>
                <a href="https://www.beanumber.org" style="color: #D4A843;">beanumber.org</a> &nbsp;\u00b7&nbsp;
                <a href="mailto:Kevin@beanumber.org" style="color: #D4A843;">Kevin@beanumber.org</a>
              </p>
            </body>
          </html>
        `,
      },
    ],
  };

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sendGridApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailBody),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`SendGrid API error: ${error}`);
  }

  console.log('[Webhook] Thank-you email sent to:', donationData.email);
}

// Assign the next available child (lowest ShirtNumber, ShirtAssignedAt blank,
// Status active) to a shirt buyer. Writes the assignment atomically-ish by
// patching the Child record, then returns the child info so the caller can
// link the Donation and render the confirmation email.
//
// Returns null if no child is currently available. Caller should degrade
// gracefully (still send a confirmation, flag internally) rather than fail.
async function assignNextShirtChild(
  buyerEmail: string,
  buyerName: string
): Promise<{
  recordId: string;
  childId: string;
  displayName: string;
  shirtNumber: number;
  photoUrl?: string;
} | null> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.warn('[Webhook] Airtable not configured, skipping shirt assignment');
    return null;
  }

  // Query children where:
  // - ShirtNumber is populated (they have a number to give away)
  // - ShirtAssignedAt is blank (shirt not yet claimed by a buyer)
  // - Status is not 'Graduated' or 'Archived' (case-insensitive)
  // - ReservedForAuction is not checked (numbers 1, 7, 67, 69, 420, 911 etc
  //   are held back for live auctions and must never be auto-assigned)
  // Sorted ascending by ShirtNumber so lowest-numbered child is claimed first,
  // matching the enrollment-order policy.
  const formula = `AND(NOT({ShirtNumber}=BLANK()), {ShirtAssignedAt}=BLANK(), LOWER({Status})!="graduated", LOWER({Status})!="archived", NOT({ReservedForAuction}))`;
  const listUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_CHILDREN_TABLE}?filterByFormula=${encodeURIComponent(formula)}&sort%5B0%5D%5Bfield%5D=ShirtNumber&sort%5B0%5D%5Bdirection%5D=asc&maxRecords=1`;

  let candidate: any = null;
  try {
    const res = await airtableAPICall(() =>
      fetch(listUrl, { headers: getAirtableHeaders() })
    );
    if (!res.ok) {
      console.error('[Webhook] Child lookup for shirt assignment failed:', res.status);
      return null;
    }
    const data = await res.json();
    if (!data.records || data.records.length === 0) {
      console.warn('[Webhook] No available children to assign for shirt order', { buyerEmail });
      return null;
    }
    candidate = data.records[0];
  } catch (error) {
    console.error('[Webhook] Error during shirt assignment lookup:', error);
    return null;
  }

  // Claim this child by writing buyer info and a timestamp. If two webhooks
  // raced and both picked the same child, the second write still succeeds but
  // overwrites the first buyer's trail; acceptable given BAN's volume. If that
  // ever becomes a real risk we can move to a conditional-update pattern or
  // serialize via a dedicated queue.
  const nowIso = new Date().toISOString();
  const childRecordId = candidate.id as string;
  const displayName =
    candidate.fields?.DisplayName ||
    `${candidate.fields?.FirstName || 'Child'} ${candidate.fields?.LastInitial || ''}`.trim();
  const shirtNumber = Number(candidate.fields?.ShirtNumber);
  const photoUrl = candidate.fields?.ProfilePhoto?.[0]?.url;
  const childId = candidate.fields?.ChildID || childRecordId;

  try {
    const patchRes = await airtableAPICall(() =>
      fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_CHILDREN_TABLE}/${childRecordId}`,
        {
          method: 'PATCH',
          headers: getAirtableHeaders(),
          body: JSON.stringify({
            fields: {
              ShirtAssignedAt: nowIso,
              ShirtBuyerEmail: buyerEmail,
              ShirtBuyerName: buyerName,
            },
          }),
        }
      )
    );
    if (!patchRes.ok) {
      const body = await patchRes.text();
      console.error('[Webhook] Failed to mark child assigned:', patchRes.status, body);
      return null;
    }
  } catch (error) {
    console.error('[Webhook] Error marking child assigned:', error);
    return null;
  }

  console.log('[Webhook] Assigned shirt #' + shirtNumber + ' (' + displayName + ') to ' + buyerEmail);

  return {
    recordId: childRecordId,
    childId,
    displayName,
    shirtNumber,
    photoUrl,
  };
}

// Send shirt order confirmation email via SendGrid.
//
// IMPORTANT: this email intentionally does NOT name, show, or number the
// assigned child. The entire point of Be A Number is that the buyer
// discovers their match by opening the package and entering the number
// printed on the shirt tag at beanumber.org. Spoiling it in an inbox
// undermines the product. Internally we've already assigned the child and
// the webhook has created the records; we just don't tell the buyer yet.
//
// For shirt+monthly opt-in buyers, we fold the sponsor code into this
// email (generic copy, no child name) rather than sending a second
// sponsor-welcome email. One email, no spoiler, sponsor code delivered.
async function sendShirtConfirmationEmail(orderData: {
  email: string;
  name: string;
  shirtName: string;
  shirtColor: string;
  shirtSize: string;
  amount: number;
  // True when buyer checked the "keep sponsoring after this shirt" box at
  // checkout. Adds a monthly-sponsorship-active block to the email.
  alreadySponsoring?: boolean;
  // Sponsor code to include when alreadySponsoring is true.
  sponsorCode?: string;
}): Promise<void> {
  const sendGridApiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'Kevin@beanumber.org';

  if (!sendGridApiKey) {
    console.log('[Webhook] SendGrid API key not set, skipping shirt confirmation email');
    return;
  }

  if (!orderData.email) {
    console.log('[Webhook] No customer email, skipping shirt confirmation email');
    return;
  }

  const firstName = orderData.name.split(' ')[0];
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';

  // The reveal block is now always generic. The buyer enters their number
  // at beanumber.org when the shirt physically arrives.
  const revealBlock = `
              <p><strong style="color: #0d0d0d;">When your shirt arrives, here&rsquo;s the part that matters:</strong></p>

              <p>Look at the tag. Your shirt has a number on it. That number belongs to a real child in Northern Uganda. Go to <a href="${siteUrl}" style="color: #D4A843; font-weight: bold;">beanumber.org</a>, enter your number, and meet them &mdash; their name, their face, their story.</p>

              <p>Your $25 today covered the shirt and their first month of school, meals, and medical care.</p>
    `;

  // Monthly sponsorship confirmation + sponsor code block. Only rendered
  // for shirt+monthly opt-in buyers. No child name; that reveal is still
  // locked to the physical-arrival moment.
  const sponsorBlock = orderData.alreadySponsoring
    ? `
              <hr style="border: none; border-top: 1px solid #e8e0d4; margin: 30px 0;">

              <p style="color: #D4A843; font-weight: bold; font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 8px;">Your monthly sponsorship is active</p>

              <p>You opted to keep sponsoring after this shirt, so another $25 will be charged each month going forward. It goes straight to school, meals, and medical care for the child your shirt is tied to.</p>

              ${
                orderData.sponsorCode
                  ? `
              <p style="color: #999; font-size: 14px; margin-bottom: 4px;">Your sponsor code:</p>
              <p style="font-size: 20px; color: #0d0d0d; margin-top: 0; font-weight: bold; letter-spacing: 0.1em;">${orderData.sponsorCode}</p>

              <p>Keep this somewhere safe. Once your shirt arrives and you&rsquo;ve met your child, use this code at <a href="${siteUrl}/sponsor/login" style="color: #D4A843; font-weight: bold;">${siteUrl.replace(/^https?:\/\//, '')}/sponsor/login</a> to check in on them anytime &mdash; photos, letters, updates.</p>
                  `
                  : ''
              }

              <p>You can cancel anytime, no questions asked.</p>
    `
    : '';

  const subject = orderData.alreadySponsoring
    ? 'Your shirt is on its way (and your sponsorship is active).'
    : 'Your shirt is being made right now.';

  const emailBody = {
    personalizations: [
      {
        to: [{ email: orderData.email, name: orderData.name }],
        subject,
      },
    ],
    from: { email: fromEmail, name: 'Kevin at Be A Number' },
    content: [
      {
        type: 'text/html',
        value: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: Georgia, 'Times New Roman', serif; line-height: 1.7; color: #333; max-width: 560px; margin: 0 auto; padding: 30px 20px;">

              <p style="margin-top: 0;">Hey ${firstName},</p>

              <p>Your shirt is in the works. I\u2019m cutting the vinyl and pressing it by hand. It\u2019ll ship within 5\u20137 business days.</p>

              <p style="color: #999; font-size: 14px; margin-bottom: 4px;">Your order:</p>
              <p style="font-size: 15px; color: #555; margin-top: 0;">
                ${orderData.shirtName} &nbsp;\u00b7&nbsp; ${orderData.shirtColor} &nbsp;\u00b7&nbsp; ${orderData.shirtSize}<br>
                <span style="color: #999;">$${orderData.amount.toFixed(2)}</span>
              </p>

              ${revealBlock}
              ${sponsorBlock}

              <hr style="border: none; border-top: 1px solid #e8e0d4; margin: 30px 0;">

              <p style="color: #666; font-size: 14px; line-height: 1.6;">One more thing &mdash; because you&rsquo;re part of the BAN community now, once a month you&rsquo;ll get a short update straight from the campus in Gulu. Photos, progress, the small stuff. Unsubscribe anytime.</p>

              <p>Thanks for being part of this,<br>
              <strong>Kevin</strong></p>

              <hr style="border: none; border-top: 1px solid #e8e0d4; margin: 30px 0;">

              <p style="font-size: 12px; color: #999; line-height: 1.5;">
                Be A Number, International<br>
                <a href="https://www.beanumber.org" style="color: #D4A843;">beanumber.org</a> &nbsp;\u00b7&nbsp;
                <a href="mailto:Kevin@beanumber.org" style="color: #D4A843;">Kevin@beanumber.org</a>
              </p>
            </body>
          </html>
        `,
      },
    ],
  };

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sendGridApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailBody),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`SendGrid API error: ${error}`);
  }

  console.log('[Webhook] Shirt confirmation email sent to:', orderData.email);
}

// Generate a unique sponsor code (e.g. BAN-2026-427)
function generateSponsorCode(): string {
  const year = new Date().getFullYear();
  const randomNum = Math.floor(Math.random() * 900) + 100; // 100-999
  return `BAN-${year}-${randomNum}`;
}

// Fetch a child record to enrich the sponsorship with display data
async function fetchChildRecord(childRecordId: string): Promise<any | null> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return null;
  try {
    const response = await airtableAPICall(() =>
      fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_CHILDREN_TABLE}/${childRecordId}`,
        { headers: getAirtableHeaders() }
      )
    );
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('[Airtable] Failed to fetch child record:', error);
    return null;
  }
}

// Create a new Sponsorship record linked to Child and Donor
async function createSponsorshipRecord(data: {
  childRecordId: string;
  childId: string;
  childDisplayName: string;
  childAge?: string;
  childLocation?: string;
  childPhoto?: any[];
  sponsorEmail: string;
  sponsorName?: string;
  donorRecordId: string;
  subscriptionId?: string | null;
  monthlyAmount?: number;
  // When true, set ChildRevealedAt to now so the sponsor portal skips
  // the lockbox view. Use this for sponsors who came in via a child's
  // profile page (they already know who they're supporting). Leave
  // false/undefined for shirt+monthly flow — those sponsors haven't
  // opened the shirt yet, and the reveal is supposed to be gated on
  // the physical moment.
  alreadyRevealed?: boolean;
}): Promise<{ recordId: string; sponsorCode: string }> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error('Airtable credentials not configured');
  }

  const sponsorCode = generateSponsorCode();
  const today = new Date().toISOString().split('T')[0];

  const sponsorshipFields: Record<string, unknown> = {
    SponsorCode: sponsorCode,
    SponsorEmail: data.sponsorEmail,
    ChildID: data.childId,
    ChildDisplayName: data.childDisplayName,
    AuthStatus: 'Active',
    Status: 'Active',
    VisibleToSponsor: true,
    SponsorshipStartDate: today,
    // Bidirectional link to child record
    Children: [data.childRecordId],
    // Bidirectional link to donor (full CRM profile)
    Donor: [data.donorRecordId],
    MonthlyAmount: data.monthlyAmount ?? 25,
  };

  if (data.sponsorName) sponsorshipFields.SponsorName = data.sponsorName;
  if (data.childAge) sponsorshipFields.ChildAge = data.childAge;
  if (data.childLocation) sponsorshipFields.ChildLocation = data.childLocation;
  if (data.childPhoto && data.childPhoto.length > 0) {
    sponsorshipFields.ChildPhoto = data.childPhoto;
  }
  if (data.subscriptionId) {
    sponsorshipFields.StripeSubscriptionID = data.subscriptionId;
  }
  if (data.alreadyRevealed) {
    sponsorshipFields.ChildRevealedAt = new Date().toISOString();
  }

  const response = await airtableAPICall(() =>
    fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_SPONSORSHIPS_TABLE}`,
      {
        method: 'POST',
        headers: getAirtableHeaders(),
        body: JSON.stringify({ fields: sponsorshipFields }),
      }
    )
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Airtable Sponsorship create error: ${error}`);
  }

  const result = await response.json();
  console.log('[Airtable] Created sponsorship:', result.id, sponsorCode);
  return { recordId: result.id, sponsorCode };
}

// Send sponsor welcome email with sponsor code
async function sendSponsorWelcomeEmail(data: {
  email: string;
  name: string;
  childDisplayName: string;
  sponsorCode: string;
  amount: number;
}): Promise<void> {
  const sendGridApiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'Kevin@beanumber.org';

  if (!sendGridApiKey || !data.email) {
    console.log('[Webhook] Skipping sponsor welcome email');
    return;
  }

  const firstName = data.name.split(' ')[0] || 'Friend';

  const emailBody = {
    personalizations: [
      {
        to: [{ email: data.email, name: data.name }],
        subject: `You're sponsoring ${data.childDisplayName}.`,
      },
    ],
    from: { email: fromEmail, name: 'Kevin at Be A Number' },
    content: [
      {
        type: 'text/html',
        value: `
          <!DOCTYPE html>
          <html>
            <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
            <body style="font-family: Georgia, 'Times New Roman', serif; line-height: 1.7; color: #333; max-width: 560px; margin: 0 auto; padding: 30px 20px;">
              <p style="margin-top: 0;">Hey ${firstName},</p>

              <p>You're officially sponsoring <strong>${data.childDisplayName}</strong>. Your $${data.amount.toFixed(2)}/month covers their school fees, meals, medical care, and mentorship in Northern Uganda.</p>

              <p style="color: #999; font-size: 14px; margin-bottom: 4px;">Your sponsor code:</p>
              <p style="font-size: 20px; color: #0d0d0d; margin-top: 0; font-weight: bold; letter-spacing: 0.1em;">${data.sponsorCode}</p>

              <p>Use that code to log into the sponsor portal anytime. Here\u2019s what to expect from us: a monthly newsletter from our team on the campus in Gulu, photos of ${data.childDisplayName} every few months, a handwritten letter from them once a year, and a year-end report card. Everything lands in the portal; you\u2019ll also get an email when something new is posted.</p>

              <p>If you ever want to write back, visit, or just have questions, reply to this email. I read every one.</p>

              <p>Thanks for being in their corner,<br>
              <strong>Kevin</strong></p>

              <hr style="border: none; border-top: 1px solid #e8e0d4; margin: 30px 0;">

              <p style="font-size: 12px; color: #999; line-height: 1.5;">
                Be A Number, International<br>
                <a href="https://www.beanumber.org" style="color: #D4A843;">beanumber.org</a> \u00b7
                <a href="mailto:Kevin@beanumber.org" style="color: #D4A843;">Kevin@beanumber.org</a><br>
                Tax-deductible under 501(c)(3) \u00b7 EIN: 93-1948872
              </p>
            </body>
          </html>
        `,
      },
    ],
  };

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sendGridApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailBody),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`SendGrid API error: ${error}`);
  }

  console.log('[Webhook] Sponsor welcome email sent to:', data.email);
}

// Handle successful checkout session
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  console.log('[Webhook] Processing checkout session:', session.id);

  try {
    // Get payment intent for full details
    const paymentIntentId = session.payment_intent as string;
    let paymentIntent: Stripe.PaymentIntent | null = null;
    let customer: Stripe.Customer | null = null;

    if (paymentIntentId) {
      const stripe = await getStripe();
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      if (paymentIntent.customer) {
        customer = await stripe.customers.retrieve(paymentIntent.customer as string) as Stripe.Customer;
      }
    }

    // Extract donor information
    const email = session.customer_email || session.customer_details?.email || customer?.email || '';
    const name = session.customer_details?.name || session.metadata?.donor_name || customer?.name || 'Anonymous';
    const organization = session.custom_fields?.find(f => f.key === 'organization')?.text?.value || '';
    const referralRaw = session.custom_fields?.find(f => f.key === 'referral')?.text?.value || '';
    const phone = session.customer_details?.phone || customer?.phone || '';
    const address = session.customer_details?.address || customer?.address || null;
    
    // Format address as single string
    const addressString = address
      ? `${address.line1 || ''}${address.line2 ? ', ' + address.line2 : ''}, ${address.city || ''}, ${address.state || ''} ${address.postal_code || ''}, ${address.country || ''}`
      : undefined;

    const stripeCustomerId = session.customer as string || customer?.id || null;
    const amount = session.amount_total ? session.amount_total / 100 : 0;
    const currency = session.currency || 'usd';
    const isRecurring = session.mode === 'subscription';
    const subscriptionId = session.subscription as string | null;
    const donationDate = new Date().toISOString();
    const status = paymentIntent?.status === 'succeeded' ? 'Succeeded' : 'Pending';

    // Step 1: Find or create donor (shared for donations, shirt orders, sponsorships)
    const donorId = await findOrCreateDonor(stripeCustomerId, email, {
      name,
      organization: organization || undefined,
      email,
      phone: phone || undefined,
      address: addressString,
      referral: referralRaw || undefined,
    });

    // Branch: Shirt order, Shirt + Monthly, Sponsorship, or standard donation
    const isShirtOrder = session.metadata?.order_type === 'shirt';
    const isShirtPlusMonthly = session.metadata?.order_type === 'shirt_plus_monthly';
    const isSponsorship = session.metadata?.order_type === 'sponsorship';

    if (isSponsorship) {
      // --- SPONSORSHIP FLOW ---
      const childRecordId = session.metadata?.child_record_id || '';
      const childIdMeta = session.metadata?.child_id || '';
      const childDisplayNameMeta = session.metadata?.child_display_name || '';
      const referral = session.custom_fields?.find(f => f.key === 'referral')?.text?.value || '';

      console.log('[Webhook] Processing sponsorship:', { childRecordId, childIdMeta });

      if (!childRecordId) {
        console.error('[Webhook] Sponsorship missing child_record_id in metadata');
      }

      // Fetch child record to enrich sponsorship with display info
      const childRecord = childRecordId ? await fetchChildRecord(childRecordId) : null;
      const childFields = childRecord?.fields || {};
      const childDisplayName = childFields.DisplayName || childDisplayNameMeta || 'a child';
      const childId = childFields.ChildID || childFields['Child ID'] || childIdMeta;
      const childPhoto = childFields.ProfilePhoto;
      const childLocation = childFields.SchoolLocation;

      // Step 2c: Record the first month as a donation tagged as Sponsorship
      const donationId = await upsertDonation(paymentIntentId || session.id, {
        sessionId: session.id,
        customerId: stripeCustomerId,
        donorId,
        amount,
        currency,
        donationDate,
        isRecurring: true,
        subscriptionId,
        status,
        email,
        name,
        organization: organization || undefined,
        address,
        donationSource: 'Sponsorship',
        notes: `Sponsorship of ${childDisplayName} (${childId || 'no id'})${referral ? ` \u00b7 Heard via: ${referral}` : ''}`,
        childRecordId: childRecordId || undefined,
      });

      // Step 3c: Create Sponsorship record (bidirectionally linked to Child)
      let sponsorCode = '';
      let sponsorshipRecordId = '';
      if (childRecordId) {
        try {
          const result = await createSponsorshipRecord({
            childRecordId,
            childId: childId || '',
            childDisplayName,
            childAge: childFields.DateOfBirth ? undefined : childFields.GradeClass,
            childLocation,
            childPhoto,
            sponsorEmail: email,
            sponsorName: name,
            donorRecordId: donorId,
            subscriptionId,
            monthlyAmount: amount,
            // Regular sponsorship path: the sponsor landed on this
            // child's /children/[n] page and chose to sponsor them,
            // so the reveal has already happened. Don't lock the
            // portal against someone who just met their child on
            // our own site.
            alreadyRevealed: true,
          });
          sponsorCode = result.sponsorCode;
          sponsorshipRecordId = result.recordId;
        } catch (err) {
          console.error('[Webhook] Failed to create sponsorship record:', err);
        }
      }

      // Step 4c: Send sponsor welcome email
      let emailStatus = 'Sent';
      try {
        if (sponsorCode) {
          await sendSponsorWelcomeEmail({
            email,
            name,
            childDisplayName,
            sponsorCode,
            amount,
          });
        }
      } catch (err) {
        console.error('[Webhook] Failed to send sponsor welcome email:', err);
        emailStatus = 'Failed';
      }

      // Step 5c: Communication record
      try {
        await createCommunicationRecord(donationId, donorId, {
          email,
          subject: `You're sponsoring ${childDisplayName}.`,
          body: `Sponsorship welcome. Code: ${sponsorCode || 'N/A'}. Child: ${childDisplayName} (${childId || 'no id'}). $${amount.toFixed(2)}/mo.`,
          status: emailStatus,
        });
      } catch (err) {
        console.error('[Webhook] Failed to create communication record:', err);
      }

      console.log('[Webhook] Successfully processed sponsorship:', {
        sessionId: session.id,
        donorId,
        donationId,
        sponsorshipRecordId,
        sponsorCode,
        childRecordId,
      });

      return { donorId, donationId, sponsorshipRecordId, sponsorCode };
    } else if (isShirtPlusMonthly) {
      // --- SHIRT + MONTHLY SPONSORSHIP FLOW ---
      //
      // The "aha moment #1" path: someone bought the shirt AND opted into
      // ongoing sponsorship at checkout in a single transaction. Stripe gives
      // us a subscription (month 1 already paid = today's $25, which also
      // funds the shirt). We need to:
      //   1. Assign the next child (same pool as shirt-only)
      //   2. Backfill subscription.metadata with child_id + referring_shirt_session_id
      //      so activation attribution + the sponsor portal work
      //   3. Record the first month as a Donation tagged 'Shirt + Monthly'
      //   4. Create a Sponsorship record (real sponsor from day 1)
      //   5. Send one combined welcome email (don't double-email them)
      const shirtName = session.metadata?.shirt_name || 'Unknown';
      const shirtColor = session.metadata?.shirt_color || 'Unknown';
      const shirtSize = session.metadata?.shirt_size || 'Unknown';
      const shirtId = session.metadata?.shirt_id || 'unknown';
      const referral = session.custom_fields?.find(f => f.key === 'referral')?.text?.value || '';

      console.log('[Webhook] Processing shirt + monthly order:', {
        shirtName,
        shirtColor,
        shirtSize,
        subscriptionId,
      });

      // Step 2: Assign the next available child (same pool / same rules as
      // a shirt-only order). This must happen before we try to backfill
      // subscription metadata so we have child_id in hand.
      let assignedChild: Awaited<ReturnType<typeof assignNextShirtChild>> = null;
      try {
        assignedChild = await assignNextShirtChild(email, name);
      } catch (error) {
        console.error('[Webhook] Unexpected error during shirt+monthly assignment:', error);
      }

      // Step 3: Backfill subscription metadata so the sponsor portal and
      // retention analytics can find this sponsorship. Stripe does not
      // substitute {CHECKOUT_SESSION_ID} into metadata at checkout create
      // time, so we do it here once we know everything.
      if (subscriptionId) {
        try {
          const stripe = await getStripe();
          const backfillMeta: Record<string, string> = {
            order_type: 'shirt_plus_monthly',
            shirt_id: shirtId,
            shirt_name: shirtName,
            shirt_color: shirtColor,
            shirt_size: shirtSize,
            customer_name: name || '',
            continue_monthly: 'true',
            referring_shirt_session_id: session.id,
          };
          if (assignedChild) {
            backfillMeta.child_id = assignedChild.childId;
            backfillMeta.child_record_id = assignedChild.recordId;
            backfillMeta.child_display_name = assignedChild.displayName;
          }
          await stripe.subscriptions.update(subscriptionId, {
            metadata: backfillMeta,
          });
          console.log('[Webhook] Backfilled subscription metadata:', subscriptionId);
        } catch (err) {
          console.error('[Webhook] Failed to backfill subscription metadata:', err);
        }
      }

      // Step 4: Record first month as a Donation. We tag it 'Shirt + Monthly'
      // so retention / revenue-source reports can split it out from pure
      // shirt orders and pure sponsorship signups.
      const assignmentNote = assignedChild
        ? ` / Assigned to #${assignedChild.shirtNumber} (${assignedChild.displayName})`
        : ' / No child assigned (out of stock or assignment failed)';
      const donationId = await upsertDonation(paymentIntentId || session.id, {
        sessionId: session.id,
        customerId: stripeCustomerId,
        donorId,
        amount,
        currency,
        donationDate,
        isRecurring: true,
        subscriptionId,
        status,
        email,
        name,
        organization: organization || undefined,
        address,
        donationSource: 'Shirt + Monthly',
        notes: `Shirt+Monthly: ${shirtName} / ${shirtColor} / ${shirtSize}${assignmentNote}${referral ? ` \u00b7 Heard via: ${referral}` : ''}`,
        childRecordId: assignedChild?.recordId,
      });

      // Step 5: Create Sponsorship record so this person shows up in the
      // sponsor portal and gets a sponsor code. Only possible if we managed
      // to assign a child.
      let sponsorCode = '';
      let sponsorshipRecordId = '';
      if (assignedChild) {
        try {
          const childRecord = await fetchChildRecord(assignedChild.recordId);
          const childFields = childRecord?.fields || {};
          const result = await createSponsorshipRecord({
            childRecordId: assignedChild.recordId,
            childId: assignedChild.childId,
            childDisplayName: assignedChild.displayName,
            childAge: childFields.DateOfBirth ? undefined : childFields.GradeClass,
            childLocation: childFields.SchoolLocation,
            childPhoto: childFields.ProfilePhoto,
            sponsorEmail: email,
            sponsorName: name,
            donorRecordId: donorId,
            subscriptionId,
            monthlyAmount: amount,
          });
          sponsorCode = result.sponsorCode;
          sponsorshipRecordId = result.recordId;
        } catch (err) {
          console.error('[Webhook] Failed to create sponsorship record (shirt+monthly):', err);
        }
      }

      // Step 6: Send ONE combined welcome email. The shirt confirmation
      // email has been extended to include the monthly-sponsorship
      // confirmation + sponsor code inline when alreadySponsoring is true.
      // We do NOT send the standalone sendSponsorWelcomeEmail here because
      // that email names the child, which would spoil the reveal. The
      // sponsor code is delivered inside the shirt confirmation (generic,
      // no child name) and the child reveal stays locked to the moment
      // the physical shirt arrives.
      let emailStatus = 'Sent';
      try {
        await sendShirtConfirmationEmail({
          email,
          name,
          shirtName,
          shirtColor,
          shirtSize,
          amount,
          alreadySponsoring: true,
          sponsorCode: sponsorCode || undefined,
        });
      } catch (err) {
        console.error('[Webhook] Failed to send shirt+monthly welcome email:', err);
        emailStatus = 'Failed';
      }

      // Step 7: Communication record
      try {
        const commSubject = assignedChild
          ? `Your shirt is being made. You're sponsoring ${assignedChild.displayName}.`
          : 'Your shirt + monthly sponsorship is confirmed.';
        const commBody = assignedChild
          ? `Shirt+Monthly: ${shirtName} (${shirtColor}, ${shirtSize}) / $${amount.toFixed(2)}/mo / Sponsoring #${assignedChild.shirtNumber} ${assignedChild.displayName} / Sponsor code: ${sponsorCode || 'pending'}`
          : `Shirt+Monthly (no child assigned): ${shirtName} (${shirtColor}, ${shirtSize}) / $${amount.toFixed(2)}/mo`;
        await createCommunicationRecord(donationId, donorId, {
          email,
          subject: commSubject,
          body: commBody,
          status: emailStatus,
        });
      } catch (err) {
        console.error('[Webhook] Failed to create communication record (shirt+monthly):', err);
      }

      console.log('[Webhook] Successfully processed shirt + monthly:', {
        sessionId: session.id,
        donorId,
        donationId,
        sponsorshipRecordId,
        sponsorCode,
        shirt: `${shirtName} / ${shirtColor} / ${shirtSize}`,
        assigned: assignedChild
          ? `#${assignedChild.shirtNumber} ${assignedChild.displayName}`
          : 'none',
      });

      return { donorId, donationId, sponsorshipRecordId, sponsorCode, assignedChild };

    } else if (isShirtOrder) {
      // --- SHIRT ORDER FLOW ---
      const shirtName = session.metadata?.shirt_name || 'Unknown';
      const shirtColor = session.metadata?.shirt_color || 'Unknown';
      const shirtSize = session.metadata?.shirt_size || 'Unknown';
      const shirtId = session.metadata?.shirt_id || 'unknown';

      console.log('[Webhook] Processing shirt order:', { shirtName, shirtColor, shirtSize });

      // Step 2a: Assign the next available child BEFORE creating the donation,
      // so the donation record can include the Child link at creation time.
      // Assignment can return null (no children available or Airtable error);
      // we continue with the order in that case and flag for manual follow-up.
      let assignedChild: Awaited<ReturnType<typeof assignNextShirtChild>> = null;
      try {
        assignedChild = await assignNextShirtChild(email, name);
      } catch (error) {
        console.error('[Webhook] Unexpected error during shirt assignment:', error);
      }

      // Step 3a: Create donation record tagged as shirt order, linked to the
      // assigned child if one was found. Notes include shirt spec plus the
      // assigned number so the record is self-describing even without clicking
      // through the Child link.
      const assignmentNote = assignedChild
        ? ` / Assigned to #${assignedChild.shirtNumber} (${assignedChild.displayName})`
        : ' / No child assigned (out of stock or assignment failed)';
      const donationId = await upsertDonation(paymentIntentId || session.id, {
        sessionId: session.id,
        customerId: stripeCustomerId,
        donorId,
        amount,
        currency,
        donationDate,
        isRecurring: false,
        subscriptionId: null,
        status,
        email,
        name,
        organization: organization || undefined,
        address,
        donationSource: 'Shirt Order',
        notes: `Shirt: ${shirtName} / ${shirtColor} / ${shirtSize}${assignmentNote}`,
        childRecordId: assignedChild?.recordId,
      });

      // Step 4a: Send shirt confirmation email. Intentionally generic —
      // the assigned child is NOT named, shown, or numbered in the email.
      // The reveal is reserved for the moment the physical shirt arrives
      // and the buyer enters their number at beanumber.org. Internally we
      // still recorded the assignment above for fulfillment + analytics.
      let emailStatus = 'Sent';
      try {
        await sendShirtConfirmationEmail({
          email,
          name,
          shirtName,
          shirtColor,
          shirtSize,
          amount,
        });
      } catch (error: any) {
        console.error('[Webhook] Failed to send shirt confirmation email:', error);
        emailStatus = 'Failed';
      }

      // Step 5a: Create communication record for shirt order. Subject is
      // generic to match the email; internal notes still include the
      // assignment so staff can see who the buyer was linked to.
      try {
        const emailSubject = 'Your shirt is being made right now.';
        const emailBodyNote = assignedChild
          ? `Shirt order: ${shirtName} (${shirtColor}, ${shirtSize}) / $${amount.toFixed(2)} / Internal assignment: #${assignedChild.shirtNumber} ${assignedChild.displayName} (child not revealed to buyer yet)`
          : `Shirt order confirmation (no child assigned): ${shirtName} (${shirtColor}, ${shirtSize}) / $${amount.toFixed(2)}`;
        await createCommunicationRecord(donationId, donorId, {
          email,
          subject: emailSubject,
          body: emailBodyNote,
          status: emailStatus,
        });
      } catch (error) {
        console.error('[Webhook] Failed to create communication record:', error);
      }

      console.log('[Webhook] Successfully processed shirt order:', {
        sessionId: session.id,
        donorId,
        donationId,
        shirt: `${shirtName} / ${shirtColor} / ${shirtSize}`,
        assigned: assignedChild
          ? `#${assignedChild.shirtNumber} ${assignedChild.displayName}`
          : 'none',
      });

      return { donorId, donationId, assignedChild };

    } else {
      // --- STANDARD DONATION FLOW ---

      // Step 2b: Create donation record (idempotent)
      const donationId = await upsertDonation(paymentIntentId || session.id, {
        sessionId: session.id,
        customerId: stripeCustomerId,
        donorId,
        amount,
        currency,
        donationDate,
        isRecurring,
        subscriptionId,
        status,
        email,
        name,
        organization: organization || undefined,
        address,
      });

      // Step 3b: Send thank-you email
      let emailStatus = 'Sent';
      try {
        await sendThankYouEmail({
          email,
          name,
          amount,
          currency,
          isRecurring,
          donationDate,
        });
      } catch (error: any) {
        console.error('[Webhook] Failed to send email:', error);
        emailStatus = 'Failed';
      }

      // Step 4b: Create communication record
      try {
        await createCommunicationRecord(donationId, donorId, {
          email,
          subject: isRecurring ? 'You just became a monthly sponsor.' : 'Thank you. This matters.',
          body: `${isRecurring ? 'Monthly sponsor' : 'One-time gift'} of $${amount.toFixed(2)}.`,
          status: emailStatus,
        });
      } catch (error) {
        console.error('[Webhook] Failed to create communication record:', error);
      }

      console.log('[Webhook] Successfully processed donation:', {
        sessionId: session.id,
        donorId,
        donationId,
      });

      return { donorId, donationId };
    }
  } catch (error: any) {
    console.error('[Webhook] Error processing checkout session:', error);
    throw error;
  }
}

// Verify webhook signature
async function verifyWebhookSignature(
  request: NextRequest,
  stripe: Stripe
): Promise<Stripe.Event | null> {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    console.error('[Webhook] No signature found');
    return null;
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[Webhook] STRIPE_WEBHOOK_SECRET is not set');
    return null;
  }

  try {
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    return event;
  } catch (err: any) {
    console.error('[Webhook] Signature verification failed:', err.message);
    return null;
  }
}

/**
 * Handle customer.subscription.deleted.
 *
 * A sponsor canceled (or their subscription ended). We find the Sponsorship
 * record by StripeSubscriptionID and mark it Ended + AuthStatus=Inactive so
 * they can't log in to the portal anymore and they drop out of active-sponsor
 * counts.
 *
 * ChildRevealedAt is left alone — they already met their child, and historical
 * reveal state should be preserved for auditability even after cancellation.
 */
async function handleSubscriptionCanceled(subscription: Stripe.Subscription): Promise<void> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.error('[Webhook] Subscription canceled but Airtable credentials missing');
    return;
  }

  const subscriptionId = subscription.id;

  // Find the Sponsorship row by StripeSubscriptionID
  const formula = `{StripeSubscriptionID} = "${subscriptionId}"`;
  const searchResponse = await airtableAPICall(() =>
    fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_SPONSORSHIPS_TABLE}?filterByFormula=${encodeURIComponent(formula)}`,
      { headers: getAirtableHeaders() }
    )
  );

  if (!searchResponse.ok) {
    const errText = await searchResponse.text();
    console.error('[Webhook] Failed to look up sponsorship for canceled subscription:', subscriptionId, errText);
    return;
  }

  const searchData = await searchResponse.json();
  const records = searchData.records ?? [];

  if (records.length === 0) {
    // Not every subscription cancellation is a sponsor — could be an old
    // recurring donor with no sponsorship row. Log and move on.
    console.log('[Webhook] No sponsorship found for canceled subscription:', subscriptionId);
    return;
  }

  // Defensive: if we somehow have duplicates, update them all
  for (const record of records) {
    const updateResponse = await airtableAPICall(() =>
      fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_SPONSORSHIPS_TABLE}/${record.id}`,
        {
          method: 'PATCH',
          headers: getAirtableHeaders(),
          body: JSON.stringify({
            fields: {
              Status: 'Ended',
              AuthStatus: 'Inactive',
              VisibleToSponsor: false,
            },
          }),
        }
      )
    );

    if (updateResponse.ok) {
      console.log('[Webhook] Sponsorship marked Ended:', record.id, 'subscription:', subscriptionId);
    } else {
      const errText = await updateResponse.text();
      console.error('[Webhook] Failed to mark sponsorship Ended:', record.id, errText);
    }
  }
}

/**
 * Handle charge.refunded.
 *
 * Stripe fires this on full and partial refunds. We find the Donation row by
 * the charge's payment_intent and flip Payment Status to Refunded. For partial
 * refunds we leave the original Donation Amount in place and append a note
 * with the refunded amount — keeps the paper trail intact.
 */
async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.error('[Webhook] Charge refunded but Airtable credentials missing');
    return;
  }

  const paymentIntentId =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : charge.payment_intent?.id;

  if (!paymentIntentId) {
    console.error('[Webhook] charge.refunded event has no payment_intent:', charge.id);
    return;
  }

  const amountRefundedCents = charge.amount_refunded ?? 0;
  const amountTotalCents = charge.amount ?? 0;
  const isFullRefund = amountRefundedCents >= amountTotalCents;
  const refundedDollars = (amountRefundedCents / 100).toFixed(2);

  // Find the Donation row by Stripe Payment Intent ID
  const formula = `{Stripe Payment Intent ID} = "${paymentIntentId}"`;
  const searchResponse = await airtableAPICall(() =>
    fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONATIONS_TABLE}?filterByFormula=${encodeURIComponent(formula)}`,
      { headers: getAirtableHeaders() }
    )
  );

  if (!searchResponse.ok) {
    const errText = await searchResponse.text();
    console.error('[Webhook] Failed to look up donation for refunded charge:', paymentIntentId, errText);
    return;
  }

  const searchData = await searchResponse.json();
  const records = searchData.records ?? [];

  if (records.length === 0) {
    // This can legitimately happen if the charge was from a test or from
    // before we started recording donations. Log and move on.
    console.log('[Webhook] No donation found for refunded charge, payment_intent:', paymentIntentId);
    return;
  }

  for (const record of records) {
    const existingNote = (record.fields?.['Donation Note'] as string | undefined) ?? '';
    const refundLabel = isFullRefund
      ? `[Refunded in full on ${new Date().toISOString().split('T')[0]}]`
      : `[Partially refunded $${refundedDollars} on ${new Date().toISOString().split('T')[0]}]`;
    const mergedNote = existingNote ? `${existingNote}\n${refundLabel}` : refundLabel;

    const updateResponse = await airtableAPICall(() =>
      fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONATIONS_TABLE}/${record.id}`,
        {
          method: 'PATCH',
          headers: getAirtableHeaders(),
          body: JSON.stringify({
            fields: {
              'Payment Status': 'Refunded',
              'Donation Note': mergedNote,
            },
          }),
        }
      )
    );

    if (updateResponse.ok) {
      console.log(
        '[Webhook] Donation marked Refunded:',
        record.id,
        isFullRefund ? '(full)' : `(partial $${refundedDollars})`
      );
    } else {
      const errText = await updateResponse.text();
      console.error('[Webhook] Failed to mark donation Refunded:', record.id, errText);
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    // Validate environment variables (non-blocking for webhook)
    validateWebhookEnvVars();
    
    const stripe = await getStripe();
    const event = await verifyWebhookSignature(request, stripe);

    if (!event) {
      return NextResponse.json(
        { error: 'Webhook signature verification failed' },
        { status: 400 }
      );
    }

    console.log('[Webhook] Received event:', event.type);

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSessionCompleted(session);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('[Webhook] Subscription event:', event.type, subscription.id);
        // You can add subscription-specific handling here if needed
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('[Webhook] Subscription canceled:', subscription.id);
        await handleSubscriptionCanceled(subscription);
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        console.log('[Webhook] Charge refunded:', charge.id, 'payment_intent:', charge.payment_intent);
        await handleChargeRefunded(charge);
        break;
      }

      case 'invoice.payment_succeeded': {
        // Cast to any to access all invoice properties (Stripe types can be restrictive)
        const invoice = event.data.object as Record<string, any>;
        console.log('[Webhook] Invoice payment succeeded:', invoice.id);

        // Import the recurring payment tool dynamically to avoid circular deps
        const { processRecurringPaymentTool } = await import('@/lib/tools');

        // Process recurring subscription payments
        const result = await processRecurringPaymentTool({
          invoiceId: invoice.id || '',
          subscriptionId: (typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id) || '',
          customerId: (typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id) || '',
          email: invoice.customer_email || '',
          name: invoice.customer_name || 'Supporter',
          amountCents: invoice.amount_paid || 0,
          currency: invoice.currency || 'usd',
          paymentDate: new Date((invoice.created || Date.now() / 1000) * 1000).toISOString(),
          billingReason: invoice.billing_reason || 'unknown',
        });

        if (result.success) {
          if (result.data?.skipped) {
            console.log('[Webhook] Invoice skipped:', result.data.skipReason);
          } else {
            console.log('[Webhook] Recurring payment processed:', {
              invoiceId: invoice.id,
              donationId: result.data?.donationId,
              emailSent: result.data?.emailSent,
            });
          }
        } else {
          console.error('[Webhook] Failed to process recurring payment:', result.error);
        }
        break;
      }

      default:
        console.log('[Webhook] Unhandled event type:', event.type);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('[Webhook] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
