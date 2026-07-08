/**
 * Milestones — dated, warm moments computed from data we already
 * have on the sponsorship + child row. Powers the small "note"
 * banners on /me that turn the surface from a static roster into
 * a page that acknowledges what's happening in your relationship
 * with a specific kid.
 *
 * Design principles
 * ─────────────────
 *   - Warm, dated, factual. Never "Congratulations!" — voice.md.
 *     "One month with Emmanuel" beats "Happy Anniversary!!!"
 *   - Time-boxed. A milestone that fired 4 months ago isn't
 *     relevant today. Every window is short enough that the banner
 *     coincides with when the sponsor would actually notice.
 *   - Priority-ranked. If a kid has multiple qualifying moments
 *     (birthday today AND 1-year anniversary), we pick the one
 *     that's most emotionally weighty for THIS visit.
 *   - Zero external dependencies. Pure functions. Testable.
 */

/** Anniversary thresholds in days. Chosen to match the natural
 *  cadence people notice — first month, first quarter, half-year,
 *  year, then every year after. Not gamified — no daily streaks. */
const TENURE_DAYS_THRESHOLDS = [30, 90, 180, 365, 730, 1095, 1825, 3650];

/** How far back (past) we still surface a tenure milestone. Keeps
 *  the banner visible for a full month after the actual crossing so
 *  a monthly-visitor doesn't miss it entirely. */
const TENURE_LOOKBACK_DAYS = 30;

/** How far ahead we surface an upcoming birthday. Two weeks feels
 *  right — long enough to build anticipation, short enough that the
 *  event is still recognizably "coming up." */
const BIRTHDAY_LOOKAHEAD_DAYS = 14;

/** And how many days after the birthday we still show it. */
const BIRTHDAY_LOOKBACK_DAYS = 7;

export type MilestoneKind =
  | 'tenure'
  | 'birthday-today'
  | 'birthday-upcoming'
  | 'birthday-recent'
  | 'welcome'
  | 'sotm-current';

export interface Milestone {
  kind: MilestoneKind;
  /** UI copy — the whole banner line as it should render. */
  headline: string;
  /** One warm supporting sentence, or null when the headline is enough. */
  body: string | null;
  /**
   * Priority for cross-milestone tie-breaking. Higher wins. Used
   * when a single kid qualifies for multiple milestones on the same
   * visit (rare, but real — e.g., birthday today lands on the
   * anniversary week).
   */
  priority: number;
}

/**
 * Sponsor tenure with a specific kid. Fires when the crossing
 * happened in the past 30 days. Picks the LARGEST threshold that
 * was crossed within the window — a 1-year and 30-day milestone
 * both firing means we show 1-year.
 */
export function tenureMilestone(
  startDate: string | Date | null | undefined,
  kidFirstName: string
): Milestone | null {
  if (!startDate) return null;
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return null;

  const daysElapsed = Math.floor(
    (Date.now() - start.getTime()) / 86_400_000
  );
  if (daysElapsed < 0) return null;

  // Find the biggest threshold crossed within TENURE_LOOKBACK_DAYS.
  let crossed: number | null = null;
  for (const threshold of TENURE_DAYS_THRESHOLDS) {
    if (
      daysElapsed >= threshold &&
      daysElapsed - threshold <= TENURE_LOOKBACK_DAYS
    ) {
      crossed = threshold; // Iterating in ascending order; keep largest.
    }
  }
  if (crossed === null) return null;

  const label = tenureLabel(crossed);
  return {
    kind: 'tenure',
    headline: `${label} with ${kidFirstName}.`,
    body: tenureBody(crossed, kidFirstName),
    priority: tenurePriority(crossed),
  };
}

function tenureLabel(days: number): string {
  switch (days) {
    case 30: return 'One month';
    case 90: return 'Three months';
    case 180: return 'Six months';
    case 365: return 'One year';
    case 730: return 'Two years';
    case 1095: return 'Three years';
    case 1825: return 'Five years';
    case 3650: return 'Ten years';
    default: return `${days} days`;
  }
}

/**
 * Supporting sentence per threshold. Concrete over vague. Names the
 * thing the money did, not a generic "impact."
 */
function tenureBody(days: number, kid: string): string {
  switch (days) {
    case 30:
      return `One month of school fees, meals, and care at the campus for ${kid}. The relationship is settling in.`;
    case 90:
      return `A full term. ${kid} has been fed, in class, and looked after every school day since you started.`;
    case 180:
      return `Half a year in. ${kid} has grown, learned, and had a stable place to show up every morning because of you.`;
    case 365:
      return `A whole year of ${kid}'s life with the campus behind them. Almost none of the kids here would say that without a sponsor.`;
    case 730:
      return `Two years. ${kid} has grown up with you in their story.`;
    case 1095:
      return `Three years. That's a long time to stay in a kid's life. Thank you.`;
    case 1825:
      return `Five years. A whole chapter of ${kid}'s childhood, sponsored by you.`;
    case 3650:
      return `Ten years. There aren't a lot of sponsors who make it here. Thank you.`;
    default:
      return `Thank you for staying in ${kid}'s life.`;
  }
}

function tenurePriority(days: number): number {
  // Bigger anniversaries win over smaller ones. Priority starts at
  // 10 for a 1-month milestone and grows with the threshold.
  return 10 + Math.floor(Math.log2(days / 30 + 1) * 5);
}

/**
 * Kid birthday. Fires when the birthday is within the next
 * BIRTHDAY_LOOKAHEAD_DAYS OR happened within the last
 * BIRTHDAY_LOOKBACK_DAYS. Returns null when no birthday is on file
 * (some kids' intake isn't complete yet).
 */
export function birthdayMilestone(
  dateOfBirth: string | Date | null | undefined,
  kidFirstName: string
): Milestone | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;

  const today = new Date();
  // Compute the NEXT occurrence of the birthday from today.
  const nextBday = new Date(
    today.getFullYear(),
    dob.getMonth(),
    dob.getDate()
  );
  if (nextBday < startOfDay(today)) {
    nextBday.setFullYear(nextBday.getFullYear() + 1);
  }

  const daysUntil = Math.floor(
    (nextBday.getTime() - startOfDay(today).getTime()) / 86_400_000
  );

  // Also check whether the LAST birthday was recent enough.
  const lastBday = new Date(
    today.getFullYear(),
    dob.getMonth(),
    dob.getDate()
  );
  if (lastBday > startOfDay(today)) {
    lastBday.setFullYear(lastBday.getFullYear() - 1);
  }
  const daysSince = Math.floor(
    (startOfDay(today).getTime() - lastBday.getTime()) / 86_400_000
  );

  if (daysUntil === 0) {
    const age = today.getFullYear() - dob.getFullYear();
    return {
      kind: 'birthday-today',
      headline: `Today is ${kidFirstName}'s ${ordinal(age)} birthday.`,
      body: `The campus knows. If you want to write your penpal, reply to any email from Kevin and it'll get to ${kidFirstName}.`,
      priority: 100,
    };
  }

  if (daysUntil > 0 && daysUntil <= BIRTHDAY_LOOKAHEAD_DAYS) {
    // The kid's age AT the upcoming birthday. `nextBday.getFullYear()`
    // is either this year (if their birthday hasn't happened yet) or
    // next year (if it already passed), which is exactly what we want.
    const targetAge = nextBday.getFullYear() - dob.getFullYear();
    return {
      kind: 'birthday-upcoming',
      headline: `${kidFirstName} turns ${ordinal(targetAge)} ${when(daysUntil)}.`,
      body: null,
      // Closer birthdays outrank ones further out so if a sponsor has
      // two kids with birthdays 3 days apart both showing "upcoming,"
      // the imminent one wins the top-of-page slot when we surface a
      // single milestone globally.
      priority: 40 + (BIRTHDAY_LOOKAHEAD_DAYS - daysUntil),
    };
  }

  if (daysSince > 0 && daysSince <= BIRTHDAY_LOOKBACK_DAYS) {
    const age = lastBday.getFullYear() - dob.getFullYear();
    return {
      kind: 'birthday-recent',
      headline: `${kidFirstName} turned ${ordinal(age)} ${whenPast(daysSince)}.`,
      body: null,
      priority: 20,
    };
  }

  return null;
}

/**
 * "Welcome to the campus" for brand-new sponsors on their first few
 * visits. Fires when sponsorship start was within the last 7 days
 * and no other milestone qualifies for this kid.
 */
export function welcomeMilestone(
  startDate: string | Date | null | undefined,
  kidFirstName: string
): Milestone | null {
  if (!startDate) return null;
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return null;
  const daysSince = Math.floor((Date.now() - start.getTime()) / 86_400_000);
  if (daysSince < 0 || daysSince > 7) return null;
  return {
    kind: 'welcome',
    headline: `Welcome. ${kidFirstName} is yours now.`,
    body: `The team knows you're here. First real updates from the campus land within your first month.`,
    priority: 5,
  };
}

/**
 * Current-month Student of the Month. Fires when `sotmMonth` matches
 * the current calendar month label (the same format Kevin's approval
 * flow writes: "July 2026"). Highest priority milestone available
 * because SOTM is a real once-in-a-while ceremony — outranks
 * anniversaries and birthdays for the month it's live.
 *
 * `gradeSponsorLabel` is the US-audience label passed in by the
 * caller (already translated) so the headline reads warmly for the
 * sponsor without this pure-fn depending on the grades lib.
 */
export function sotmCurrentMilestone(
  sotmMonth: string | null | undefined,
  sotmReason: string | null | undefined,
  gradeSponsorLabel: string | null,
  kidFirstName: string
): Milestone | null {
  if (!sotmMonth) return null;
  // "Current month" is the CAMPUS's current month, not Vercel's UTC
  // clock. The SOTM ceremony happens on the ground in Uganda; if
  // Simon designates a July winner and we compare against UTC in
  // late June (when Kampala is already July after 21:00 UTC), we'd
  // fail the equality check and the milestone banner would silently
  // not render. Anchoring both sides to Africa/Kampala keeps the
  // comparison honest with the ceremony's local calendar.
  const now = new Date();
  const currentLabel = `${now.toLocaleString('en-US', {
    month: 'long',
    timeZone: 'Africa/Kampala',
  })} ${now.toLocaleString('en-US', {
    year: 'numeric',
    timeZone: 'Africa/Kampala',
  })}`;
  if (sotmMonth.trim() !== currentLabel) return null;
  const gradeClause = gradeSponsorLabel ? ` in ${gradeSponsorLabel}` : '';
  // Reason gets rendered as an italic pull-quote below the headline.
  // Simon's phrasing might already start with "because" / "for" / etc.,
  // so we don't add a lead-in verb — the banner headline provides the
  // "why" context and the quote lets his words stand.
  const trimmedReason = (sotmReason || '').trim();
  return {
    kind: 'sotm-current',
    headline: `${kidFirstName} is Student of the Month${gradeClause}.`,
    body: trimmedReason ? `“${trimmedReason}” — the team at the campus` : null,
    // Beats every other milestone in the same window. If a kid has
    // a birthday AND is SOTM, the SOTM banner leads.
    priority: 200,
  };
}

/**
 * Pick the single strongest milestone for a kid card. Returns null
 * when nothing qualifies (the card renders without a banner).
 */
export function pickKidMilestone(args: {
  startDate: string | Date | null | undefined;
  dateOfBirth: string | Date | null | undefined;
  kidFirstName: string;
  sotmMonth?: string | null;
  sotmReason?: string | null;
  gradeSponsorLabel?: string | null;
}): Milestone | null {
  const candidates = [
    sotmCurrentMilestone(
      args.sotmMonth,
      args.sotmReason,
      args.gradeSponsorLabel ?? null,
      args.kidFirstName
    ),
    tenureMilestone(args.startDate, args.kidFirstName),
    birthdayMilestone(args.dateOfBirth, args.kidFirstName),
    welcomeMilestone(args.startDate, args.kidFirstName),
  ].filter((m): m is Milestone => m !== null);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.priority - a.priority);
  return candidates[0];
}

// ─── Small helpers ───────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function ordinal(n: number): string {
  // 1st, 2nd, 3rd, 4th … English ordinals. Fine for the age
  // arithmetic we do (single- and double-digit ages).
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/** "today" / "tomorrow" / "on Wednesday" / "in 12 days." Warm and
 *  specific — matches the "Name the meal, name the village" voice
 *  rule. */
function when(daysFromNow: number): string {
  if (daysFromNow === 0) return 'today';
  if (daysFromNow === 1) return 'tomorrow';
  if (daysFromNow < 7) {
    const target = new Date();
    target.setDate(target.getDate() + daysFromNow);
    return `on ${target.toLocaleDateString('en-US', { weekday: 'long' })}`;
  }
  return `in ${daysFromNow} days`;
}

function whenPast(daysAgo: number): string {
  if (daysAgo === 1) return 'yesterday';
  if (daysAgo < 7) {
    const target = new Date();
    target.setDate(target.getDate() - daysAgo);
    return `on ${target.toLocaleDateString('en-US', { weekday: 'long' })}`;
  }
  return `${daysAgo} days ago`;
}
