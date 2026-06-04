/**
 * Live campus context helpers. Returns a sentence the home screen
 * shows above the input — "It's 9:43 PM in Omoro. Most kids are
 * already home." Turns the campus from a concept into a place
 * with a clock.
 *
 * Africa/Kampala is the campus timezone (UTC+3, no DST).
 */

const CAMPUS_TIMEZONE = 'Africa/Kampala';

interface CampusTime {
  hour: number;
  minute: number;
  formatted: string;
}

function campusNow(): CampusTime {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: CAMPUS_TIMEZONE,
  });
  const formatted = fmt.format(now);
  // For deciding what the campus is doing, we need the hour in
  // Kampala time. Pull it out of a 24h formatter so the logic is
  // deterministic regardless of the rendered string.
  const fmt24 = new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
    timeZone: CAMPUS_TIMEZONE,
  });
  const parts = fmt24.format(now).split(':');
  const hour = parseInt(parts[0] ?? '0', 10);
  const minute = parseInt(parts[1] ?? '0', 10);
  return { hour, minute, formatted };
}

/**
 * One-line current campus context. Decides which activity is
 * plausibly happening based on the hour at Hope Bridge. Not
 * promised — just plausible.
 */
export function getCampusContextLine(): { time: string; doing: string } {
  const { hour, formatted } = campusNow();
  let doing: string;
  if (hour >= 5 && hour < 7) {
    doing = 'Morning porridge is on.';
  } else if (hour >= 7 && hour < 9) {
    doing = 'Walking to school.';
  } else if (hour >= 9 && hour < 12) {
    doing = 'In class.';
  } else if (hour >= 12 && hour < 14) {
    doing = 'Hot lunch is on.';
  } else if (hour >= 14 && hour < 16) {
    doing = 'In class.';
  } else if (hour >= 16 && hour < 18) {
    doing = 'Walking home or playing.';
  } else if (hour >= 18 && hour < 21) {
    doing = 'Evening at home with family.';
  } else {
    doing = 'Most kids are asleep.';
  }
  return { time: `${formatted} in Omoro`, doing };
}
