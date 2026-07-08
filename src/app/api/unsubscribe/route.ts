/**
 * One-click unsubscribe endpoint
 *
 * GET /api/unsubscribe?email=X&token=T  — renders an HTML confirmation page
 * POST /api/unsubscribe                 — RFC 8058 one-click target used by
 *                                          Gmail / Outlook to unsubscribe on
 *                                          behalf of a user when they click
 *                                          the inbox-provided "unsubscribe"
 *                                          button. Accepts the same
 *                                          email+token pair in either query
 *                                          string OR x-www-form-urlencoded
 *                                          body (the RFC allows either).
 *
 * Why both:
 *   - Real humans clicking the link in the email body end up on GET. We want
 *     them to see a friendly "You're unsubscribed" page, not raw JSON.
 *   - Mail clients that honor `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
 *     fire POST with no body from their own infrastructure. Those need a
 *     plain 200 OK (they don't render HTML).
 *
 * Both paths short-circuit to idempotent success: clicking twice doesn't
 * throw and doesn't re-flip the flag on someone who's already out.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyUnsubscribeToken } from '@/lib/unsubscribe-token';
import { getDonorByEmail } from '@/lib/db/queries';
import { upsertDonorByEmail } from '@/lib/db/mutations';

/**
 * Do the actual work: verify the signature, look up the donor, flip the bit.
 * Returns a short status string the wrapping handlers can map to HTML/JSON.
 */
async function processUnsubscribe(
  rawEmail: string,
  rawToken: string
): Promise<'ok' | 'already' | 'not-found' | 'invalid'> {
  const email = rawEmail.trim().toLowerCase();
  const token = rawToken.trim();

  if (!email || !token) return 'invalid';
  if (!verifyUnsubscribeToken(email, token)) return 'invalid';

  const donor = await getDonorByEmail(email);
  if (!donor) {
    // Signature was valid but we have no donor record on file. Treat as
    // success from the user's perspective — they wanted to unsubscribe and
    // we have nothing to send them anyway. Log so we can audit if needed.
    logger.info('Unsubscribe: signature valid but no donor record', {
      email: logger.maskEmail(email),
    });
    return 'not-found';
  }

  if (donor.communicationOptIn === false) {
    return 'already';
  }

  await upsertDonorByEmail({
    email: donor.email,
    communicationOptIn: false,
  });
  logger.info('Donor unsubscribed via one-click link', {
    donorId: donor.id,
    email: logger.maskEmail(email),
  });
  return 'ok';
}

// ============================================================================
// GET — human-facing confirmation page
// ============================================================================

function renderHtmlPage(body: string, status: 'success' | 'error' = 'success'): NextResponse {
  // Inlined CSS so we don't depend on the main stylesheet (this page has to
  // be viewable even if someone clicks the unsub link long after a site
  // redesign). Palette matches the BAN brand colors.
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Unsubscribe · Be A Number</title>
<style>
  body { margin:0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background:#FFF8F0; color:#0d0d0d; }
  .wrap { max-width: 560px; margin: 10vh auto; padding: 40px 24px; background:#fff; border:1px solid #e8e0d4; border-radius: 12px; box-shadow: 0 2px 16px rgba(0,0,0,0.04); }
  h1 { font-size: 22px; margin: 0 0 16px; }
  p  { line-height: 1.55; margin: 0 0 14px; color:#333; font-size:15px; }
  .muted { color:#666; font-size:13px; }
  .brand { font-size:12px; letter-spacing:0.2em; text-transform:uppercase; color:#D4A843; margin-bottom:24px; font-weight:700; }
  a { color:#0d0d0d; }
  .error h1 { color:#7a1d1d; }
</style>
</head>
<body>
  <div class="wrap ${status === 'error' ? 'error' : ''}">
    <div class="brand">Be A Number</div>
    ${body}
    <p class="muted">If you didn't mean to unsubscribe, email <a href="mailto:kevin@beanumber.org">kevin@beanumber.org</a> and we'll turn it back on.</p>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: status === 'success' ? 200 : 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email') || '';
  const token = searchParams.get('token') || '';

  try {
    const result = await processUnsubscribe(email, token);

    if (result === 'invalid') {
      return renderHtmlPage(
        `<h1>That unsubscribe link isn't valid.</h1>
         <p>It might be truncated, expired, or copy-pasted incompletely. If you're trying to unsubscribe, reply to any newsletter email from us and we'll remove you manually.</p>`,
        'error'
      );
    }

    if (result === 'already') {
      return renderHtmlPage(
        `<h1>You're already unsubscribed.</h1>
         <p>No further newsletters will be sent to <strong>${escapeHtml(email.trim().toLowerCase())}</strong>.</p>`
      );
    }

    // 'ok' and 'not-found' both present as success to the user.
    return renderHtmlPage(
      `<h1>Unsubscribed.</h1>
       <p>We won't send any more marketing emails to <strong>${escapeHtml(email.trim().toLowerCase())}</strong>.</p>
       <p>Transactional messages — sponsorship receipts, reveal notifications, and password-style confirmations — will still come through, because those aren't marketing. If you want those off too, just reply to this email.</p>`
    );
  } catch (error) {
    logger.error('Unsubscribe GET failed', error as Error, {
      email: logger.maskEmail(email),
    });
    return renderHtmlPage(
      `<h1>Something went wrong.</h1>
       <p>We couldn't process the unsubscribe right now. Please try again in a minute, or email <a href="mailto:kevin@beanumber.org">kevin@beanumber.org</a>.</p>`,
      'error'
    );
  }
}

// ============================================================================
// POST — RFC 8058 one-click target (no user interaction)
// ============================================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Mail providers send the unsub either as query string or form body. Accept
  // both. Body is typically empty when triggered by the inbox button.
  const { searchParams } = new URL(request.url);
  let email = searchParams.get('email') || '';
  let token = searchParams.get('token') || '';

  if (!email || !token) {
    try {
      // Cast through unknown — Next.js's FormData typing has diverged
      // between web and Node lib definitions in newer TS versions.
      // The .get() method is present at runtime; the cast just quiets
      // the compiler.
      const formData = (await request.formData()) as unknown as {
        get(k: string): string | null;
      };
      email = email || String(formData.get('email') || '');
      token = token || String(formData.get('token') || '');
    } catch {
      // Body wasn't form-encoded; fall through with whatever we had.
    }
  }

  try {
    const result = await processUnsubscribe(email, token);
    if (result === 'invalid') {
      return NextResponse.json(
        { success: false, error: 'Invalid unsubscribe token' },
        { status: 400 }
      );
    }
    // 200 for ok / already / not-found — all idempotent successes.
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Unsubscribe POST failed', error as Error, {
      email: logger.maskEmail(email),
    });
    return NextResponse.json(
      { success: false, error: 'Internal error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// Helpers
// ============================================================================

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
