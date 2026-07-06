/**
 * POST /api/admin/roster/stage-candidates
 *   Body: { fromShirtNumber: number, replacementRecordId?: string }
 *
 * Auto-reveal-on-depart. Picks ONE replacement (random same-grade
 * preferred, fallback any non-departed kid) and reassigns every
 * Active/Holder/Awaiting sponsorship tied to the departing kid's
 * number. Next visit to /[N] re-fires the RevealOverlay.
 *
 * Same machine as roster/reassign but with auto-pick + email blast.
 * One replacement per Number — pool model means it's fine for many
 * sponsors to share a kid.
 *
 * Admin only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { getAdminRole } from '@/lib/admin-session';
import { isGradeCode, type GradeCode } from '@/lib/grades';

// Reassignment prefers a same-grade candidate; unmatched grades fall
// into the 'unknown' bucket so a null/junk-grade kid never gets
// silently paired with a real-grade one.
function gradeBucket(raw: string | null | undefined): GradeCode | 'unknown' {
  return isGradeCode(raw) ? (raw as GradeCode) : 'unknown';
}
import { sendEmail } from '@/lib/email';
import { makeRecoveryToken } from '@/lib/recovery-tokens';
import { db } from '@/lib/db/client';
import { children, sponsorships } from '@/lib/db/schema';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';

async function findKidByShirtNumber(n: number) {
  const rows = await db
    .select()
    .from(children)
    .where(eq(children.shirtNumber, n))
    .limit(1);
  return rows[0] || null;
}

async function getKidByRecordId(id: string): Promise<typeof children.$inferSelect | null> {
  const rows = await db.select().from(children).where(eq(children.id, id)).limit(1);
  return rows[0] || null;
}

async function listEligibleKids(excludeId: string) {
  const rows = await db
    .select()
    .from(children)
    .where(isNull(children.departedAt));
  return rows.filter(r => r.id !== excludeId);
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function findSponsorshipsForKid(
  childRecordId: string,
  childIdLegacy: string | null
) {
  return db
    .select()
    .from(sponsorships)
    .where(
      and(
        or(
          eq(sponsorships.childId, childRecordId),
          childIdLegacy
            ? eq(sponsorships.childIdLegacy, childIdLegacy)
            : eq(sponsorships.childIdLegacy, '__NEVER__')
        ),
        inArray(sponsorships.status, ['Active', 'Holder', 'Awaiting Sponsor'])
      )
    );
}

export async function POST(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const role = (await getAdminRole()) || 'admin';
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  let body: { fromShirtNumber?: number; replacementRecordId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const fromShirtNumber = body.fromShirtNumber;
  if (
    typeof fromShirtNumber !== 'number' ||
    !Number.isInteger(fromShirtNumber) ||
    fromShirtNumber < 1
  ) {
    return NextResponse.json(
      { error: 'fromShirtNumber must be a positive integer' },
      { status: 400 }
    );
  }

  const departing = await findKidByShirtNumber(fromShirtNumber);
  if (!departing) {
    return NextResponse.json(
      { error: `No kid at shirt #${fromShirtNumber}` },
      { status: 404 }
    );
  }

  // Pick the replacement.
  let replacement: Awaited<ReturnType<typeof getKidByRecordId>> = null;
  if (
    typeof body.replacementRecordId === 'string' &&
    body.replacementRecordId.length > 0
  ) {
    replacement = await getKidByRecordId(body.replacementRecordId);
    if (!replacement) {
      return NextResponse.json(
        { error: 'Replacement record not found' },
        { status: 404 }
      );
    }
  } else {
    const allEligible = await listEligibleKids(departing.id);
    if (allEligible.length === 0) {
      return NextResponse.json(
        { error: 'No eligible candidates on the roster.' },
        { status: 409 }
      );
    }
    const targetGradeKey = gradeBucket(departing.gradeClass);
    const sameGrade = shuffle(
      allEligible.filter(r => gradeBucket(r.gradeClass) === targetGradeKey)
    );
    const others = shuffle(
      allEligible.filter(r => gradeBucket(r.gradeClass) !== targetGradeKey)
    );
    replacement = sameGrade[0] || others[0] || null;
  }
  if (!replacement) {
    return NextResponse.json(
      { error: 'Failed to select a replacement.' },
      { status: 500 }
    );
  }

  const sponsorshipsForKid = await findSponsorshipsForKid(
    departing.id,
    departing.childId
  );

  // ── ShirtNumber transfer ────────────────────────────────────────
  const departingCurrentShirt = departing.shirtNumber;
  const replacementCurrentShirt = replacement.shirtNumber;

  await db
    .update(children)
    .set({
      shirtNumber: null,
      archivedShirtNumber:
        typeof departingCurrentShirt === 'number'
          ? departingCurrentShirt
          : departing.archivedShirtNumber,
      updatedAt: new Date(),
    })
    .where(eq(children.id, departing.id));

  await db
    .update(children)
    .set({
      shirtNumber: fromShirtNumber,
      archivedShirtNumber:
        typeof replacementCurrentShirt === 'number'
          ? replacementCurrentShirt
          : replacement.archivedShirtNumber,
      updatedAt: new Date(),
    })
    .where(eq(children.id, replacement.id));

  // ── Sponsorship rewrites ────────────────────────────────────────
  const now = new Date();
  const departingChildId = departing.childId || '';
  let reassignedCount = 0;
  for (const s of sponsorshipsForKid) {
    const existingHistory = s.previousChildIds || '';
    const updatedHistory = departingChildId
      ? existingHistory
        ? `${existingHistory}\n${departingChildId}`
        : departingChildId
      : existingHistory;
    await db
      .update(sponsorships)
      .set({
        childId: replacement.id,
        childIdLegacy: replacement.childId,
        previousChildIds: updatedHistory,
        lastReassignedAt: now,
        childRevealedAt: null,
        updatedAt: now,
      })
      .where(eq(sponsorships.id, s.id));
    reassignedCount += 1;
  }

  // ── Email each owner ────────────────────────────────────────────
  const departingFirstName =
    departing.firstName ||
    (departing.displayName ? departing.displayName.split(' ')[0] : null) ||
    'your kid';
  let emailsSent = 0;
  let emailsFailed = 0;
  for (const s of sponsorshipsForKid) {
    if (!s.sponsorEmail || !s.sponsorCode) continue;
    try {
      const token = makeRecoveryToken(s.sponsorCode, fromShirtNumber);
      const callbackUrl = `${SITE_URL}/api/sponsor/recover/callback?t=${encodeURIComponent(token)}`;
      const greeting = s.sponsorName
        ? `Hey ${s.sponsorName.split(' ')[0]},`
        : 'Hey there,';
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: Georgia, 'Times New Roman', serif; line-height: 1.7; color: #333; max-width: 560px; margin: 0 auto; padding: 30px 20px;">
            <p style="margin-top: 0;">${greeting}</p>
            <p>
              ${departingFirstName} is no longer at the campus. Your
              Number — #${fromShirtNumber} — has a new kid waiting
              behind it.
            </p>
            <p>Tap below to meet them.</p>
            <p style="text-align: center; margin: 28px 0;">
              <a href="${callbackUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em; text-transform: uppercase;">
                Meet your new kid
              </a>
            </p>
            <p style="color: #888; font-size: 13px;">
              The link signs you in for 30 days. Any questions, just reply &mdash; comes straight to me.
            </p>
            <hr style="border: none; border-top: 1px solid #e8e0d4; margin: 24px 0;">
            <p style="font-size: 12px; color: #999; line-height: 1.5;">
              Kevin Hershock<br>
              Be A Number, International<br>
              <a href="https://www.beanumber.org" style="color: #D4A843;">beanumber.org</a>
            </p>
          </body>
        </html>
      `;
      const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'Kevin@beanumber.org';
      const result = await sendEmail({
        to: { email: s.sponsorEmail, name: s.sponsorName || '' },
        from: { email: fromEmail, name: 'Be A Number' },
        subject: `#${fromShirtNumber} — meet your new kid`,
        html,
      });
      if (result.success) emailsSent += 1;
      else emailsFailed += 1;
    } catch (err) {
      emailsFailed += 1;
      console.error('[AutoReveal] Email send error:', err);
    }
  }

  return NextResponse.json({
    ok: true,
    staged: reassignedCount,
    reassigned: reassignedCount,
    emailsSent,
    emailsFailed,
    replacementRecordId: replacement.id,
    replacementFirstName:
      replacement.firstName || replacement.displayName || null,
  });
}
