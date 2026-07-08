/**
 * FREE_SHIPPING_UNTIL — temporary global free-shipping window.
 *
 * Set the env var `FREE_SHIPPING_UNTIL` to an ISO-8601 date/datetime
 * (e.g. `2026-07-15` or `2026-07-15T23:59:59-04:00`). While the
 * current time is before that instant, all shirt checkouts create
 * sessions with free shipping regardless of item count or monthly
 * status.
 *
 * When the window closes (env var expires or is removed), shipping
 * reverts to the per-endpoint default ($5 flat, or free when policy
 * says so — 3+ shirts or shirt+monthly).
 *
 * Used to run the legacy free-shirt cohort at $0 checkouts without
 * spinning up a dedicated endpoint or re-emailing recipients. The
 * legacy shipping-refund webhook (see webhooks/stripe/route.ts) no-ops
 * when shipping is already $0, so a session created inside this window
 * won't trigger a refund.
 */

export function isFreeShippingWindowActive(now: Date = new Date()): boolean {
  const raw = process.env.FREE_SHIPPING_UNTIL;
  if (!raw) return false;

  const until = Date.parse(raw);
  if (!Number.isFinite(until)) {
    // Malformed env var — fail closed so we never accidentally give
    // free shipping forever if someone typos the date.
    // eslint-disable-next-line no-console
    console.warn(
      `[free-shipping-window] FREE_SHIPPING_UNTIL is not a valid ISO date: ${raw}. Ignoring.`
    );
    return false;
  }

  return now.getTime() < until;
}

/**
 * Shipping-option pair used by shirt checkouts. Returns the free-rate
 * variant during an active FREE_SHIPPING_UNTIL window, else the
 * caller-provided default.
 */
export function shippingOptionsWithWindow(
  defaultOptions: Array<{
    shipping_rate_data: {
      type: 'fixed_amount';
      fixed_amount: { amount: number; currency: string };
      display_name: string;
    };
  }>
) {
  if (isFreeShippingWindowActive()) {
    return [
      {
        shipping_rate_data: {
          type: 'fixed_amount' as const,
          fixed_amount: { amount: 0, currency: 'usd' },
          display_name: 'Free shipping (limited-time)',
        },
      },
    ];
  }
  return defaultOptions;
}
