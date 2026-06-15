/**
 * Promo code config + validation.
 *
 * Codes are declared inline below. Each code has a percent-off
 * value, an expiration timestamp, and an &ldquo;applies to&rdquo; scope
 * limiting which checkout shapes can redeem it.
 *
 * Per the brand mechanic (core_model.md §0b), the shirt is the
 * gateway and the Number is the identity. Promo codes deliberately
 * cannot touch monthly recurring charges — even on a shirt+monthly
 * checkout, the appliesTo='shirt-only' rule rejects the cart with
 * a clear message instead of trying to discount the shirt portion
 * of a subscription line item (which would also discount month 1
 * of recurring on the same line — Stripe doesn&rsquo;t split a single
 * recurring line into "shirt today" + "monthly forever").
 *
 * Active codes:
 *   - WIN10 (June 15-22, 2026) — Facebook giveaway runners-up.
 *     Each FB commenter who entered but didn&rsquo;t win the shirt drop
 *     gets posted this code as a reply. 10% off a shirt, shirt-only
 *     checkout, expires Sunday June 22 at 11:59pm ET. Cap is the
 *     expiration date — no hard max_redemptions enforcement; worst
 *     case if it leaks publicly is a few hundred dollars in extra
 *     discounts over a week, which is cheaper than the engineering
 *     to ironclad the count.
 *
 * To disable a code early, set its expiresAt to a past date.
 * To add a code, append to PROMO_CODES below.
 */

export type PromoCode = {
  code: string;
  percentOff: number;
  expiresAt: string; // ISO timestamp
  /**
   * Which checkout shapes can redeem this code:
   *   - 'shirt-only': only carts with zero monthly opt-ins
   *   - 'any-shirt': shirt-only OR shirt+monthly carts
   *
   * 'shirt-only' is the strict mode for codes that must never
   * reduce a recurring charge. Use 'any-shirt' only when the code
   * is intentionally allowed to discount the first month too.
   */
  appliesTo: 'shirt-only' | 'any-shirt';
  /** Human-readable label for the UI pill. */
  label: string;
  /** Human-readable expiry label for the UI pill. */
  expiresLabel: string;
};

const PROMO_CODES: Record<string, PromoCode> = {
  WIN10: {
    code: 'WIN10',
    percentOff: 10,
    // Sunday June 22, 2026 23:59:59 ET (UTC-4 in DST)
    expiresAt: '2026-06-22T23:59:59-04:00',
    appliesTo: 'shirt-only',
    label: '10% off',
    expiresLabel: 'expires June 22',
  },
};

/**
 * Look up a promo code (case-insensitive, trim-tolerant) and return
 * it if it&rsquo;s currently valid (exists AND not yet expired). Returns
 * null otherwise. Use the server-rendered current date for SSR; the
 * client&rsquo;s clock may be off but the server-side validation in the
 * checkout API is the actual gate that prevents redemptions of
 * expired codes.
 */
export function getValidPromoCode(
  rawCode: string | null | undefined
): PromoCode | null {
  if (!rawCode || typeof rawCode !== 'string') return null;
  const normalized = rawCode.trim().toUpperCase();
  if (!normalized) return null;
  const entry = PROMO_CODES[normalized];
  if (!entry) return null;
  const expiresAt = new Date(entry.expiresAt).getTime();
  if (isNaN(expiresAt)) return null;
  if (expiresAt < Date.now()) return null;
  return entry;
}

/**
 * Apply the percentage to a base price in cents. Rounds to the
 * nearest cent. Stripe wants integer cents, so a $25.00 price at
 * 10% off becomes 2500 - 250 = 2250.
 */
export function discountedAmountCents(
  baseCents: number,
  percentOff: number
): number {
  const off = Math.round(baseCents * (percentOff / 100));
  const discounted = baseCents - off;
  return discounted < 0 ? 0 : discounted;
}

/**
 * Decide whether a promo code can be applied to a cart. Returns
 * either { ok: true, code } or { ok: false, reason } so callers can
 * surface the reason inline. The cart's "has monthly" flag is the
 * one piece of cart context the validator needs; everything else
 * (expiration, code existence) is intrinsic to the code itself.
 */
export function canApplyPromoToCart(
  rawCode: string | null | undefined,
  cart: { hasMonthly: boolean }
):
  | { ok: true; code: PromoCode }
  | { ok: false; reason: string } {
  const code = getValidPromoCode(rawCode);
  if (!code) {
    return {
      ok: false,
      reason: 'That code isn’t active. Double-check the spelling or expiry.',
    };
  }
  if (code.appliesTo === 'shirt-only' && cart.hasMonthly) {
    return {
      ok: false,
      reason: `${code.code} applies to shirts only — remove the monthly opt-in or add it later from your kid's page.`,
    };
  }
  return { ok: true, code };
}
