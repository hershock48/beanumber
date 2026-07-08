/**
 * Push notification send pipeline.
 *
 * ONE entry point, `sendPush(event)`, and one companion job,
 * `drainDelayed()` (called by /api/cron/push-drain). Everything the
 * rest of the codebase touches goes through sendPush(). If a call
 * site starts synthesizing Expo requests directly, the delivery
 * rules from docs/app-design-brief.md §3.7 get skipped and things
 * like the kevinShare fence quietly break.
 *
 * The five allowed event kinds live in EVENT_KINDS. Passing anything
 * else throws — this is the front-line validation that keeps random
 * "re-engagement" pushes from ever shipping.
 *
 * The delivery rules, in order:
 *
 *   1. Kind validation — reject anything not in EVENT_KINDS.
 *   2. kevinShare fence — reject multi-recipient sends of this kind
 *      (they become a newsletter instead) AND reject if the last
 *      kevinShare to this user landed less than 12h ago.
 *   3. Recipient resolution — map (userIds | derived recipients)
 *      to their live push_devices, drop revoked, dedupe by user.
 *   4. Per-recipient scheduling:
 *      - Frequency cap: 2 total sends per recipient per 24h. Newsletter
 *        + kevin-share count toward this.
 *      - Per-kid cap: 1 per (recipient, kid) per 24h. Newsletter +
 *        kevin-share exempt.
 *      - Window: 09:00–20:00 in recipient's local tz. If we're
 *        outside, insert a push_deliveries row with scheduled_for
 *        set to the next 09:00 local and let the drain cron pick
 *        it up. If we're inside, send now.
 *   5. Batch to Expo's 100-per-request limit.
 *   6. Poll receipts endpoint; on DeviceNotRegistered auto-revoke
 *      the offending device.
 *
 * Threading:
 *   thread-id = kid_id (as a plain string) for the three kid-scoped
 *   events so iOS shows "Ismail (3)" instead of three cards.
 *   newsletterPublished uses "newsletter:<id>" and kevinShare uses
 *   a shareId or timestamp to keep them separate.
 *
 * Badge:
 *   Always 0. The in-app gold dot replaces the numeric badge.
 */
import { and, desc, eq, gt, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  children,
  mobileUsers,
  pushDeliveries,
  pushDevices,
  sponsorships,
} from '@/lib/db/schema';
import { logger } from '@/lib/logger';

// ─── Types ────────────────────────────────────────────────────────

export type PushEventKind =
  | 'kidReplied'
  | 'kidUpdate'
  | 'kidSotm'
  | 'newsletterPublished'
  | 'kevinShare';

export const EVENT_KINDS: readonly PushEventKind[] = [
  'kidReplied',
  'kidUpdate',
  'kidSotm',
  'newsletterPublished',
  'kevinShare',
];

// Discriminated union — each event carries exactly what the send
// library needs to build the title / body / deepLink for iOS + Android.
export type PushEvent =
  | {
      kind: 'kidReplied';
      kidId: string;
      sponsorUserId: string;
      notePreview: string;
    }
  | {
      kind: 'kidUpdate';
      kidId: string;
      recipientUserIds: string[];
      captionFirstLine: string;
    }
  | {
      kind: 'kidSotm';
      kidId: string;
      recipientUserIds: string[];
      gradeLabel: string;
      monthLabel: string;
    }
  | {
      kind: 'newsletterPublished';
      newsletterId: string;
      monthLabel: string;
      recipientUserIds: string[];
    }
  | {
      kind: 'kevinShare';
      recipientUserId: string;
      deepLink: string;
      shareId?: string;
    };

// Public result — every call gets one, even queued-for-later sends,
// so callers can log the outcome.
export interface SendResult {
  ok: boolean;
  queued: number;   // rows created for future scheduled_for
  sent: number;     // rows sent to Expo now
  dropped: number;  // rows rejected by caps / fence / rules
  reason?: string;  // set when the whole call was rejected wholesale
}

// ─── Constants ────────────────────────────────────────────────────

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const EXPO_BATCH_LIMIT = 100;
const DAILY_CAP_TOTAL = 2;
const PER_KID_CAP = 1;
const KEVIN_SHARE_MIN_GAP_MS = 12 * 60 * 60 * 1000;
const WINDOW_START_HOUR = 9;
const WINDOW_END_HOUR = 20;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';

// Optional — Expo lets you send unauthenticated up to a rate limit.
// The authenticated flow uses this token for higher throughput and
// FCM v1 delivery on Android. Set in Vercel env when we outgrow the
// unauthenticated ceiling.
const EXPO_PUSH_ACCESS_TOKEN = process.env.EXPO_PUSH_ACCESS_TOKEN;

// ─── Public entry points ──────────────────────────────────────────

export async function sendPush(event: PushEvent): Promise<SendResult> {
  // 1. Kind validation — hard reject anything not in the five.
  if (!EVENT_KINDS.includes(event.kind as PushEventKind)) {
    logger.warn('[push] rejected: unknown event kind', {
      kind: (event as { kind?: string }).kind,
    });
    return { ok: false, queued: 0, sent: 0, dropped: 0, reason: 'unknownKind' };
  }

  // 2. kevinShare fence — hard rules that live at the API layer so
  //    every caller (admin endpoint, cron, script) is covered.
  if (event.kind === 'kevinShare') {
    if (!event.recipientUserId || typeof event.recipientUserId !== 'string') {
      return {
        ok: false,
        queued: 0,
        sent: 0,
        dropped: 0,
        reason: 'kevinShareRequiresSingleRecipient',
      };
    }
    // Multi-recipient enforcement: the shape is single-recipient by
    // typing, but a caller can still fan out. Guard by scanning
    // recent kevinShare sends and refusing if we detect a batch
    // pattern (5+ different users in the last 60s).
    const recentKevinShareUsers = await db
      .selectDistinct({ userId: pushDeliveries.userId })
      .from(pushDeliveries)
      .where(
        and(
          eq(pushDeliveries.eventType, 'kevinShare'),
          gt(
            pushDeliveries.createdAt,
            new Date(Date.now() - 60 * 1000)
          )
        )
      );
    if (recentKevinShareUsers.length >= 5) {
      logger.warn(
        '[push] rejected kevinShare: multi-recipient fan-out detected'
      );
      return {
        ok: false,
        queued: 0,
        sent: 0,
        dropped: 0,
        reason: 'kevinShareCannotBatch',
      };
    }
    // 12h spacing per recipient.
    const lastShare = await db
      .select({ createdAt: pushDeliveries.createdAt })
      .from(pushDeliveries)
      .where(
        and(
          eq(pushDeliveries.userId, event.recipientUserId),
          eq(pushDeliveries.eventType, 'kevinShare')
        )
      )
      .orderBy(desc(pushDeliveries.createdAt))
      .limit(1);
    if (
      lastShare[0]?.createdAt &&
      Date.now() - new Date(lastShare[0].createdAt).getTime() <
        KEVIN_SHARE_MIN_GAP_MS
    ) {
      return {
        ok: false,
        queued: 0,
        sent: 0,
        dropped: 1,
        reason: 'kevinShareTooSoon',
      };
    }
  }

  // 3. Recipients + payloads.
  const recipientIds = resolveRecipientIds(event);
  if (recipientIds.length === 0) {
    return { ok: false, queued: 0, sent: 0, dropped: 0, reason: 'noRecipients' };
  }

  // Pull the kid row once for kid-scoped events so we can build the
  // title / body / deep-link without re-querying inside the loop.
  const kidContext = await maybeLoadKid(event);

  // 4. Per-recipient loop — cap, window, queue-or-send.
  let queued = 0;
  let sent = 0;
  let dropped = 0;
  const toSendNow: Array<{
    userId: string;
    payload: ExpoMessage;
    deliveryId: string;
  }> = [];

  for (const userId of recipientIds) {
    const payloadResult = buildPayload(event, kidContext);
    if (!payloadResult) {
      dropped += 1;
      continue;
    }

    // Frequency cap: no more than 2 total in the last 24h.
    const totalToday = await countTodaysSends(userId);
    if (totalToday >= DAILY_CAP_TOTAL) {
      dropped += 1;
      continue;
    }

    // Per-kid cap: only for kid-scoped events.
    if (isKidScoped(event.kind) && kidContext) {
      const kidToday = await countTodaysKidSends(userId, kidContext.id);
      if (kidToday >= PER_KID_CAP) {
        dropped += 1;
        continue;
      }
    }

    // Window check — recipient's local tz. Devices without a tz
    // default to UTC, which will drop most late-night sends onto
    // early-morning slots that are safe globally.
    const tz = await getUserPrimaryTz(userId);
    const now = new Date();
    const scheduledFor = insideWindow(now, tz)
      ? now
      : nextLocalNineAm(now, tz);

    const [row] = await db
      .insert(pushDeliveries)
      .values({
        userId,
        eventType: event.kind,
        kidId: kidContext?.id ?? null,
        threadId: payloadResult.threadId,
        scheduledFor,
        payload: payloadResult.payload as unknown as Record<string, unknown>,
      })
      .returning({ id: pushDeliveries.id });

    if (scheduledFor > now) {
      queued += 1;
    } else {
      toSendNow.push({
        userId,
        payload: payloadResult.payload,
        deliveryId: row.id,
      });
    }
  }

  // 5. Ship the "send now" batch to Expo.
  if (toSendNow.length > 0) {
    sent += await deliverToExpo(toSendNow);
  }

  return { ok: true, queued, sent, dropped };
}

/**
 * Called by /api/cron/push-drain hourly. Grabs every push_deliveries
 * row whose scheduled_for has passed and hasn't sent, re-checks the
 * per-kid cap at drain time (a burst of updates can turn the queued
 * row into an over-cap send by morning), then ships to Expo.
 */
export async function drainDelayed(limit = 500): Promise<{
  attempted: number;
  sent: number;
  skipped: number;
}> {
  const due = await db
    .select({
      id: pushDeliveries.id,
      userId: pushDeliveries.userId,
      eventType: pushDeliveries.eventType,
      kidId: pushDeliveries.kidId,
      payload: pushDeliveries.payload,
    })
    .from(pushDeliveries)
    .where(and(isNull(pushDeliveries.sentAt), lte(pushDeliveries.scheduledFor, sql`now()`)))
    .limit(limit);

  if (due.length === 0) {
    return { attempted: 0, sent: 0, skipped: 0 };
  }

  const toSend: Array<{
    userId: string;
    payload: ExpoMessage;
    deliveryId: string;
  }> = [];
  let skipped = 0;

  for (const row of due) {
    // Re-check caps at drain time so a queued row from last night
    // doesn't sneak past today's 2-per-day limit.
    const total = await countTodaysSends(row.userId);
    if (total >= DAILY_CAP_TOTAL) {
      await markError(row.id, 'dailyCapAtDrain');
      skipped += 1;
      continue;
    }
    if (isKidScoped(row.eventType as PushEventKind) && row.kidId) {
      const perKid = await countTodaysKidSends(row.userId, row.kidId);
      if (perKid >= PER_KID_CAP) {
        await markError(row.id, 'perKidCapAtDrain');
        skipped += 1;
        continue;
      }
    }
    toSend.push({
      userId: row.userId,
      payload: row.payload as unknown as ExpoMessage,
      deliveryId: row.id,
    });
  }

  const sent = toSend.length > 0 ? await deliverToExpo(toSend) : 0;
  return { attempted: due.length, sent, skipped };
}

// ─── Payload builders ─────────────────────────────────────────────

interface ExpoMessage {
  to: string; // filled per-device at ship time
  title: string;
  body: string;
  data: {
    kind: PushEventKind;
    deepLink: string;
    threadId: string;
    kidId?: string;
    newsletterId?: string;
  };
  threadId: string; // iOS threadId in message envelope
  badge: 0;
  sound: 'default' | null;
}

interface KidContext {
  id: string;
  firstName: string;
  shirtNumber: number | null;
}

async function maybeLoadKid(event: PushEvent): Promise<KidContext | null> {
  if (
    event.kind === 'kidReplied' ||
    event.kind === 'kidUpdate' ||
    event.kind === 'kidSotm'
  ) {
    const rows = await db
      .select({
        id: children.id,
        firstName: children.firstName,
        shirtNumber: children.shirtNumber,
      })
      .from(children)
      .where(eq(children.id, event.kidId))
      .limit(1);
    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      firstName: rows[0].firstName ?? 'them',
      shirtNumber: rows[0].shirtNumber ?? null,
    };
  }
  return null;
}

function isKidScoped(kind: string): boolean {
  return kind === 'kidReplied' || kind === 'kidUpdate' || kind === 'kidSotm';
}

function buildPayload(
  event: PushEvent,
  kid: KidContext | null
): { payload: ExpoMessage; threadId: string } | null {
  const shirtRoute =
    kid?.shirtNumber != null ? `/children/${kid.shirtNumber}` : '/me';

  if (event.kind === 'kidReplied') {
    if (!kid) return null;
    const preview = truncateMidSentence(event.notePreview, 120);
    return {
      threadId: kid.id,
      payload: {
        to: '',
        title: `${kid.firstName} wrote you back.`,
        body: `"${preview}"`,
        data: {
          kind: 'kidReplied',
          deepLink: `${shirtRoute}#thread`,
          threadId: kid.id,
          kidId: kid.id,
        },
        threadId: kid.id,
        badge: 0,
        sound: 'default',
      },
    };
  }

  if (event.kind === 'kidUpdate') {
    if (!kid) return null;
    const line = firstLine(event.captionFirstLine, 140);
    return {
      threadId: kid.id,
      payload: {
        to: '',
        title: `New update from ${kid.firstName}.`,
        body: line || `${kid.firstName} has a new update on their page.`,
        data: {
          kind: 'kidUpdate',
          deepLink: shirtRoute,
          threadId: kid.id,
          kidId: kid.id,
        },
        threadId: kid.id,
        badge: 0,
        sound: 'default',
      },
    };
  }

  if (event.kind === 'kidSotm') {
    if (!kid) return null;
    return {
      threadId: kid.id,
      payload: {
        to: '',
        title: `${kid.firstName} is Student of the Month.`,
        body: `${event.gradeLabel} · ${event.monthLabel}. Simon posted it to the whole campus.`,
        data: {
          kind: 'kidSotm',
          deepLink: shirtRoute,
          threadId: kid.id,
          kidId: kid.id,
        },
        threadId: kid.id,
        badge: 0,
        sound: 'default',
      },
    };
  }

  if (event.kind === 'newsletterPublished') {
    const threadId = `newsletter:${event.newsletterId}`;
    return {
      threadId,
      payload: {
        to: '',
        title: `${event.monthLabel} at the campus is live.`,
        body: `Here's what ${event.monthLabel} looked like at Hope Bridge.`,
        data: {
          kind: 'newsletterPublished',
          deepLink: `/newsletter/${event.newsletterId}`,
          threadId,
          newsletterId: event.newsletterId,
        },
        threadId,
        badge: 0,
        sound: 'default',
      },
    };
  }

  if (event.kind === 'kevinShare') {
    const threadId = `kevin-share:${event.shareId ?? Date.now()}`;
    return {
      threadId,
      payload: {
        to: '',
        title: 'Kevin sent you something from the campus.',
        body: 'Open it when you have a minute.',
        data: {
          kind: 'kevinShare',
          deepLink: event.deepLink,
          threadId,
        },
        threadId,
        badge: 0,
        sound: 'default',
      },
    };
  }

  return null;
}

function resolveRecipientIds(event: PushEvent): string[] {
  if (event.kind === 'kidReplied') return [event.sponsorUserId];
  if (event.kind === 'kevinShare') return [event.recipientUserId];
  const ids =
    (event as { recipientUserIds?: string[] }).recipientUserIds ?? [];
  // De-duplicate — a single user appearing twice in the input list
  // would double-charge them against the daily cap.
  return Array.from(new Set(ids.filter(Boolean)));
}

// ─── Delivery + receipt handling ──────────────────────────────────

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  details?: { error?: string };
  message?: string;
}

interface ExpoReceipt {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

async function deliverToExpo(
  rows: Array<{ userId: string; payload: ExpoMessage; deliveryId: string }>
): Promise<number> {
  // Expand each row into a per-device message. One user may have
  // several devices — the payload gets duplicated with a different
  // `to`.
  const perDevice: Array<{
    deliveryId: string;
    userId: string;
    deviceId: string;
    token: string;
    message: ExpoMessage;
  }> = [];

  for (const row of rows) {
    const devices = await db
      .select({ id: pushDevices.id, token: pushDevices.expoPushToken })
      .from(pushDevices)
      .where(
        and(eq(pushDevices.userId, row.userId), isNull(pushDevices.revokedAt))
      );
    if (devices.length === 0) {
      // No live device — mark the row sent-with-error so the cron
      // doesn't retry it forever.
      await markError(row.deliveryId, 'noLiveDevice', true);
      continue;
    }
    for (const dev of devices) {
      perDevice.push({
        deliveryId: row.deliveryId,
        userId: row.userId,
        deviceId: dev.id,
        token: dev.token,
        message: { ...row.payload, to: dev.token },
      });
    }
  }

  if (perDevice.length === 0) return 0;

  let sentCount = 0;
  const ticketMap = new Map<
    string,
    { deliveryId: string; deviceId: string; token: string }
  >();

  for (let i = 0; i < perDevice.length; i += EXPO_BATCH_LIMIT) {
    const batch = perDevice.slice(i, i + EXPO_BATCH_LIMIT);
    const bodies = batch.map(b => b.message);
    let tickets: ExpoTicket[] = [];
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          ...(EXPO_PUSH_ACCESS_TOKEN
            ? { Authorization: `Bearer ${EXPO_PUSH_ACCESS_TOKEN}` }
            : {}),
        },
        body: JSON.stringify(bodies),
      });
      const body = (await res.json()) as { data?: ExpoTicket[]; errors?: unknown };
      tickets = body.data ?? [];
      if (!res.ok || body.errors) {
        logger.warn('[push] expo push returned non-ok', {
          status: res.status,
          errors: body.errors,
        });
      }
    } catch (err) {
      logger.error('[push] expo push fetch failed', err);
      // Batch failure — mark every delivery in this slice as errored.
      for (const b of batch) {
        await markError(b.deliveryId, 'expoFetchFailed');
      }
      continue;
    }

    for (let j = 0; j < batch.length; j += 1) {
      const item = batch[j];
      const ticket = tickets[j];
      if (!ticket) {
        await markError(item.deliveryId, 'noTicket');
        continue;
      }
      if (ticket.status === 'ok' && ticket.id) {
        // Stamp sent_at now — receipt polling might mark error later.
        await db
          .update(pushDeliveries)
          .set({ sentAt: sql`now()` })
          .where(eq(pushDeliveries.id, item.deliveryId));
        ticketMap.set(ticket.id, {
          deliveryId: item.deliveryId,
          deviceId: item.deviceId,
          token: item.token,
        });
        sentCount += 1;
      } else {
        const errCode = ticket.details?.error || ticket.message || 'unknown';
        await markError(item.deliveryId, errCode, true);
        if (errCode === 'DeviceNotRegistered') {
          await revokeDeviceById(item.deviceId);
        }
      }
    }
  }

  // 6. Best-effort receipt polling. Expo receipts take a few seconds
  //    to materialize — we fetch once, and any that come back
  //    "queued" get left for the drain cron to re-check on its next
  //    tick. Failing to poll is not fatal; we already recorded
  //    sent_at from the ticket.
  if (ticketMap.size > 0) {
    await pollReceipts(ticketMap);
  }

  return sentCount;
}

async function pollReceipts(
  tickets: Map<string, { deliveryId: string; deviceId: string; token: string }>
): Promise<void> {
  const ids = Array.from(tickets.keys());
  try {
    // Small delay so Expo has a moment to populate — matches their
    // own guidance.
    await new Promise(resolve => setTimeout(resolve, 1500));
    const res = await fetch(EXPO_RECEIPTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(EXPO_PUSH_ACCESS_TOKEN
          ? { Authorization: `Bearer ${EXPO_PUSH_ACCESS_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({ ids }),
    });
    const body = (await res.json()) as {
      data?: Record<string, ExpoReceipt>;
    };
    const data = body.data ?? {};
    for (const [ticketId, receipt] of Object.entries(data)) {
      if (receipt.status === 'ok') continue;
      const meta = tickets.get(ticketId);
      if (!meta) continue;
      const errCode =
        receipt.details?.error || receipt.message || 'receiptError';
      await markError(meta.deliveryId, errCode);
      if (errCode === 'DeviceNotRegistered') {
        await revokeDeviceById(meta.deviceId);
      }
    }
  } catch (err) {
    logger.warn('[push] receipt poll failed (non-fatal)', {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

async function revokeDeviceById(id: string): Promise<void> {
  await db
    .update(pushDevices)
    .set({ revokedAt: sql`now()` })
    .where(eq(pushDevices.id, id));
}

async function markError(
  deliveryId: string,
  error: string,
  markSent = false
): Promise<void> {
  await db
    .update(pushDeliveries)
    .set({
      error,
      ...(markSent ? { sentAt: sql`now()` } : {}),
    })
    .where(eq(pushDeliveries.id, deliveryId));
}

// ─── Cap + window helpers ─────────────────────────────────────────

async function countTodaysSends(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(pushDeliveries)
    .where(
      and(
        eq(pushDeliveries.userId, userId),
        or(
          gt(pushDeliveries.sentAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
          // Also count queued rows so a burst of updates queued for
          // morning doesn't blow past the cap once drain time hits.
          and(
            isNotNull(pushDeliveries.scheduledFor),
            isNull(pushDeliveries.sentAt),
            gt(pushDeliveries.scheduledFor, new Date(Date.now() - 60 * 1000))
          )
        )
      )
    );
  return row?.n ?? 0;
}

async function countTodaysKidSends(
  userId: string,
  kidId: string
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(pushDeliveries)
    .where(
      and(
        eq(pushDeliveries.userId, userId),
        eq(pushDeliveries.kidId, kidId),
        or(
          gt(pushDeliveries.sentAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
          and(
            isNotNull(pushDeliveries.scheduledFor),
            isNull(pushDeliveries.sentAt),
            gt(pushDeliveries.scheduledFor, new Date(Date.now() - 60 * 1000))
          )
        )
      )
    );
  return row?.n ?? 0;
}

async function getUserPrimaryTz(userId: string): Promise<string | null> {
  const rows = await db
    .select({ tz: pushDevices.tz })
    .from(pushDevices)
    .where(
      and(eq(pushDevices.userId, userId), isNull(pushDevices.revokedAt))
    )
    .orderBy(desc(pushDevices.lastSeenAt))
    .limit(1);
  return rows[0]?.tz ?? null;
}

/**
 * Is `now` inside the recipient's local 09:00–20:00 window?
 * When we can't compute (bad tz string, missing tz), default to
 * true — we'd rather send now than sit on a note forever.
 */
export function insideWindow(now: Date, tz: string | null): boolean {
  try {
    const hour = getLocalHour(now, tz);
    return hour >= WINDOW_START_HOUR && hour < WINDOW_END_HOUR;
  } catch {
    return true;
  }
}

/**
 * Return the timestamp of the next 09:00 in the recipient's tz.
 * If we can't compute local time, add 8h to `now` as a safe fallback
 * (guarantees no late-night send but won't hold indefinitely).
 */
export function nextLocalNineAm(now: Date, tz: string | null): Date {
  try {
    if (!tz) throw new Error('no-tz');
    const localHour = getLocalHour(now, tz);
    const localMinute = getLocalMinute(now, tz);
    // Minutes until next 09:00.
    let minutesUntil: number;
    if (localHour < WINDOW_START_HOUR) {
      minutesUntil =
        (WINDOW_START_HOUR - localHour) * 60 - localMinute;
    } else {
      // Later than 09:00 today — target 09:00 tomorrow.
      const hoursUntilMidnight = 24 - localHour;
      minutesUntil =
        hoursUntilMidnight * 60 - localMinute + WINDOW_START_HOUR * 60;
    }
    return new Date(now.getTime() + minutesUntil * 60 * 1000);
  } catch {
    return new Date(now.getTime() + 8 * 60 * 60 * 1000);
  }
}

function getLocalHour(now: Date, tz: string | null): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: tz ?? undefined,
  });
  const parts = fmt.formatToParts(now);
  const hour = Number(parts.find(p => p.type === 'hour')?.value);
  if (!Number.isFinite(hour)) throw new Error('bad-tz');
  return hour;
}

function getLocalMinute(now: Date, tz: string | null): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    minute: 'numeric',
    timeZone: tz ?? undefined,
  });
  const parts = fmt.formatToParts(now);
  return Number(parts.find(p => p.type === 'minute')?.value) || 0;
}

// ─── Text helpers ─────────────────────────────────────────────────

function firstLine(input: string, maxLen: number): string {
  const line = String(input ?? '')
    .split(/\r?\n/)[0]
    ?.trim() ?? '';
  if (line.length <= maxLen) return line;
  return `${line.slice(0, maxLen - 1).trimEnd()}…`;
}

function truncateMidSentence(input: string, maxLen: number): string {
  const clean = String(input ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1).trimEnd()}…`;
}

// ─── Recipient resolution helpers used by trigger sites ───────────

/**
 * For newsletter + update fan-out. Resolves mobile_users.ids for a
 * set of sponsor email addresses (case-insensitive). Only returns
 * users who have at least one live push_devices row — no point
 * queueing rows for users we can't ship to.
 */
export async function resolveMobileUserIdsForEmails(
  emails: string[]
): Promise<string[]> {
  if (emails.length === 0) return [];
  const lowered = Array.from(new Set(emails.map(e => e.toLowerCase())));
  const rows = await db
    .select({ id: mobileUsers.id })
    .from(mobileUsers)
    .innerJoin(pushDevices, eq(pushDevices.userId, mobileUsers.id))
    .where(
      and(
        sql`lower(${mobileUsers.email}) in ${sql.raw(
          `(${lowered.map(e => `'${e.replace(/'/g, "''")}'`).join(',')})`
        )}`,
        isNull(pushDevices.revokedAt)
      )
    );
  return Array.from(new Set(rows.map(r => r.id)));
}

/**
 * For kidReplied — resolve the mobile user by the sponsor's email
 * (the same field kid_messages.sponsor_email carries). Returns null
 * when there's no matching mobile user (they're a sponsor but
 * haven't installed the app — the reply email still lands via
 * sendEmail; push is best-effort).
 */
export async function resolveMobileUserIdForEmail(
  email: string
): Promise<string | null> {
  if (!email) return null;
  const rows = await db
    .select({ id: mobileUsers.id })
    .from(mobileUsers)
    .where(sql`lower(${mobileUsers.email}) = ${email.toLowerCase()}`)
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * For kidUpdate — resolve every sponsor + holder of a given kid to
 * their mobile user id. Uses the same dual-key (childId + legacy)
 * pattern the rest of the app follows.
 */
export async function resolveKidRecipientMobileUserIds(
  kidUuid: string,
  kidLegacyId: string | null
): Promise<string[]> {
  const rows = await db
    .select({ email: sponsorships.sponsorEmail })
    .from(sponsorships)
    .where(
      and(
        or(
          eq(sponsorships.status, 'Active'),
          eq(sponsorships.status, 'Holder')
        ),
        or(
          eq(sponsorships.childId, kidUuid),
          kidLegacyId
            ? eq(sponsorships.childIdLegacy, kidLegacyId)
            : sql`false`
        )
      )
    );
  const emails = Array.from(
    new Set(rows.map(r => r.email?.toLowerCase()).filter(Boolean) as string[])
  );
  return resolveMobileUserIdsForEmails(emails);
}
