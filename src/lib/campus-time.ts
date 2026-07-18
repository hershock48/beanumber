/**
 * campus-time — the presence line (web port of mobile/lib/campusTime.ts).
 *
 * A photo says "this kid exists"; "it's just after sunrise in Omoro —
 * Ismail is getting ready for school" says "this kid is existing at
 * this exact moment, seven time zones from your couch." That's the
 * world-getting-smaller feeling in one sentence, and it changes
 * through the day so the page never reads the same twice.
 *
 * Uganda is UTC+3 (East Africa Time, no DST — the math never drifts).
 * /children/[N] is force-dynamic, so the server-rendered line is
 * computed fresh per request; the composer variant runs client-side.
 *
 * Copy rules (voice.md): specific over vague, personal over
 * institutional. Never guess at hardship, never stage-manage poverty.
 * The lines describe an ordinary school day — because the entire
 * pitch of BAN is that these kids GET an ordinary school day.
 *
 * Sunday is special: letters travel in the Sunday batch. That's a
 * real operational beat, so the site says so.
 *
 * If the copy here changes, change mobile/lib/campusTime.ts to match —
 * the kid should sound like the same kid on both surfaces. (The app
 * builds in isolation, so the file is duplicated, not shared.)
 */

const CAMPUS_UTC_OFFSET_HOURS = 3;

interface CampusMoment {
  hour: number;
  day: number; // 0 = Sunday … 6 = Saturday, at the campus
  clock: string; // "7:05am"
  isNight: boolean;
  isSunday: boolean;
}

function campusNow(now: Date = new Date()): CampusMoment {
  // Shift the UTC timestamp by +3h and read UTC fields — no reliance
  // on any zone database for a zone with no DST.
  const shifted = new Date(now.getTime() + CAMPUS_UTC_OFFSET_HOURS * 3600_000);
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();
  const day = shifted.getUTCDay();

  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  // Plain am/pm — "8:47pm" (Kevin 2026-07-18: the spelled-out
  // daypart read as a time with no am/pm). The standalone daypart
  // sentences ("It's evening in Omoro") keep their words.
  const clock = `${h12}:${String(minute).padStart(2, '0')}${
    hour < 12 ? 'am' : 'pm'
  }`;

  return {
    hour,
    day,
    clock,
    isNight: hour >= 21 || hour < 6,
    isSunday: day === 0,
  };
}

/**
 * The kid-page line — this kid, at this moment, in Omoro.
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
 * The composer line — frames what happens to a note written at this
 * moment. The night variant turns the time difference from friction
 * into warmth.
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
