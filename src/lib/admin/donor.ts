/**
 * Admin · Donor profile queries (Postgres edition).
 *
 * `listDonors()` powers /admin/donors and `getDonorById()` powers
 * /admin/donor/[id]. The latter assembles a full profile: the donor
 * header, every linked sponsorship, every donation, every logged
 * communication, plus any fulfillment rows matched by email. From
 * those rows we build a reverse-chronological timeline the profile
 * page renders.
 *
 * Postgres reads via Drizzle. Errors throw — page-level error
 * boundary handles them. No caching: Kevin reloads after admin
 * actions and expects fresh data.
 *
 * Function signatures and types are preserved from the Airtable-era
 * module so callers don't need to change.
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  children,
  communications,
  donations,
  donors,
  fulfillments,
  sponsorships,
} from '@/lib/db/schema';

// ─── Public types ───────────────────────────────────────────────

export interface DonorSponsorship {
  recordId: string;
  status: string | null;
  startDate: string | null;
  monthlyAmount: number; // dollars
  childRecordId: string | null;
  childShirtNumber: number | null;
  childName: string | null;
  childPhotoUrl: string | null;
}

export type TimelineKind =
  | 'donation'
  | 'sponsorship_started'
  | 'sponsorship_ended'
  | 'shirt_ordered'
  | 'shirt_shipped'
  | 'interaction';

export interface TimelineEvent {
  at: string; // ISO date or datetime
  kind: TimelineKind;
  summary: string;
  detail?: string;
  amount?: number; // dollars
  direction?: 'outbound' | 'inbound';
  channel?: string;
}

export interface DonorProfile {
  recordId: string;
  name: string;
  organization: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: string | null;
  recurringSupporter: boolean;
  donorSince: string | null;
  mostRecentDonation: string | null;
  lifetimeGiving: number; // dollars
  notes: string;

  dripPipeline: string | null;
  dripStage: number | null;
  dripNextSend: string | null;
  dripChildName: string | null;
  dripShirtNumber: string | null;

  sponsorships: DonorSponsorship[];
  totalSponsorships: number;
  activeSponsorshipCount: number;
  monthlySponsorshipTotal: number;

  lastContactAt: string | null;
  lastContactSummary: string | null;

  timeline: TimelineEvent[];
}

// ─── Helpers ─────────────────────────────────────────────────────

function formatMoney(dollars: number): string {
  return `$${dollars.toLocaleString('en-US', {
    minimumFractionDigits: dollars % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function asIsoOrNull(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return typeof d === 'string' ? d : d.toISOString();
}

// ─── Main fetch ──────────────────────────────────────────────────

export async function getDonorById(donorRecordId: string): Promise<DonorProfile | null> {
  const donorRows = await db
    .select()
    .from(donors)
    .where(eq(donors.id, donorRecordId))
    .limit(1);
  const donor = donorRows[0];
  if (!donor) return null;

  const email = donor.email?.trim() || null;
  const emailLower = email ? email.toLowerCase() : null;

  // Parallel fetches for everything linked to this donor. Email is
  // the only string key that crosses table boundaries (fulfillments
  // / sponsorships don't FK to donors); we always compare via
  // lower(email) = lower(X), never plain eq, to match the project's
  // case-insensitive convention.
  const [donationRows, sponsorshipRows, communicationRows, fulfillmentRows] =
    await Promise.all([
      db
        .select()
        .from(donations)
        .where(eq(donations.donorId, donor.id))
        .orderBy(desc(donations.donationDate)),
      emailLower
        ? db
            .select({
              s: sponsorships,
              c: children,
            })
            .from(sponsorships)
            .leftJoin(children, eq(children.id, sponsorships.childId))
            .where(
              sql`lower(${sponsorships.sponsorEmail}) = ${emailLower}`
            )
            .orderBy(desc(sponsorships.createdAt))
        : Promise.resolve(
            [] as Array<{
              s: typeof sponsorships.$inferSelect;
              c: typeof children.$inferSelect | null;
            }>
          ),
      db
        .select()
        .from(communications)
        .where(eq(communications.relatedDonorId, donor.id))
        .orderBy(desc(communications.sendDate)),
      emailLower
        ? db
            .select()
            .from(fulfillments)
            .where(
              sql`lower(${fulfillments.buyerEmail}) = ${emailLower}`
            )
            .orderBy(desc(fulfillments.orderDate))
        : Promise.resolve([] as Array<typeof fulfillments.$inferSelect>),
    ]);

  // Sponsorships → DonorSponsorship. Hydrated kid comes from the
  // LEFT JOIN; legacy-keyed rows with no UUID FK fall back to the
  // denormalized fields on the sponsorship itself.
  const sponsorshipsOut: DonorSponsorship[] = sponsorshipRows.map(({ s, c }) => {
    const photoUrl = c?.profilePhotoUrl || null;
    const childName =
      c?.displayName || c?.firstName || s.childDisplayName || null;
    return {
      recordId: s.id,
      status: s.status ?? null,
      startDate: s.sponsorshipStartDate ?? null,
      monthlyAmount: Number(s.monthlyAmount ?? 0),
      childRecordId: c?.id ?? null,
      childShirtNumber: c?.shirtNumber ?? null,
      childName,
      childPhotoUrl: photoUrl,
    };
  });

  const activeSponsorships = sponsorshipsOut.filter(
    s => (s.status || '').toLowerCase() === 'active'
  );
  const monthlyTotal = activeSponsorships.reduce(
    (sum, s) => sum + (s.monthlyAmount || 0),
    0
  );

  // ─── Build timeline ─────────────────────────────────────────────

  const timeline: TimelineEvent[] = [];

  // Donations
  for (const d of donationRows) {
    const at = d.donationDate
      ? new Date(d.donationDate).toISOString()
      : new Date(d.createdAt).toISOString();
    const amount = Number(d.donationAmount ?? 0);
    const source = d.donationSource;
    const recurring = !!d.recurringDonation;
    const note = d.donationNote?.trim() || undefined;
    timeline.push({
      at,
      kind: 'donation',
      summary: `${formatMoney(amount)}${recurring ? ' recurring' : ''}${
        source ? ' · ' + source : ''
      }`,
      detail: note,
      amount,
    });
  }

  // Sponsorship start / end events
  for (const s of sponsorshipsOut) {
    if (s.startDate) {
      timeline.push({
        at: s.startDate,
        kind: 'sponsorship_started',
        summary: `Started sponsoring ${s.childName || 'a kid'}${
          s.monthlyAmount ? ' at ' + formatMoney(s.monthlyAmount) + '/mo' : ''
        }`,
      });
    }
    if ((s.status || '').toLowerCase() === 'cancelled') {
      timeline.push({
        at:
          s.startDate ||
          (donor.createdAt ? new Date(donor.createdAt).toISOString() : new Date().toISOString()),
        kind: 'sponsorship_ended',
        summary: `Sponsorship of ${s.childName || 'a kid'} ended`,
      });
    }
  }

  // Shirts (Fulfillment) — order placed + shipped
  for (const o of fulfillmentRows) {
    const orderDate = o.orderDate ? new Date(o.orderDate).toISOString() : null;
    const orderNum = o.orderNumber ?? null;
    const color = o.shirtColor;
    const size = o.size;
    if (orderDate) {
      timeline.push({
        at: orderDate,
        kind: 'shirt_ordered',
        summary: `Bought shirt${orderNum ? ' #' + orderNum : ''}${
          color ? ' · ' + color : ''
        }${size ? ' ' + size : ''}`,
      });
    }
    if (o.shipping === 'Shipped' && orderDate) {
      // We don't have a ship date column — best-effort: use order
      // date. (Once Fulfillment grows a shipped_at column this would
      // be exact.)
      timeline.push({
        at: orderDate,
        kind: 'shirt_shipped',
        summary: `Shirt${orderNum ? ' #' + orderNum : ''} shipped${
          o.tracking ? ' · ' + o.tracking : ''
        }`,
      });
    }
  }

  // Communications — Postgres-native equivalent of the Airtable
  // Interactions table. The Airtable version split direction +
  // channel into singleSelects; Postgres just stores an email_type
  // and treats every row as outbound (we don't ingest inbound yet).
  let lastContactAt: string | null = null;
  let lastContactSummary: string | null = null;
  for (const c of communicationRows) {
    const at = c.sendDate
      ? new Date(c.sendDate).toISOString()
      : new Date(c.createdAt).toISOString();
    const direction: 'outbound' | 'inbound' = 'outbound';
    const channel = (c.emailType || 'email').toString();
    const subject = c.subject?.trim() || 'Reached out';
    timeline.push({
      at,
      kind: 'interaction',
      summary: subject,
      detail: undefined,
      direction,
      channel,
    });
    if (!lastContactAt || new Date(at).getTime() > new Date(lastContactAt).getTime()) {
      lastContactAt = at;
      lastContactSummary = `Kevin · ${channel} · ${subject}`;
    }
  }

  // Sort timeline desc.
  timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return {
    recordId: donor.id,
    name: donor.name?.trim() || 'Unknown donor',
    organization: donor.organizationName?.trim() || null,
    email,
    phone: donor.phoneNumber?.trim() || null,
    address: donor.mailingAddress?.trim() || null,
    status: donor.donorStatus ?? null,
    recurringSupporter: !!donor.recurringSupporter,
    donorSince: donor.firstDonationDate ?? null,
    mostRecentDonation: donor.mostRecentDonation ?? null,
    lifetimeGiving: Number(donor.totalLifetimeGiving ?? 0),
    notes: donor.notes?.trim() || '',

    dripPipeline: donor.dripPipeline ?? null,
    dripStage: donor.dripStage ?? null,
    dripNextSend: donor.dripNextSend ?? null,
    dripChildName: donor.dripChildName ?? null,
    dripShirtNumber: donor.dripShirtNumber ?? null,

    sponsorships: sponsorshipsOut,
    totalSponsorships: sponsorshipsOut.length,
    activeSponsorshipCount: activeSponsorships.length,
    monthlySponsorshipTotal: monthlyTotal,

    lastContactAt,
    lastContactSummary,

    timeline,
  };
}

// ─── Donor list (for the directory page) ────────────────────────

export interface DonorListEntry {
  recordId: string;
  name: string;
  email: string | null;
  lifetimeGiving: number;
  recurringSupporter: boolean;
  status: string | null;
  sponsorshipCount: number;
  donorSince: string | null;
  mostRecentDonation: string | null;
}

export async function listDonors(): Promise<DonorListEntry[]> {
  // One query per donor would be N+1; instead aggregate sponsorship
  // counts per email in a single grouped subquery, then join.
  const sponsorshipCountByEmail = db
    .select({
      sponsorEmailLower: sql<string>`lower(${sponsorships.sponsorEmail})`.as(
        'sponsor_email_lower'
      ),
      total: sql<number>`count(*)::int`.as('total'),
    })
    .from(sponsorships)
    .where(
      and(
        sql`${sponsorships.sponsorEmail} IS NOT NULL`,
        sql`${sponsorships.sponsorEmail} <> ''`
      )
    )
    .groupBy(sql`lower(${sponsorships.sponsorEmail})`)
    .as('sc');

  const rows = await db
    .select({
      id: donors.id,
      name: donors.name,
      email: donors.email,
      lifetimeGiving: donors.totalLifetimeGiving,
      recurring: donors.recurringSupporter,
      status: donors.donorStatus,
      donorSince: donors.firstDonationDate,
      mostRecentDonation: donors.mostRecentDonation,
      sponsorshipCount: sql<number | null>`coalesce(${sponsorshipCountByEmail.total}, 0)`,
    })
    .from(donors)
    .leftJoin(
      sponsorshipCountByEmail,
      sql`${sponsorshipCountByEmail.sponsorEmailLower} = lower(${donors.email})`
    );

  const out: DonorListEntry[] = rows.map(r => ({
    recordId: r.id,
    name: r.name?.trim() || 'Unknown',
    email: r.email?.trim() || null,
    lifetimeGiving: Number(r.lifetimeGiving ?? 0),
    recurringSupporter: !!r.recurring,
    status: r.status ?? null,
    sponsorshipCount: Number(r.sponsorshipCount ?? 0),
    donorSince: r.donorSince ? asIsoOrNull(r.donorSince) : null,
    mostRecentDonation: r.mostRecentDonation
      ? asIsoOrNull(r.mostRecentDonation)
      : null,
  }));
  // Most recent activity first.
  out.sort((a, b) => {
    const ad = a.mostRecentDonation || a.donorSince || '';
    const bd = b.mostRecentDonation || b.donorSince || '';
    return bd.localeCompare(ad);
  });
  return out;
}
