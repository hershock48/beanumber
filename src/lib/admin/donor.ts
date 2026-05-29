/**
 * Admin · Donor profile queries.
 *
 * The single fetcher that powers `/admin/donor/<id>`. Pulls the donor
 * record, every linked sponsorship + child, every donation, every
 * logged interaction, and any fulfillment rows matched by email.
 * Assembles them into a single reverse-chronological timeline plus
 * the structured sections the profile page renders (header, stats,
 * sponsoring cards, drip status, notes).
 *
 * Designed to run server-side from the page render. No caching —
 * Kevin will reload the page after taking actions and expects fresh
 * data.
 */

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY =
  process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';

const DONORS_TABLE = process.env.AIRTABLE_DONORS_TABLE || 'Donors';
const DONATIONS_TABLE = process.env.AIRTABLE_DONATIONS_TABLE || 'Donations';
const SPONSORSHIPS_TABLE =
  process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships';
const CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';
const FULFILLMENT_TABLE = process.env.AIRTABLE_FULFILLMENT_TABLE || 'Fulfillment';
const INTERACTIONS_TABLE =
  process.env.AIRTABLE_INTERACTIONS_TABLE || 'Interactions';

function atHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

interface AirtableRecord<F = Record<string, unknown>> {
  id: string;
  createdTime: string;
  fields: F;
}

interface AirtableList<F = Record<string, unknown>> {
  records: AirtableRecord<F>[];
  offset?: string;
}

async function atGet<F = Record<string, unknown>>(
  table: string,
  query = ''
): Promise<AirtableList<F>> {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    table
  )}${query ? `?${query}` : ''}`;
  const res = await fetch(url, { headers: atHeaders(), cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Airtable ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<AirtableList<F>>;
}

async function atGetById<F = Record<string, unknown>>(
  table: string,
  id: string
): Promise<AirtableRecord<F> | null> {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    table
  )}/${id}`;
  const res = await fetch(url, { headers: atHeaders(), cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Airtable ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<AirtableRecord<F>>;
}

// ─── Public types ───────────────────────────────────────────────

export interface DonorSponsorship {
  recordId: string;
  status: string | null;
  startDate: string | null;
  monthlyAmount: number; // dollars (Airtable currency)
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
  monthlySponsorshipTotal: number; // dollars

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

function pickStr(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t || null;
}

// ─── Main fetch ──────────────────────────────────────────────────

interface DonorFields {
  'Donor Name'?: string;
  'Organization Name'?: string;
  'Email Address'?: string;
  'Phone Number'?: string;
  'Mailing Address'?: string;
  'Total Lifetime Giving'?: number;
  'First Donation Date'?: string;
  'Most Recent Donation'?: string;
  'Donor Status'?: { name?: string } | string;
  'Recurring Supporter'?: boolean;
  Notes?: string;
  DripPipeline?: { name?: string } | string;
  DripStage?: number;
  DripNextSend?: string;
  DripChildName?: string;
  DripShirtNumber?: string;
  Donations?: string[];
  Sponsorships?: string[];
}

interface DonationFields {
  'Donation Date'?: string;
  'Donation Amount'?: number;
  'Payment Status'?: { name?: string } | string;
  'Donation Source'?: { name?: string } | string;
  'Recurring Donation'?: boolean;
  'Donation Note'?: string;
}

interface SponsorshipFields {
  Status?: { name?: string } | string;
  SponsorshipStartDate?: string;
  MonthlyAmount?: number;
  Children?: string[]; // record IDs
  ChildDisplayName?: string;
  ChildPhoto?: Array<{ url: string; thumbnails?: { large?: { url: string } } }>;
}

interface ChildFields {
  ShirtNumber?: number;
  DisplayName?: string;
  FirstName?: string;
  ProfilePhoto?: Array<{ url: string; thumbnails?: { large?: { url: string } } }>;
}

interface FulfillmentFields {
  'Order #'?: number;
  'Order Date'?: string;
  Shipping?: { name?: string } | string;
  Production?: { name?: string } | string;
  Tracking?: string;
  Email?: string;
  Buyer?: string;
  Size?: { name?: string } | string;
  'Shirt Color'?: { name?: string } | string;
}

interface InteractionFields {
  Subject?: string;
  Direction?: { name?: string } | string;
  Channel?: { name?: string } | string;
  Notes?: string;
  At?: string;
  LoggedBy?: string;
}

function asName(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && 'name' in v) {
    return (v as { name?: string }).name || null;
  }
  return null;
}

export async function getDonorById(donorRecordId: string): Promise<DonorProfile | null> {
  const donor = await atGetById<DonorFields>(DONORS_TABLE, donorRecordId);
  if (!donor) return null;
  const f = donor.fields;

  const email = pickStr(f['Email Address']);

  // Parallel fetches for everything linked or matching this donor.
  const [donations, sponsorships, interactions, fulfillment] = await Promise.all([
    fetchDonationsForDonor(donorRecordId),
    fetchSponsorshipsForDonor(donorRecordId),
    fetchInteractionsForDonor(donorRecordId),
    email ? fetchFulfillmentForEmail(email) : Promise.resolve([]),
  ]);

  // Resolve child records for each sponsorship.
  const childIds = new Set<string>();
  for (const s of sponsorships) {
    const linked = (s.fields.Children as string[]) || [];
    for (const id of linked) childIds.add(id);
  }
  const childMap = await fetchChildrenByIds(Array.from(childIds));

  const sponsorshipsOut: DonorSponsorship[] = sponsorships.map(s => {
    const sf = s.fields;
    const childId = (sf.Children as string[])?.[0] || null;
    const child = childId ? childMap.get(childId) : null;
    const photoFromSponsorship = sf.ChildPhoto?.[0];
    const photoFromChild = child?.fields.ProfilePhoto?.[0];
    const photoUrl =
      photoFromChild?.thumbnails?.large?.url ||
      photoFromChild?.url ||
      photoFromSponsorship?.thumbnails?.large?.url ||
      photoFromSponsorship?.url ||
      null;
    return {
      recordId: s.id,
      status: asName(sf.Status),
      startDate: pickStr(sf.SponsorshipStartDate),
      monthlyAmount: (sf.MonthlyAmount as number) || 0,
      childRecordId: childId,
      childShirtNumber: (child?.fields.ShirtNumber as number) || null,
      childName:
        child?.fields.DisplayName ||
        child?.fields.FirstName ||
        sf.ChildDisplayName ||
        null,
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
  for (const d of donations) {
    const df = d.fields;
    const at = pickStr(df['Donation Date']) || d.createdTime;
    const amount = (df['Donation Amount'] as number) || 0;
    const source = asName(df['Donation Source']);
    const recurring = !!df['Recurring Donation'];
    const note = pickStr(df['Donation Note']);
    timeline.push({
      at,
      kind: 'donation',
      summary: `${formatMoney(amount)}${recurring ? ' recurring' : ''}${
        source ? ' · ' + source : ''
      }`,
      detail: note || undefined,
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
        at: s.startDate || donor.createdTime,
        kind: 'sponsorship_ended',
        summary: `Sponsorship of ${s.childName || 'a kid'} ended`,
      });
    }
  }

  // Shirts (Fulfillment) — order placed + shipped
  for (const o of fulfillment) {
    const of = o.fields;
    const orderDate = pickStr(of['Order Date']);
    const orderNum = (of['Order #'] as number) || null;
    const color = asName(of['Shirt Color']);
    const size = asName(of['Size']);
    if (orderDate) {
      timeline.push({
        at: orderDate,
        kind: 'shirt_ordered',
        summary: `Bought shirt${orderNum ? ' #' + orderNum : ''}${
          color ? ' · ' + color : ''
        }${size ? ' ' + size : ''}`,
      });
    }
    if (asName(of.Shipping) === 'Shipped' && orderDate) {
      // We don't have a ship date field — best-effort: use order date.
      // (Once Fulfillment gets a ShippedDate field this would be exact.)
      timeline.push({
        at: orderDate,
        kind: 'shirt_shipped',
        summary: `Shirt${orderNum ? ' #' + orderNum : ''} shipped${
          of.Tracking ? ' · ' + of.Tracking : ''
        }`,
      });
    }
  }

  // Interactions
  let lastContactAt: string | null = null;
  let lastContactSummary: string | null = null;
  for (const i of interactions) {
    const ifd = i.fields;
    const at = pickStr(ifd.At) || i.createdTime;
    const direction = (asName(ifd.Direction) || 'outbound') as 'outbound' | 'inbound';
    const channel = asName(ifd.Channel) || 'email';
    const subject = pickStr(ifd.Subject) || (direction === 'outbound' ? 'Reached out' : 'Heard from them');
    timeline.push({
      at,
      kind: 'interaction',
      summary: subject,
      detail: pickStr(ifd.Notes) || undefined,
      direction,
      channel,
    });
    if (!lastContactAt || new Date(at).getTime() > new Date(lastContactAt).getTime()) {
      lastContactAt = at;
      lastContactSummary = `${direction === 'outbound' ? 'Kevin' : 'They'} · ${channel} · ${subject}`;
    }
  }

  // Sort timeline desc.
  timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return {
    recordId: donor.id,
    name: pickStr(f['Donor Name']) || 'Unknown donor',
    organization: pickStr(f['Organization Name']),
    email,
    phone: pickStr(f['Phone Number']),
    address: pickStr(f['Mailing Address']),
    status: asName(f['Donor Status']),
    recurringSupporter: !!f['Recurring Supporter'],
    donorSince: pickStr(f['First Donation Date']),
    mostRecentDonation: pickStr(f['Most Recent Donation']),
    lifetimeGiving: (f['Total Lifetime Giving'] as number) || 0,
    notes: pickStr(f.Notes) || '',

    dripPipeline: asName(f.DripPipeline),
    dripStage: (f.DripStage as number) ?? null,
    dripNextSend: pickStr(f.DripNextSend),
    dripChildName: pickStr(f.DripChildName),
    dripShirtNumber: pickStr(f.DripShirtNumber),

    sponsorships: sponsorshipsOut,
    totalSponsorships: sponsorshipsOut.length,
    activeSponsorshipCount: activeSponsorships.length,
    monthlySponsorshipTotal: monthlyTotal,

    lastContactAt,
    lastContactSummary,

    timeline,
  };
}

// ─── Linked-fetch helpers ───────────────────────────────────────

async function fetchDonationsForDonor(
  donorRecordId: string
): Promise<AirtableRecord<DonationFields>[]> {
  // FIND on the linked-record field's record-ID rendering.
  const formula = `FIND("${donorRecordId}", ARRAYJOIN({Donor})) > 0`;
  const params = new URLSearchParams();
  params.set('filterByFormula', formula);
  params.set('pageSize', '100');
  const out: AirtableRecord<DonationFields>[] = [];
  let offset: string | undefined;
  do {
    if (offset) params.set('offset', offset);
    else params.delete('offset');
    const page = await atGet<DonationFields>(DONATIONS_TABLE, params.toString());
    out.push(...page.records);
    offset = page.offset;
  } while (offset);
  return out;
}

async function fetchSponsorshipsForDonor(
  donorRecordId: string
): Promise<AirtableRecord<SponsorshipFields>[]> {
  const formula = `FIND("${donorRecordId}", ARRAYJOIN({Donor})) > 0`;
  const params = new URLSearchParams();
  params.set('filterByFormula', formula);
  params.set('pageSize', '100');
  const page = await atGet<SponsorshipFields>(SPONSORSHIPS_TABLE, params.toString());
  return page.records;
}

async function fetchInteractionsForDonor(
  donorRecordId: string
): Promise<AirtableRecord<InteractionFields>[]> {
  const formula = `FIND("${donorRecordId}", ARRAYJOIN({Donor})) > 0`;
  const params = new URLSearchParams();
  params.set('filterByFormula', formula);
  params.set('pageSize', '100');
  try {
    const page = await atGet<InteractionFields>(INTERACTIONS_TABLE, params.toString());
    return page.records;
  } catch {
    // Table may not exist yet on first deploy.
    return [];
  }
}

async function fetchFulfillmentForEmail(
  email: string
): Promise<AirtableRecord<FulfillmentFields>[]> {
  const safe = email.replace(/"/g, '\\"');
  const formula = `LOWER({Email})="${safe.toLowerCase()}"`;
  const params = new URLSearchParams();
  params.set('filterByFormula', formula);
  params.set('pageSize', '100');
  try {
    const page = await atGet<FulfillmentFields>(FULFILLMENT_TABLE, params.toString());
    return page.records;
  } catch {
    return [];
  }
}

async function fetchChildrenByIds(
  ids: string[]
): Promise<Map<string, AirtableRecord<ChildFields>>> {
  const map = new Map<string, AirtableRecord<ChildFields>>();
  if (ids.length === 0) return map;
  // Airtable doesn't have an "IN" operator that works cleanly with
  // record IDs, but each record can be GET-ed cheaply.
  await Promise.all(
    ids.map(async id => {
      const rec = await atGetById<ChildFields>(CHILDREN_TABLE, id);
      if (rec) map.set(id, rec);
    })
  );
  return map;
}

// ─── Donor list (for the temporary directory page) ──────────────

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
  const params = new URLSearchParams();
  params.set('pageSize', '100');
  const out: DonorListEntry[] = [];
  let offset: string | undefined;
  do {
    if (offset) params.set('offset', offset);
    else params.delete('offset');
    const page = await atGet<DonorFields>(DONORS_TABLE, params.toString());
    for (const rec of page.records) {
      const f = rec.fields;
      out.push({
        recordId: rec.id,
        name: pickStr(f['Donor Name']) || 'Unknown',
        email: pickStr(f['Email Address']),
        lifetimeGiving: (f['Total Lifetime Giving'] as number) || 0,
        recurringSupporter: !!f['Recurring Supporter'],
        status: asName(f['Donor Status']),
        sponsorshipCount: (f.Sponsorships as string[])?.length || 0,
        donorSince: pickStr(f['First Donation Date']),
        mostRecentDonation: pickStr(f['Most Recent Donation']),
      });
    }
    offset = page.offset;
  } while (offset);
  // Most recent activity first.
  out.sort((a, b) => {
    const ad = a.mostRecentDonation || a.donorSince || '';
    const bd = b.mostRecentDonation || b.donorSince || '';
    return bd.localeCompare(ad);
  });
  return out;
}
