/**
 * campusTime — the presence line.
 *
 * The whole point of the product is that a specific kid in Omoro
 * District is real and alive RIGHT NOW. A photo says "this kid
 * exists"; "it's just after sunrise in Omoro — Ismail is getting
 * ready for school" says "this kid is existing at this exact moment,
 * seven time zones from your couch." That's the world-getting-smaller
 * feeling in one sentence, and it changes through the day so the app
 * never reads the same twice.
 *
 * Uganda is UTC+3 (East Africa Time, no DST — the math never drifts).
 *
 * Copy rules (voice.md): specific over vague, personal over
 * institutional. Never guess at hardship, never stage-manage poverty.
 * The lines describe an ordinary school day — because the entire
 * pitch of BAN is that these kids GET an ordinary school day.
 *
 * Sunday is special: letters travel in the Sunday batch. That's a
 * real operational beat, so the app says so.
 */

const CAMPUS_UTC_OFFSET_HOURS = 3;

export interface CampusMoment {
  /** Hour 0–23 at the campus right now. */
  hour: number;
  /** 0 = Sunday … 6 = Saturday, at the campus. */
  day: number;
  /** "7:05 in the morning" style human clock. */
  clock: string;
  /** True between 21:00 and 05:59 EAT. */
  isNight: boolean;
  /** True on Sunday — letter day. */
  isSunday: boolean;
}

export function campusNow(now: Date = new Date()): CampusMoment {
  // Shift the UTC timestamp by +3h and read UTC fields — no reliance
  // on the device's own zone database for a zone with no DST.
  const shifted = new Date(now.getTime() + CAMPUS_UTC_OFFSET_HOURS * 3600_000);
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();
  const day = shifted.getUTCDay();

  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  // Hours 0–4 are "at night", not "in the morning" — "12:54 in the
  // morning" is technically correct and humanly wrong.
  const daypart =
    hour < 5
      ? 'at night'
      : hour < 12
        ? 'in the morning'
        : hour < 17
          ? 'in the afternoon'
          : 'at night';
  const clock = `${h12}:${String(minute).padStart(2, '0')} ${daypart}`;

  return {
    hour,
    day,
    clock,
    isNight: hour >= 21 || hour < 6,
    isSunday: day === 0,
  };
}

/**
 * The ambient line for surfaces without a specific kid (Home).
 */
export function campusPresenceLine(now: Date = new Date()): string {
  const m = campusNow(now);
  if (m.isSunday && m.hour >= 8 && m.hour < 17) {
    return 'It’s Sunday at the campus — letter day. Notes go out, replies come back.';
  }
  if (m.hour >= 6 && m.hour < 8) {
    return 'It’s just after sunrise in Omoro. The campus is waking up.';
  }
  if (m.hour >= 8 && m.hour < 13) {
    return `It’s ${m.clock} in Omoro — the campus is in class right now.`;
  }
  if (m.hour >= 13 && m.hour < 17) {
    return 'School’s out in Omoro — football on the pitch about now.';
  }
  if (m.hour >= 17 && m.hour < 21) {
    return 'It’s evening in Omoro — dinner time at the campus.';
  }
  return `It’s ${m.clock} in Omoro. The campus is asleep.`;
}

/**
 * The kid-page variant — same moment, this kid's name in it.
 * Weekday school hours get the class line; weekends get play.
 */
export function kidPresenceLine(
  firstName: string,
  now: Date = new Date()
): string {
  const m = campusNow(now);
  const weekend = m.day === 0 || m.day === 6;
  if (m.isSunday && m.hour >= 8 && m.hour < 17) {
    return `It’s Sunday at the campus — letter day. If ${firstName} has a reply for you, it’s moving today.`;
  }
  if (m.hour >= 6 && m.hour < 8) {
    return `It’s just after sunrise in Omoro — ${firstName} is getting ready for the day.`;
  }
  if (m.hour >= 8 && m.hour < 13) {
    return weekend
      ? `It’s ${m.clock} in Omoro — ${firstName} is out playing about now.`
      : `It’s ${m.clock} in Omoro — ${firstName} is in class right now.`;
  }
  if (m.hour >= 13 && m.hour < 17) {
    return `School’s out in Omoro — ${firstName} is probably on the pitch about now.`;
  }
  if (m.hour >= 17 && m.hour < 21) {
    return `It’s evening in Omoro — dinner time for ${firstName} and the campus.`;
  }
  return `It’s ${m.clock} in Omoro — ${firstName} is asleep.`;
}

/**
 * The composer variant — frames what happens to a note sent at this
 * moment. Night sends get the best line in the app.
 */
export function composerPresenceLine(
  firstName: string,
  now: Date = new Date()
): string {
  const m = campusNow(now);
  if (m.isNight) {
    return `It’s ${m.clock} in Omoro — ${firstName} is asleep. Your note will be waiting when the campus wakes up.`;
  }
  if (m.isSunday) {
    return `It’s Sunday at the campus — letter day. Good timing.`;
  }
  return `It’s ${m.clock} in Omoro. Notes travel in the Sunday batch.`;
}
