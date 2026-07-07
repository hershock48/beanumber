/**
 * One-shot admin endpoint: fire the 8 combined newsletter+free-shirt
 * emails for the legacy program. Promo codes are already created in
 * Stripe (see scripts/legacy-sponsor-free-shirt.ts); this endpoint just
 * looks them up by metadata and sends the emails from production where
 * Gmail credentials work.
 *
 * POST /api/admin/legacy-shirt-blast
 *
 * Requires admin auth. Body optional: { dryRun?: boolean, newsletterId?: string }.
 * Idempotent per email — reruns will re-send (SendGrid/Gmail don't
 * dedupe), so use carefully. Consider dryRun=true first.
 *
 * Delete this file after the program has run — one-off.
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { logger } from '@/lib/logger';
import {
  createSuccessResponse,
  withErrorHandling,
} from '@/lib/errors';
import { requireAdminAuth } from '@/lib/auth';
import { parseRequestBody } from '@/lib/validation';
import { db } from '@/lib/db/client';
import { newsletters as newslettersTable } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  sendLegacySponsorFreeShirtEmail,
  sendLegacyDonorFreeShirtEmail,
} from '@/lib/email';

const SPONSORS = [
  { email: 'khersh52@gmail.com', name: 'Kevin Hershock Sr', kidFirstName: 'Ismail', codeSlug: 'KEVINSR' },
  { email: 'ksmy1959@gmail.com', name: 'Karen S Myers', kidFirstName: 'Angel', codeSlug: 'KAREN' },
  { email: 'jfreese1985@gmail.com', name: 'Jason Freese', kidFirstName: 'Konshens', codeSlug: 'JASON' },
];

const DONORS = [
  { email: 'laundawheatley@gmail.com', name: 'launda Wheatley', codeSlug: 'WHEATLEY' },
  { email: 'lhetke1993@gmail.com', name: 'Luke Hetke', codeSlug: 'HETKE' },
  { email: 'josephjeffreys91@gmail.com', name: 'Joseph Jeffreys', codeSlug: 'JEFFREYS' },
  { email: 'juliaamting@gmail.com', name: 'Julia & Kenny Morgensai', codeSlug: 'MORGENSAI', maxRedemptions: 2 },
  { email: 'trueformchiropractic@gmail.com', name: 'Joseph Vear', codeSlug: 'VEAR' },
];

const DEFAULT_NEWSLETTER_ID = '9e57a1b3-694b-4140-b293-054ee7dd9704';

async function findPromoCode(
  stripe: Stripe,
  slug: string
): Promise<string | null> {
  // Metadata lookup — page through recent codes and match sponsor_slug.
  const list = await stripe.promotionCodes.list({ limit: 100 });
  const match = list.data.find(p => p.metadata?.sponsor_slug === slug);
  return match?.code || null;
}

async function handler(request: NextRequest): Promise<NextResponse> {
  logger.apiRequest('POST', '/api/admin/legacy-shirt-blast');
  requireAdminAuth(request);

  const bodyResult = await parseRequestBody(request);
  const body =
    (bodyResult.success ? bodyResult.data : {}) as {
      dryRun?: boolean;
      newsletterId?: string;
    };
  const dryRun = body.dryRun === true;
  const newsletterId = body.newsletterId || DEFAULT_NEWSLETTER_ID;

  // Load newsletter for the embed
  const [nl] = await db
    .select({
      title: newslettersTable.title,
      teaser: newslettersTable.teaser,
      heroPhotoUrl: newslettersTable.heroPhotoUrl,
    })
    .from(newslettersTable)
    .where(eq(newslettersTable.id, newsletterId))
    .limit(1);

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';
  const newsletter = nl
    ? {
        title: nl.title || '',
        teaser: nl.teaser || '',
        heroPhotoUrl: nl.heroPhotoUrl || undefined,
        newsUrl: `${siteUrl}/news`,
      }
    : undefined;

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2025-12-15.clover' as Stripe.LatestApiVersion,
  });

  const results: Array<{
    email: string;
    slug: string;
    code: string | null;
    sent: boolean;
    error?: string;
    dryRun?: boolean;
  }> = [];

  for (const r of SPONSORS) {
    const code = await findPromoCode(stripe, r.codeSlug);
    if (!code) {
      results.push({ email: r.email, slug: r.codeSlug, code: null, sent: false, error: 'promo code not found in Stripe' });
      continue;
    }
    if (dryRun) {
      results.push({ email: r.email, slug: r.codeSlug, code, sent: false, dryRun: true });
      continue;
    }
    try {
      const result = await sendLegacySponsorFreeShirtEmail({
        recipientEmail: r.email,
        recipientName: r.name,
        kidFirstName: r.kidFirstName,
        promoCode: code,
        newsletter,
      });
      results.push({
        email: r.email,
        slug: r.codeSlug,
        code,
        sent: result.success,
        error: result.success ? undefined : result.error,
      });
    } catch (err) {
      results.push({
        email: r.email,
        slug: r.codeSlug,
        code,
        sent: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  for (const d of DONORS) {
    const code = await findPromoCode(stripe, d.codeSlug);
    if (!code) {
      results.push({ email: d.email, slug: d.codeSlug, code: null, sent: false, error: 'promo code not found in Stripe' });
      continue;
    }
    if (dryRun) {
      results.push({ email: d.email, slug: d.codeSlug, code, sent: false, dryRun: true });
      continue;
    }
    try {
      const result = await sendLegacyDonorFreeShirtEmail({
        recipientEmail: d.email,
        recipientName: d.name,
        promoCode: code,
        maxRedemptions: d.maxRedemptions,
        newsletter,
      });
      results.push({
        email: d.email,
        slug: d.codeSlug,
        code,
        sent: result.success,
        error: result.success ? undefined : result.error,
      });
    } catch (err) {
      results.push({
        email: d.email,
        slug: d.codeSlug,
        code,
        sent: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.apiResponse('POST', '/api/admin/legacy-shirt-blast', 200);
  return createSuccessResponse({ dryRun, results });
}

export const POST = withErrorHandling(
  handler,
  'POST',
  '/api/admin/legacy-shirt-blast'
);
