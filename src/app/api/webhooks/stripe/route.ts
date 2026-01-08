import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';

// Initialize Stripe lazily
async function getStripe() {
  const StripeModule = (await import('stripe')).default;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
  return new StripeModule(secretKey, {
    apiVersion: '2025-12-15.clover',
  });
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

// Handle successful checkout session
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  console.log('[Webhook] Checkout session completed:', session.id);

  const donationData = {
    sessionId: session.id,
    customerEmail: session.customer_email || session.customer_details?.email,
    customerName: session.customer_details?.name || session.metadata?.donor_name || 'Anonymous',
    organization: session.custom_fields?.find(f => f.key === 'organization')?.text?.value || null,
    amount: session.amount_total ? session.amount_total / 100 : 0, // Convert from cents
    currency: session.currency?.toUpperCase() || 'USD',
    donationType: session.metadata?.donation_type || 'one-time',
    isRecurring: session.mode === 'subscription',
    subscriptionId: session.subscription as string | null,
    billingAddress: session.customer_details?.address
      ? {
          line1: session.customer_details.address.line1,
          line2: session.customer_details.address.line2,
          city: session.customer_details.address.city,
          state: session.customer_details.address.state,
          postal_code: session.customer_details.address.postal_code,
          country: session.customer_details.address.country,
        }
      : null,
    paymentDate: new Date().toISOString(),
    paymentIntentId: session.payment_intent as string | null,
  };

  console.log('[Webhook] Donation data:', JSON.stringify(donationData, null, 2));

  // Save to Airtable (we'll implement this next)
  try {
    await saveToAirtable(donationData);
  } catch (error) {
    console.error('[Webhook] Failed to save to Airtable:', error);
  }

  // Send thank-you email (we'll implement this next)
  try {
    if (donationData.customerEmail) {
      await sendThankYouEmail(donationData);
    }
  } catch (error) {
    console.error('[Webhook] Failed to send thank-you email:', error);
  }

  return donationData;
}

// Save donation to Airtable
async function saveToAirtable(donationData: any) {
  const airtableApiKey = process.env.AIRTABLE_API_KEY;
  const airtableBaseId = process.env.AIRTABLE_BASE_ID;
  const airtableTableName = process.env.AIRTABLE_TABLE_NAME || 'Donations';

  if (!airtableApiKey || !airtableBaseId) {
    console.log('[Webhook] Airtable credentials not set, skipping database save');
    return;
  }

  try {
    const response = await fetch(
      `https://api.airtable.com/v0/${airtableBaseId}/${airtableTableName}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${airtableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: {
            'Email': donationData.customerEmail || '',
            'Name': donationData.customerName,
            'Organization': donationData.organization || '',
            'Amount': donationData.amount,
            'Currency': donationData.currency,
            'Donation Type': donationData.donationType,
            'Is Recurring': donationData.isRecurring,
            'Payment Date': donationData.paymentDate,
            'Session ID': donationData.sessionId,
            'Payment Intent ID': donationData.paymentIntentId || '',
            'Subscription ID': donationData.subscriptionId || '',
            'Address Line 1': donationData.billingAddress?.line1 || '',
            'City': donationData.billingAddress?.city || '',
            'State': donationData.billingAddress?.state || '',
            'Postal Code': donationData.billingAddress?.postal_code || '',
            'Country': donationData.billingAddress?.country || '',
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Airtable API error: ${error}`);
    }

    const result = await response.json();
    console.log('[Webhook] Saved to Airtable:', result.id);
    return result;
  } catch (error: any) {
    console.error('[Webhook] Airtable save error:', error.message);
    throw error;
  }
}

// Send thank-you email via SendGrid
async function sendThankYouEmail(donationData: any) {
  const sendGridApiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'Kevin@beanumber.org';

  if (!sendGridApiKey) {
    console.log('[Webhook] SendGrid API key not set, skipping email');
    return;
  }

  if (!donationData.customerEmail) {
    console.log('[Webhook] No customer email, skipping thank-you email');
    return;
  }

  try {
    const emailBody = {
      personalizations: [
        {
          to: [{ email: donationData.customerEmail, name: donationData.customerName }],
          subject: 'Thank You for Your Donation to Be A Number, International',
        },
      ],
      from: { email: fromEmail, name: 'Be A Number, International' },
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
              <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                  <h1 style="color: #1a1a1a; margin-bottom: 10px;">Thank You for Your Donation!</h1>
                </div>
                
                <p>Dear ${donationData.customerName},</p>
                
                <p>Thank you for your ${donationData.isRecurring ? 'monthly ' : ''}donation of $${donationData.amount.toFixed(2)} to Be A Number, International. Your contribution directly supports sustainable community systems in Northern Uganda.</p>
                
                <p><strong>Your donation details:</strong></p>
                <ul>
                  <li>Amount: $${donationData.amount.toFixed(2)} ${donationData.currency}</li>
                  <li>Type: ${donationData.donationType === 'monthly' ? 'Monthly recurring' : 'One-time'}</li>
                  <li>Date: ${new Date(donationData.paymentDate).toLocaleDateString()}</li>
                </ul>
                
                <p>You will receive a tax-deductible receipt via email shortly. Be A Number, International is a registered 501(c)(3) organization (EIN: 93-1948872).</p>
                
                <p>Your support enables us to:</p>
                <ul>
                  <li>Provide healthcare services to 700+ patients annually</li>
                  <li>Train women and men in vocational skills</li>
                  <li>Support education for children in Northern Uganda</li>
                  <li>Build sustainable community infrastructure</li>
                </ul>
                
                <p>To learn more about our impact, visit <a href="https://www.beanumber.org/impact" style="color: #1a1a1a;">www.beanumber.org/impact</a></p>
                
                <p>With gratitude,<br>
                <strong>Kevin C. Hershock</strong><br>
                Founder & Executive Director<br>
                Be A Number, International</p>
                
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                
                <p style="font-size: 12px; color: #666;">
                  Be A Number, International | EIN: 93-1948872<br>
                  <a href="https://www.beanumber.org" style="color: #666;">www.beanumber.org</a> | 
                  <a href="mailto:Kevin@beanumber.org" style="color: #666;">Kevin@beanumber.org</a>
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

    console.log('[Webhook] Thank-you email sent to:', donationData.customerEmail);
  } catch (error: any) {
    console.error('[Webhook] SendGrid error:', error.message);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
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

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        console.log('[Webhook] Invoice payment succeeded:', invoice.id);
        // Handle recurring donation payments here if needed
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
