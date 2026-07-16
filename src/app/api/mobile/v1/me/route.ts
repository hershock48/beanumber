/**
 * GET /api/mobile/v1/me
 *
 * The signed-in viewer's account summary — powers the Buyer Home
 * screen on the mobile app. Bundles:
 *
 *   - basic profile (userId, email, firstName)
 *   - sponsorships (kid → monthly amount + "you sponsor" | "someone
 *     else does" framing when the row is a holder-only relationship)
 *   - purchases (shirts they've bought, source of truth = fulfillments)
 *   - billing (card last-4 from the linked donor's Stripe customer)
 *
 * The billing section is best-effort — cardLast4 is null when we
 * don't have a synced payment method on file; the client renders the
 * "Add a card" affordance in that case.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { createSuccessResponse, withErrorHandling } from '@/lib/errors';
import { requireMobileAuth } from '@/lib/auth';
import {
  getDonorByEmail,
  getMobileMineKidsForEmails,
  getPurchasesForEmail,
} from '@/lib/db/queries';
import { getViewerEmails } from '@/lib/mobile-viewer';
import { resolveShirtNumberForClaim } from '@/lib/claim-resolve';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export interface MobileMeSponsorship {
  kidFirstName: string;
  shirtNumber: number | null;
  monthlyAmount: number;
  sponsoredBy: 'you' | 'someoneElse';
  sponsorOfRecord?: { firstName: string };
}

export interface MobileMePurchase {
  shirtDisplay: string;
  sizeCode: string | null;
  colorLabel: string | null;
  purchasedOn: string | null;
  amountUsd: number | null;
}

export interface MobileMeBilling {
  cardLast4: string | null;
  receiptsEmail: string;
  hasCardOnFile: boolean;
}

export interface MobileMeResponse {
  userId: string;
  email: string;
  firstName: string | null;
  sponsorships: MobileMeSponsorship[];
  purchases: MobileMePurchase[];
  billing: MobileMeBilling;
}

async function handler(request: NextRequest): Promise<NextResponse> {
  const method = 'GET';
  const path = '/api/mobile/v1/me';
  logger.apiRequest(method, path);

  const viewer = await requireMobileAuth(request);
  const emails = await getViewerEmails(viewer);

  // Purchases + donor lookups are keyed per-email; try the whole set
  // (linked purchase email first — getViewerEmails orders it first
  // because that's where the money data actually lives).
  const [mine, purchasesPerEmail, donorsPerEmail] = await Promise.all([
    getMobileMineKidsForEmails(emails),
    Promise.all(emails.map(e => getPurchasesForEmail(e).catch(() => []))),
    Promise.all(emails.map(e => getDonorByEmail(e).catch(() => null))),
  ]);
  const purchases = purchasesPerEmail.flat();
  const donor = donorsPerEmail.find(Boolean) ?? null;

  const sponsorships: MobileMeSponsorship[] = [];
  for (const r of mine) {
    const monthly = Number(r.monthlyAmount ?? 0);
    // "You sponsor" applies when the viewer's own sponsorship is
    // Active + $25/mo. "Someone else sponsors" applies when the row
    // is holder-only (they own the shirt but haven't converted to
    // monthly — the kid may or may not have a co-sponsor covering the
    // $25/mo; the mobile UI surfaces the holder framing regardless).
    const sponsoredBy: 'you' | 'someoneElse' =
      r.status === 'Active' && monthly > 0 ? 'you' : 'someoneElse';
    // Cycle-number rows (claimed #54+) come back name-less from the
    // join — no children row carries their number. Resolve the
    // canonical kid so the Me list shows a name, not "them".
    let kidFirstName = r.firstName ?? r.displayName?.split(' ')[0] ?? null;
    if (!kidFirstName && r.claimedShirtNumber) {
      try {
        const resolved = await resolveShirtNumberForClaim(
          r.claimedShirtNumber
        );
        kidFirstName = resolved?.firstName ?? null;
      } catch {
        kidFirstName = null;
      }
    }
    sponsorships.push({
      kidFirstName: kidFirstName ?? 'them',
      shirtNumber: r.shirtNumber ?? null,
      monthlyAmount: monthly,
      sponsoredBy,
      // sponsorOfRecord is intentionally omitted when we don't have a
      // co-sponsor name to attribute. If we later join to any monthly
      // sponsor for the same kid, that name goes here.
    });
  }

  const purchaseItems: MobileMePurchase[] = purchases.map(p => {
    const shirtDisplay =
      typeof p.orderNumber === 'number' && p.orderNumber > 0
        ? `Shirt #${p.orderNumber}`
        : p.design || 'Shirt';
    return {
      shirtDisplay,
      sizeCode: p.size ?? null,
      colorLabel: p.color ?? null,
      purchasedOn: p.orderDate ? p.orderDate.toISOString() : null,
      // Amount tied to the individual fulfillment isn't stored on the
      // fulfillment row — the money lives on the donation row and the
      // two aren't 1:1 (a single checkout can include multiple shirts
      // + shipping + a monthly). Leaving null here rather than lying
      // about it; when the mobile UI needs a receipt amount, we'll
      // wire the donation join in a follow-up.
      amountUsd: null,
    };
  });

  // Real name only — donor row first, then the name the sponsor gave
  // at checkout. NEVER derived from the email local-part: "Hey
  // Beanumber48." reads like a bug, and Apple relay addresses produce
  // pure noise. Null means the client greets without a name.
  const sponsorName = mine.find(r => r.sponsorName?.trim())?.sponsorName;
  const nameSource = donor?.name?.trim() || sponsorName?.trim() || null;
  const firstName = nameSource ? nameSource.split(/\s+/)[0] : null;

  const billing: MobileMeBilling = {
    cardLast4: null,
    // Receipts land where Stripe sends them — the linked purchase
    // email when one exists (getViewerEmails orders it first), the
    // provider email otherwise.
    receiptsEmail: emails[0] ?? viewer.email,
    hasCardOnFile: Boolean(donor?.stripeCustomerId),
  };

  const body: MobileMeResponse = {
    userId: viewer.userId,
    email: viewer.email,
    firstName,
    sponsorships,
    purchases: purchaseItems,
    billing,
  };

  logger.apiResponse(method, path, 200);
  return createSuccessResponse(body);
}

export const GET = withErrorHandling(handler, 'GET', '/api/mobile/v1/me');
