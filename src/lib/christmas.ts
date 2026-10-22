/**
 * Christmas at the campus: one pooled gift fund, every kid gets the
 * same thing.
 *
 * Why pooled and not per-number: gifts that follow whoever holds a
 * number land unevenly (a kid with three sponsors gets three presents,
 * an unclaimed kid gets none), a gift earmarked for one child is a
 * restricted gift under funding_model.md, and Simon's team can't shop
 * ninety different budgets before school closes. So every dollar goes
 * into one fund, YDO buys the same gift for every kid on campus, and
 * each kid's page gets a photo of them with it. Leftover money goes to
 * the campus budget and the card says so.
 *
 * Everything below is the single source of truth for the card on
 * /children/[N], the checkout line item, the webhook note and the
 * success page. Kevin set the gift, the per-kid cost and the deadline
 * on 2026-10-22 (docs/christmas-2026.md). Change them here and every
 * surface follows.
 */

export const CHRISTMAS = {
  year: 2026,

  // Flip to false the day the campus has what it needs. Also off
  // automatically after `closesOn`.
  enabled: true,

  // Last day gifts are taken. Simon needs the money in hand with time
  // to buy before school closes for the holidays.
  closesOn: '2026-12-07',

  // How many kids are at the campus right now (YDO Q3 report: 90
  // learners after Term III opened on 14 September 2026).
  kidCount: 90,

  // What every kid gets.
  giftShort: 'a new school bag packed for the new year',
  giftLong:
    'a new school bag with notebooks, pens and a set of clothes, plus a Christmas meal with their classmates',

  // Cost of one gift, in dollars.
  perKidCost: 15,

  // The buttons on the card: gifts for one, three and six kids.
  amounts: [15, 45, 90] as const,

  // Where a gift goes if the fund is more than the gifts cost.
  overflowNote: 'If the fund comes in higher than the gifts cost, the rest goes to the campus budget.',
} as const;

export function christmasIsOpen(now: Date = new Date()): boolean {
  if (!CHRISTMAS.enabled) return false;
  // Close at the end of the day in Uganda (UTC+3).
  const closes = new Date(`${CHRISTMAS.closesOn}T23:59:59+03:00`);
  return now <= closes;
}

// "December 7", for the card and the success page.
export function christmasClosesLabel(): string {
  return new Date(`${CHRISTMAS.closesOn}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function kidsForAmount(amount: number): number {
  return Math.max(1, Math.floor(amount / CHRISTMAS.perKidCost));
}
