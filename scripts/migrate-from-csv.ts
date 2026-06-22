/**
 * One-time migration from Airtable CSV exports into Postgres.
 *
 * Usage:
 *   1. Kevin exports CSVs from Airtable web UI for each table,
 *      drops them in airtable-export/ at the repo root.
 *   2. From the repo root, run:
 *        npm run migrate-csv
 *      (or directly: tsx scripts/migrate-from-csv.ts)
 *
 * The script is idempotent — re-runnable. It uses the id_mapping
 * table to track which Airtable rows have already been migrated;
 * re-runs skip rows that exist. Safe to run multiple times.
 *
 * What it does, per table:
 *   1. Parse the CSV (csv-parse, handles quoting and embedded
 *      newlines correctly).
 *   2. For each row:
 *        a. Check id_mapping — skip if already migrated.
 *        b. Generate a UUID for the new Postgres row.
 *        c. Map Airtable column names → Postgres column names.
 *        d. Coerce types (dates, booleans, numbers, JSON).
 *        e. Resolve foreign keys via id_mapping (e.g., the
 *           Sponsorships CSV cell &ldquo;HSP/BAN-005&rdquo; → look up
 *           children.child_id, get the Postgres UUID).
 *        f. Download attachment URLs (which expire in a few hours),
 *           upload to the appropriate Supabase Storage bucket,
 *           replace the URL with the permanent Supabase Storage
 *           public URL.
 *        g. Insert into the Postgres table.
 *        h. Insert into id_mapping.
 *   3. Print progress + summary stats.
 *
 * Dependency order matters — tables with foreign keys to other
 * tables are migrated AFTER the tables they reference. See the
 * MIGRATION_ORDER constant.
 *
 * Photo migration window: Airtable signed URLs expire after a few
 * hours. The CSV cell preserves the URL at export time. Run this
 * script promptly after the CSV export — ideally within the hour.
 */

import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';
import { eq, sql } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { db } from '../src/lib/db/client';
import * as schema from '../src/lib/db/schema';

// ─── Config ──────────────────────────────────────────────────────

const EXPORT_DIR = path.resolve(process.cwd(), 'airtable-export');
const DRY_RUN = process.argv.includes('--dry-run');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add to .env.local or export inline.'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Stripe client is optional — only needed by migrateSubscriptions to
// resolve donor FKs accurately via stripe_customer_id. If missing the
// subscriptions migration falls back to name-matching and logs a
// warning for any ambiguous matches.
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2025-12-15.clover' })
  : null;

// ─── Helpers ─────────────────────────────────────────────────────

function readCsv(filename: string): Record<string, string>[] {
  const filepath = path.join(EXPORT_DIR, filename);
  if (!fs.existsSync(filepath)) {
    console.warn(`  ⚠  Missing CSV: ${filename} — skipping table.`);
    return [];
  }
  const raw = fs.readFileSync(filepath, 'utf-8');
  return parseCsv(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];
}

function parseBool(v: string | undefined): boolean | undefined {
  if (v === undefined || v === '') return undefined;
  if (v === 'checked' || v === 'true' || v === '1') return true;
  return false;
}

function parseDate(v: string | undefined): string | undefined {
  if (!v) return undefined;
  // Airtable date format YYYY-MM-DD; keep as-is for Postgres date type.
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  // For datetime values (ISO 8601), Postgres accepts directly.
  return v;
}

function parseDateTime(v: string | undefined): string | undefined {
  if (!v) return undefined;
  return v; // ISO 8601 string, Postgres will coerce
}

function parseNumeric(v: string | undefined): string | undefined {
  if (v === undefined || v === '') return undefined;
  // Airtable currency exports as &ldquo;$25.00&rdquo; — strip currency symbols.
  const cleaned = v.replace(/[^\d.-]/g, '');
  if (!cleaned) return undefined;
  return cleaned;
}

function parseInt32(v: string | undefined): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = parseInt(v, 10);
  return isNaN(n) ? undefined : n;
}

/**
 * Airtable attachment field exports as a JSON string in the cell.
 * Returns the parsed array of {url, filename, id} or empty if not
 * present.
 */
interface AirtableAttachment {
  id: string;
  url: string;
  filename: string;
}
function parseAttachments(v: string | undefined): AirtableAttachment[] {
  if (!v || v.trim() === '') return [];
  try {
    const parsed = JSON.parse(v);
    if (Array.isArray(parsed)) return parsed as AirtableAttachment[];
    return [];
  } catch {
    return [];
  }
}

/**
 * Map an HTTP content-type to a sensible file extension. Falls back
 * to .bin so we never lose the file.
 */
function extensionForContentType(contentType: string | null): string {
  if (!contentType) return '.jpg';
  const ct = contentType.toLowerCase().split(';')[0].trim();
  if (ct === 'image/jpeg' || ct === 'image/jpg') return '.jpg';
  if (ct === 'image/png') return '.png';
  if (ct === 'image/webp') return '.webp';
  if (ct === 'image/gif') return '.gif';
  if (ct === 'image/heic') return '.heic';
  if (ct === 'image/heif') return '.heif';
  if (ct === 'image/svg+xml') return '.svg';
  if (ct === 'application/pdf') return '.pdf';
  return '.bin';
}

/**
 * Pull the extension off a filename, lowercased. Returns empty string
 * if there isn&rsquo;t one.
 */
function extensionFromFilename(filename: string | undefined): string {
  if (!filename) return '';
  const i = filename.lastIndexOf('.');
  if (i < 0 || i === filename.length - 1) return '';
  return filename.slice(i).toLowerCase();
}

/**
 * Download a file from a (probably-signed) URL and upload to
 * Supabase Storage. The caller passes `destPathBase` WITHOUT an
 * extension; the real extension is derived from the source filename
 * or the response&rsquo;s content-type so .png/.webp/.gif source files
 * stay correctly-typed in storage.
 *
 * Returns the public URL of the uploaded file, or undefined if any
 * step fails.
 */
async function migrateAttachment(
  bucket: 'children-photos' | 'update-photos' | 'newsletter-photos',
  destPathBase: string,
  signedUrl: string,
  sourceFilename?: string
): Promise<string | undefined> {
  try {
    const res = await fetch(signedUrl);
    if (!res.ok) {
      console.warn(
        `    ⚠  Could not download ${signedUrl.slice(0, 80)}... (HTTP ${res.status})`
      );
      return undefined;
    }
    const blob = await res.blob();
    const buffer = Buffer.from(await blob.arrayBuffer());
    const contentType = res.headers.get('content-type') || 'image/jpeg';

    // Prefer the source filename&rsquo;s extension (Airtable preserves the
    // user&rsquo;s upload); fall back to sniffing the content-type.
    const ext =
      extensionFromFilename(sourceFilename) ||
      extensionForContentType(contentType);
    const destPath = `${destPathBase}${ext}`;

    const { error } = await supabase.storage
      .from(bucket)
      .upload(destPath, buffer, {
        contentType,
        upsert: true,
      });
    if (error) {
      console.warn(`    ⚠  Upload failed for ${destPath}: ${error.message}`);
      return undefined;
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(destPath);
    return data.publicUrl;
  } catch (err) {
    console.warn(`    ⚠  Attachment migration error: ${err}`);
    return undefined;
  }
}

/**
 * Resolve an Airtable linked-record CSV value to a Postgres UUID by
 * looking up the corresponding row in the target table via a known
 * lookup column. Returns the UUID or undefined if not found.
 */
async function resolveLinkedRecord(
  airtablePrimaryFieldValue: string,
  tableName: string,
  postgresLookupColumn: string
): Promise<string | undefined> {
  if (!airtablePrimaryFieldValue) return undefined;
  // Airtable exports linked records as comma-separated primary
  // field values — &ldquo;HSP/BAN-005&rdquo; or
  // &ldquo;HSP/BAN-005, HSP/BAN-006&rdquo;. Take the first one for
  // single-link FK resolution.
  const firstValue = airtablePrimaryFieldValue.split(',')[0]?.trim();
  if (!firstValue) return undefined;

  // Identifiers come from internal MIGRATION_ORDER definitions, not
  // CSV data — safe to inline via sql.identifier. The value is bound
  // as a parameter, so quoting is handled by the driver.
  const result = await db.execute(
    sql`select id from ${sql.identifier(tableName)} where ${sql.identifier(postgresLookupColumn)} = ${firstValue} limit 1`
  );
  // postgres-js returns rows iterable on `.rows` for drizzle execute().
  const rows = (result as unknown as { rows?: Array<{ id: string }> }).rows
    ?? (result as unknown as Array<{ id: string }>);
  return rows?.[0]?.id;
}

/**
 * Record the airtable→postgres mapping so we can resolve linked
 * records later and avoid re-importing on re-runs.
 */
async function recordMapping(
  tableName: string,
  airtableId: string,
  postgresId: string
): Promise<void> {
  if (DRY_RUN || !airtableId) return;
  await db
    .insert(schema.idMapping)
    .values({
      tableName,
      airtableId,
      postgresId,
    })
    .onConflictDoNothing();
}

/**
 * Look up whether an Airtable ID has already been migrated.
 */
async function alreadyMigrated(
  tableName: string,
  airtableId: string
): Promise<boolean> {
  if (!airtableId) return false;
  const existing = await db
    .select({ id: schema.idMapping.postgresId })
    .from(schema.idMapping)
    .where(eq(schema.idMapping.airtableId, airtableId))
    .limit(1);
  return existing.length > 0;
}

// ─── Per-table migrators ─────────────────────────────────────────

/**
 * Each migrator returns the count of rows inserted.
 *
 * Order of migrators matters. Tables with foreign keys to other
 * tables must run AFTER the tables they reference. See
 * runMigration() below for the order.
 */

async function migrateChildren(): Promise<number> {
  console.log('\n→ children');
  const rows = readCsv('children.csv');
  let inserted = 0;

  for (const row of rows) {
    const airtableId = row['Airtable Record ID'] || row['__airtable_id'] || '';
    // CSV exports don&rsquo;t always include the record ID column unless
    // you have it as a visible field in the view. Many fields use
    // ChildID as the natural key — sufficient for de-dup.
    const childId = row['ChildID'] || '';
    if (!childId) continue;

    // Idempotency: check id_mapping if we have an airtable_id; else
    // check by child_id natural key.
    if (airtableId && (await alreadyMigrated('children', airtableId))) {
      continue;
    }
    if (!airtableId) {
      const existing = await db
        .select()
        .from(schema.children)
        .where(eq(schema.children.childId, childId))
        .limit(1);
      if (existing.length > 0) continue;
    }

    // Photo migration: parse attachment JSON, download, re-upload.
    let photoUrl: string | undefined;
    const attachments = parseAttachments(row['ProfilePhoto']);
    if (attachments[0]) {
      photoUrl = DRY_RUN
        ? attachments[0].url
        : await migrateAttachment(
            'children-photos',
            childId.replace(/[^a-zA-Z0-9]/g, '_'),
            attachments[0].url,
            attachments[0].filename
          );
    }

    const insertData: schema.NewChild = {
      airtableId: airtableId || null,
      childId,
      shirtNumber: parseInt32(row['ShirtNumber']),
      archivedShirtNumber: parseInt32(row['ArchivedShirtNumber']),
      firstName: row['FirstName'] || null,
      lastInitial: row['LastInitial'] || null,
      displayName: row['DisplayName'] || null,
      dateOfBirth: parseDate(row['DateOfBirth']) || null,
      gender: row['Gender'] || null,
      profilePhotoUrl: photoUrl || null,
      status: row['Status'] || 'Active',
      enrollmentDate: parseDate(row['EnrollmentDate']) || null,
      gradeClass: row['GradeClass'] || null,
      schoolLocation: row['SchoolLocation'] || null,
      notes: row['Notes'] || null,
      homeVillage: row['HomeVillage'] || null,
      familyContext: row['FamilyContext'] || null,
      loves: row['Loves'] || null,
      childQuote: row['ChildQuote'] || null,
      teacherName: row['TeacherName'] || null,
      teacherQuote: row['TeacherQuote'] || null,
      nameMeaning: row['NameMeaning'] || null,
      shirtAssignedAt: parseDateTime(row['ShirtAssignedAt']) as
        | Date
        | undefined as Date | null,
      shirtBuyerEmail: row['ShirtBuyerEmail'] || null,
      shirtBuyerName: row['ShirtBuyerName'] || null,
      reservedForAuction: parseBool(row['ReservedForAuction']) ?? false,
      departureRequestedAt: parseDateTime(row['DepartureRequestedAt']) as
        | Date
        | null,
      departureRequestedNote: row['DepartureRequestedNote'] || null,
      departedAt: parseDateTime(row['DepartedAt']) as Date | null,
      departureNote: row['DepartureNote'] || null,
      studentOfMonth: parseBool(row['StudentOfMonth']) ?? false,
      studentOfMonthReason: row['StudentOfMonthReason'] || null,
    };

    if (DRY_RUN) {
      console.log(`  + ${childId} (${row['FirstName']})`);
    } else {
      const [out] = await db
        .insert(schema.children)
        .values(insertData)
        .returning({ id: schema.children.id });
      if (airtableId && out) await recordMapping('children', airtableId, out.id);
    }
    inserted++;
  }
  console.log(`  ${inserted} inserted`);
  return inserted;
}

async function migrateDonors(): Promise<number> {
  console.log('\n→ donors');
  const rows = readCsv('donors.csv');
  let inserted = 0;

  for (const row of rows) {
    const airtableId = row['Airtable Record ID'] || '';
    const email = row['Email Address'] || row['Email'] || '';
    if (!email) continue;

    if (airtableId && (await alreadyMigrated('donors', airtableId))) continue;
    if (!airtableId) {
      // Lowered comparison — matches the donors_email_lower_idx unique
      // index, so we find rows written by the webhook with mixed-case
      // email.
      const existing = await db
        .select({ id: schema.donors.id })
        .from(schema.donors)
        .where(sql`lower(${schema.donors.email}) = ${email.toLowerCase()}`)
        .limit(1);
      if (existing.length > 0) continue;
    }

    const insertData: schema.NewDonor = {
      airtableId: airtableId || null,
      name: row['Donor Name'] || null,
      organizationName: row['Organization Name'] || null,
      email: email.toLowerCase(),
      phoneNumber: row['Phone Number'] || null,
      mailingAddress: row['Mailing Address'] || null,
      stripeCustomerId: row['Stripe Customer ID'] || null,
      totalLifetimeGiving: parseNumeric(row['Total Lifetime Giving']) ?? '0',
      firstDonationDate: parseDate(row['First Donation Date']) || null,
      mostRecentDonation: parseDate(row['Most Recent Donation']) || null,
      donorStatus: row['Donor Status'] || 'New',
      recurringSupporter: parseBool(row['Recurring Supporter']) ?? false,
      communicationOptIn: parseBool(row['Communication Opt-In']) ?? false,
      howTheyHeard: row['How They Heard'] || null,
      notes: row['Notes'] || null,
      dripPipeline: row['DripPipeline'] || null,
      dripStage: parseInt32(row['DripStage']),
      dripNextSend: parseDate(row['DripNextSend']) || null,
      dripChildName: row['DripChildName'] || null,
      dripShirtNumber: row['DripShirtNumber'] || null,
    };

    if (DRY_RUN) {
      console.log(`  + ${email}`);
    } else {
      const [out] = await db
        .insert(schema.donors)
        .values(insertData)
        .returning({ id: schema.donors.id });
      if (airtableId && out) await recordMapping('donors', airtableId, out.id);
    }
    inserted++;
  }
  console.log(`  ${inserted} inserted`);
  return inserted;
}

async function migrateDonations(): Promise<number> {
  console.log('\n→ donations');
  const rows = readCsv('donations.csv');
  let inserted = 0;

  for (const row of rows) {
    const airtableId = row['Airtable Record ID'] || '';
    const stripePI = row['Stripe Payment Intent ID'] || '';
    if (!stripePI && !airtableId) continue;

    if (airtableId && (await alreadyMigrated('donations', airtableId))) continue;
    if (stripePI) {
      const existing = await db
        .select()
        .from(schema.donations)
        .where(eq(schema.donations.stripePaymentIntentId, stripePI))
        .limit(1);
      if (existing.length > 0) continue;
    }

    // Resolve donor FK via the Donor lookup column (Donor Name) or
    // by donor email at donation time.
    let donorId: string | undefined;
    const donorEmailAtDonation =
      row['Donor Email at Donation'] || row['Donor Email'] || '';
    if (donorEmailAtDonation) {
      const found = await db
        .select({ id: schema.donors.id })
        .from(schema.donors)
        .where(
          sql`lower(${schema.donors.email}) = ${donorEmailAtDonation.toLowerCase()}`
        )
        .limit(1);
      donorId = found[0]?.id;
    }

    const insertData: schema.NewDonation = {
      airtableId: airtableId || null,
      stripePaymentIntentId: stripePI || null,
      stripeCheckoutSessionId: row['Stripe Checkout Session ID'] || null,
      donationDate: parseDate(row['Donation Date']) || null,
      paymentStatus: row['Payment Status'] || null,
      donationAmount: parseNumeric(row['Donation Amount']) ?? '0',
      currency: row['Currency'] || 'usd',
      recurringDonation: parseBool(row['Recurring Donation']) ?? false,
      donorId: donorId || null,
      donorEmailAtDonation: donorEmailAtDonation || null,
      stripeCustomerId: row['Stripe Customer ID'] || null,
      donationNote: row['Donation Note'] || null,
      donationSource: row['Donation Source'] || 'Website',
    };

    if (DRY_RUN) {
      console.log(`  + ${stripePI || airtableId}`);
    } else {
      const [out] = await db
        .insert(schema.donations)
        .values(insertData)
        .returning({ id: schema.donations.id });
      if (airtableId && out)
        await recordMapping('donations', airtableId, out.id);
    }
    inserted++;
  }
  console.log(`  ${inserted} inserted`);
  return inserted;
}

async function migrateSponsorships(): Promise<number> {
  console.log('\n→ sponsorships');
  const rows = readCsv('sponsorships.csv');
  let inserted = 0;

  for (const row of rows) {
    const airtableId = row['Airtable Record ID'] || '';
    const sponsorCode = row['SponsorCode'] || '';
    if (!sponsorCode) continue;

    if (airtableId && (await alreadyMigrated('sponsorships', airtableId)))
      continue;
    // Re-run safety: if the airtable_id column wasn't exported, fall
    // back to the natural key (sponsor_code, which is uniquely
    // indexed) so a second run doesn't duplicate.
    if (!airtableId) {
      const existing = await db
        .select({ id: schema.sponsorships.id })
        .from(schema.sponsorships)
        .where(eq(schema.sponsorships.sponsorCode, sponsorCode))
        .limit(1);
      if (existing.length > 0) continue;
    }

    // Resolve child via the Children linked field — CSV value is the
    // primary field of Children which is ChildID.
    const childIdValue = row['Children'] || row['ChildID'] || '';
    const childPostgresId = await resolveLinkedRecord(
      childIdValue,
      'children',
      'child_id'
    );

    const insertData: schema.NewSponsorship = {
      airtableId: airtableId || null,
      sponsorCode,
      sponsorEmail: row['SponsorEmail'] || '',
      sponsorName: row['SponsorName'] || null,
      childIdLegacy: row['ChildID'] || null,
      childId: childPostgresId || null,
      childDisplayName: row['ChildDisplayName'] || null,
      childAge: row['ChildAge'] || null,
      childLocation: row['ChildLocation'] || null,
      status: row['Status'] || 'New',
      authStatus: row['AuthStatus'] || null,
      visibleToSponsor: parseBool(row['VisibleToSponsor']) ?? true,
      sponsorshipStartDate: parseDate(row['SponsorshipStartDate']) || null,
      monthlyAmount: parseNumeric(row['MonthlyAmount']) ?? '25.00',
      stripeSubscriptionId: row['StripeSubscriptionID'] || null,
      childRevealedAt: parseDateTime(row['ChildRevealedAt']) as Date | null,
      requestedBySponsor: parseBool(row['RequestedBySponsor']) ?? false,
      requestedAt: parseDateTime(row['RequestedAt']) as Date | null,
      lastRequestAt: parseDateTime(row['LastRequestAt']) as Date | null,
      nextRequestEligibleAt: parseDateTime(
        row['NextRequestEligibleAt']
      ) as Date | null,
      publishedAt: parseDateTime(row['PublishedAt']) as Date | null,
      previousChildIds: row['PreviousChildIDs'] || null,
      lastReassignedAt: parseDateTime(row['LastReassignedAt']) as Date | null,
    };

    if (DRY_RUN) {
      console.log(`  + ${sponsorCode}`);
    } else {
      const [out] = await db
        .insert(schema.sponsorships)
        .values(insertData)
        .returning({ id: schema.sponsorships.id });
      if (airtableId && out)
        await recordMapping('sponsorships', airtableId, out.id);
    }
    inserted++;
  }
  console.log(`  ${inserted} inserted`);
  return inserted;
}

async function migrateChildUpdates(): Promise<number> {
  console.log('\n→ child_updates');
  const rows = readCsv('child_updates.csv');
  let inserted = 0;

  for (const row of rows) {
    const airtableId = row['Airtable Record ID'] || '';
    const updateId = row['UpdateID'] || '';
    if (airtableId && (await alreadyMigrated('child_updates', airtableId)))
      continue;

    const childIdValue = row['Child'] || row['ChildID'] || '';
    const childPostgresId = await resolveLinkedRecord(
      childIdValue,
      'children',
      'child_id'
    );

    // Photos array.
    const photoUrls: string[] = [];
    const photoAtt = parseAttachments(row['Photos']);
    for (let i = 0; i < photoAtt.length; i++) {
      const p = photoAtt[i];
      const dest = `${updateId || airtableId || 'unknown'}_${i}`;
      const url = DRY_RUN
        ? p.url
        : await migrateAttachment('update-photos', dest, p.url, p.filename);
      if (url) photoUrls.push(url);
    }

    const insertData: schema.NewChildUpdate = {
      airtableId: airtableId || null,
      updateId: updateId || null,
      sponsorCode: row['SponsorCode'] || null,
      childId: childPostgresId || null,
      childIdLegacy: row['ChildID'] || null,
      updateType: row['UpdateType'] || null,
      type: row['Type'] || null,
      title: row['Title'] || null,
      content: row['Content'] || null,
      summary: row['Summary'] || null,
      updateDetails: row['UpdateDetails'] || null,
      sponsorNarrative: row['SponsorNarrative'] || null,
      updateDate: parseDate(row['UpdateDate']) || null,
      status: row['Status'] || null,
      visibleToSponsor: parseBool(row['VisibleToSponsor']) ?? true,
      photoUrls,
      physicalWellbeing: row['PhysicalWellbeing'] || null,
      emotionalWellbeing: row['EmotionalWellbeing'] || null,
      schoolEngagement: row['SchoolEngagement'] || null,
      physicalNotes: row['PhysicalNotes'] || null,
      emotionalNotes: row['EmotionalNotes'] || null,
      engagementNotes: row['EngagementNotes'] || null,
      positiveHighlight: row['PositiveHighlight'] || null,
      challenge: row['Challenge'] || null,
      attendancePercent: parseNumeric(row['AttendancePercent']),
      englishGrade: parseNumeric(row['EnglishGrade']),
      mathGrade: parseNumeric(row['MathGrade']),
      scienceGrade: parseNumeric(row['ScienceGrade']),
      socialStudiesGrade: parseNumeric(row['SocialStudiesGrade']),
      teacherComment: row['TeacherComment'] || null,
      driveFolderId: row['DriveFolderID'] || null,
      photo1FileId: row['Photo1FileID'] || null,
      photo2FileId: row['Photo2FileID'] || null,
      photo3FileId: row['Photo3FileID'] || null,
      handwrittenNoteFileId: row['HandwrittenNoteFileID'] || null,
      reportCardFileId: row['ReportCardFileID'] || null,
      submittedAt: parseDateTime(row['SubmittedAt']) as Date | null,
      submittedBy: row['SubmittedBy'] || null,
      reviewedBy: row['ReviewedBy'] || null,
      reviewedAt: parseDateTime(row['ReviewedAt']) as Date | null,
      rejectionReason: row['RejectionReason'] || null,
      correctionNotes: row['CorrectionNotes'] || null,
      sourceType: row['SourceType'] || null,
      period: row['Period'] || null,
      academicTerm: row['AcademicTerm'] || null,
      requestedBySponsor: parseBool(row['RequestedBySponsor']) ?? false,
      requestedAt: parseDateTime(row['RequestedAt']) as Date | null,
      publishedAt: parseDateTime(row['PublishedAt']) as Date | null,
      author: row['Author'] || null,
      lastModified: parseDate(row['LastModified']) || null,
    };

    if (DRY_RUN) {
      console.log(`  + ${updateId || airtableId}`);
    } else {
      const [out] = await db
        .insert(schema.childUpdates)
        .values(insertData)
        .returning({ id: schema.childUpdates.id });
      if (airtableId && out)
        await recordMapping('child_updates', airtableId, out.id);
    }
    inserted++;
  }
  console.log(`  ${inserted} inserted`);
  return inserted;
}

async function migrateNewsletters(): Promise<number> {
  console.log('\n→ newsletters');
  const rows = readCsv('newsletters.csv');
  let inserted = 0;

  for (const row of rows) {
    const airtableId = row['Airtable Record ID'] || '';
    if (airtableId && (await alreadyMigrated('newsletters', airtableId)))
      continue;

    let heroUrl: string | undefined;
    const heroAtt = parseAttachments(row['HeroPhoto']);
    if (heroAtt[0]) {
      const dest = (row['Title'] || airtableId).replace(/[^a-zA-Z0-9]/g, '_');
      heroUrl = DRY_RUN
        ? heroAtt[0].url
        : await migrateAttachment(
            'newsletter-photos',
            dest,
            heroAtt[0].url,
            heroAtt[0].filename
          );
    }

    const insertData: schema.NewNewsletter = {
      airtableId: airtableId || null,
      title: row['Title'] || 'Untitled',
      subject: row['Subject'] || null,
      bodyHtml: row['BodyHTML'] || null,
      heroPhotoUrl: heroUrl || null,
      status: row['Status'] || 'Draft',
      sendDate: parseDateTime(row['SendDate']) as Date | null,
      publishedAt: parseDateTime(row['PublishedAt']) as Date | null,
      recipientCount: parseInt32(row['RecipientCount']),
      sentCount: parseInt32(row['SentCount']),
      failedCount: parseInt32(row['FailedCount']),
      sendNotes: row['SendNotes'] || null,
      author: row['Author'] || null,
    };

    if (DRY_RUN) {
      console.log(`  + ${row['Title']}`);
    } else {
      const [out] = await db
        .insert(schema.newsletters)
        .values(insertData)
        .returning({ id: schema.newsletters.id });
      if (airtableId && out)
        await recordMapping('newsletters', airtableId, out.id);
    }
    inserted++;
  }
  console.log(`  ${inserted} inserted`);
  return inserted;
}

async function migrateSubscriptions(): Promise<number> {
  console.log('\n→ subscriptions');
  if (!stripe) {
    console.log(
      '  ℹ  STRIPE_SECRET_KEY missing — donor FK lookup will fall back to name matching.'
    );
  }
  const rows = readCsv('subscriptions.csv');
  let inserted = 0;
  let resolvedByStripe = 0;
  let resolvedByName = 0;
  let unresolved = 0;

  for (const row of rows) {
    const airtableId = row['Airtable Record ID'] || '';
    const stripeSubId = row['Subscription ID'] || '';
    if (!stripeSubId) continue;
    if (airtableId && (await alreadyMigrated('subscriptions', airtableId)))
      continue;
    if (!airtableId) {
      const existing = await db
        .select({ id: schema.subscriptions.id })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.stripeSubscriptionId, stripeSubId))
        .limit(1);
      if (existing.length > 0) continue;
    }

    // Donor resolution — prefer the authoritative Stripe → customer
    // → donor.stripe_customer_id chain, then fall back to a strict
    // (must-be-unique) name match, then give up and log.
    const donorPrimaryFieldValue = row['Donor'] || '';
    let donorId: string | undefined;

    if (stripe && stripeSubId.startsWith('sub_')) {
      try {
        const sub = await stripe.subscriptions.retrieve(stripeSubId);
        const customerId =
          typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        if (customerId) {
          const found = await db
            .select({ id: schema.donors.id })
            .from(schema.donors)
            .where(eq(schema.donors.stripeCustomerId, customerId))
            .limit(1);
          if (found[0]) {
            donorId = found[0].id;
            resolvedByStripe++;
          }
        }
      } catch (err) {
        // Stripe subscription may be deleted / archived — fall through
        // to name matching.
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`    ⚠  ${stripeSubId}: Stripe lookup failed: ${msg}`);
      }
    }

    if (!donorId && donorPrimaryFieldValue) {
      // Strict name match — only set the FK when there&rsquo;s exactly one
      // donor with that name. A shared name is worse than NULL.
      const firstName = donorPrimaryFieldValue.split(',')[0]?.trim();
      if (firstName) {
        const matches = await db
          .select({ id: schema.donors.id })
          .from(schema.donors)
          .where(eq(schema.donors.name, firstName))
          .limit(2);
        if (matches.length === 1) {
          donorId = matches[0].id;
          resolvedByName++;
        } else if (matches.length > 1) {
          console.warn(
            `    ⚠  ${stripeSubId}: ambiguous donor name &ldquo;${firstName}&rdquo; — leaving donor_id NULL`
          );
          unresolved++;
        } else {
          unresolved++;
        }
      } else {
        unresolved++;
      }
    } else if (!donorId) {
      unresolved++;
    }

    const insertData: schema.NewSubscription = {
      airtableId: airtableId || null,
      stripeSubscriptionId: stripeSubId,
      donorId: donorId || null,
      status: row['Status'] || null,
      startDate: parseDate(row['Start Date']) || null,
      currentPeriodEnd: parseDate(row['Current Period End']) || null,
      amount: parseNumeric(row['Amount']),
      frequency: row['Frequency'] || 'monthly',
    };

    if (DRY_RUN) {
      console.log(`  + ${stripeSubId}`);
    } else {
      const [out] = await db
        .insert(schema.subscriptions)
        .values(insertData)
        .returning({ id: schema.subscriptions.id });
      if (airtableId && out)
        await recordMapping('subscriptions', airtableId, out.id);
    }
    inserted++;
  }
  console.log(
    `  ${inserted} inserted — donor FK: ${resolvedByStripe} via Stripe, ${resolvedByName} via name, ${unresolved} unresolved`
  );
  return inserted;
}

async function migrateCommunications(): Promise<number> {
  console.log('\n→ communications');
  const rows = readCsv('communications.csv');
  let inserted = 0;

  for (const row of rows) {
    const airtableId = row['Airtable Record ID'] || '';
    if (airtableId && (await alreadyMigrated('communications', airtableId)))
      continue;

    const insertData: schema.NewCommunication = {
      airtableId: airtableId || null,
      subject: row['Subject'] || null,
      sendDate: parseDate(row['Send Date']) || null,
      status: row['Status'] || null,
      recipientEmail: row['Recipient Email'] || null,
      emailType: row['Email Type'] || null,
    };

    if (DRY_RUN) {
      console.log(`  + ${row['Subject']}`);
    } else {
      const [out] = await db
        .insert(schema.communications)
        .values(insertData)
        .returning({ id: schema.communications.id });
      if (airtableId && out)
        await recordMapping('communications', airtableId, out.id);
    }
    inserted++;
  }
  console.log(`  ${inserted} inserted`);
  return inserted;
}

async function migrateScheduledPosts(): Promise<number> {
  console.log('\n→ scheduled_posts');
  const rows = readCsv('scheduled_posts.csv');
  let inserted = 0;

  for (const row of rows) {
    const airtableId = row['Airtable Record ID'] || '';
    if (airtableId && (await alreadyMigrated('scheduled_posts', airtableId)))
      continue;

    const insertData: schema.NewScheduledPost = {
      airtableId: airtableId || null,
      platform: row['Platform'] || null,
      contentType: row['ContentType'] || null,
      caption: row['Caption'] || null,
      hashtags: row['Hashtags'] || null,
      scheduledAt: parseDateTime(row['ScheduledAt']) as Date | null,
      status: row['Status'] || 'Pending',
      publishedAt: parseDateTime(row['PublishedAt']) as Date | null,
      mediaDriveId: row['MediaDriveId'] || null,
      mediaUrl: row['MediaUrl'] || null,
      instagramPostId: row['InstagramPostId'] || null,
      facebookPostId: row['FacebookPostId'] || null,
      error: row['Error'] || null,
      notes: row['Notes'] || null,
      createdBy: row['CreatedBy'] || null,
      reviewNeeded: parseBool(row['Review Needed']) ?? false,
    };

    if (DRY_RUN) {
      console.log(`  + ${row['Caption']?.slice(0, 30)}...`);
    } else {
      const [out] = await db
        .insert(schema.scheduledPosts)
        .values(insertData)
        .returning({ id: schema.scheduledPosts.id });
      if (airtableId && out)
        await recordMapping('scheduled_posts', airtableId, out.id);
    }
    inserted++;
  }
  console.log(`  ${inserted} inserted`);
  return inserted;
}

async function migrateFulfillments(): Promise<number> {
  console.log('\n→ fulfillments');
  const rows = readCsv('fulfillments.csv');
  let inserted = 0;

  for (const row of rows) {
    const airtableId = row['Airtable Record ID'] || '';
    if (airtableId && (await alreadyMigrated('fulfillments', airtableId)))
      continue;

    const insertData: schema.NewFulfillment = {
      airtableId: airtableId || null,
      orderNumber: parseInt32(row['Order #']),
      design: row['Design'] || null,
      shirtColor: row['Shirt Color'] || null,
      size: row['Size'] || null,
      vinylFront: row['Vinyl Front'] || null,
      vinylBack: row['Vinyl Back'] || null,
      buyerName: row['Buyer'] || null,
      buyerEmail: row['Email'] || null,
      shipName: row['Ship Name'] || null,
      shipStreet1: row['Ship Street1'] || null,
      shipStreet2: row['Ship Street2'] || null,
      shipCity: row['Ship City'] || null,
      shipState: row['Ship State'] || null,
      shipZip: row['Ship ZIP'] || null,
      production: row['Production'] || null,
      shipping: row['Shipping'] || null,
      tracking: row['Tracking'] || null,
      childName: row['Child Name'] || null,
      orderDate: parseDate(row['Order Date']) || null,
      notes: row['Notes'] || null,
    };

    if (DRY_RUN) {
      console.log(`  + Order #${row['Order #']}`);
    } else {
      const [out] = await db
        .insert(schema.fulfillments)
        .values(insertData)
        .returning({ id: schema.fulfillments.id });
      if (airtableId && out)
        await recordMapping('fulfillments', airtableId, out.id);
    }
    inserted++;
  }
  console.log(`  ${inserted} inserted`);
  return inserted;
}

async function migrateBatches(): Promise<number> {
  console.log('\n→ batches');
  const rows = readCsv('batches.csv');
  let inserted = 0;

  for (const row of rows) {
    const airtableId = row['Airtable Record ID'] || '';
    if (airtableId && (await alreadyMigrated('batches', airtableId))) continue;

    const insertData: schema.NewBatch = {
      airtableId: airtableId || null,
      batchName: row['BatchName'] || null,
      startShirtNumber: parseInt32(row['StartShirtNumber']) ?? 0,
      endShirtNumber: parseInt32(row['EndShirtNumber']) ?? 0,
      rosterSnapshot: row['RosterSnapshot'] || null,
      status: row['Status'] || 'Planned',
      openedAt: parseDateTime(row['OpenedAt']) as Date | null,
      closedAt: parseDateTime(row['ClosedAt']) as Date | null,
      notes: row['Notes'] || null,
    };

    if (DRY_RUN) {
      console.log(`  + ${row['BatchName']}`);
    } else {
      const [out] = await db
        .insert(schema.batches)
        .values(insertData)
        .returning({ id: schema.batches.id });
      if (airtableId && out)
        await recordMapping('batches', airtableId, out.id);
    }
    inserted++;
  }
  console.log(`  ${inserted} inserted`);
  return inserted;
}

// ─── Runner ──────────────────────────────────────────────────────

const MIGRATION_ORDER = [
  // No FKs to other tables → safe to import first.
  migrateChildren,
  migrateDonors,
  migrateNewsletters,
  migrateBatches,
  migrateFulfillments,
  // Have FKs to the above; import second.
  migrateSubscriptions, // → donors
  migrateDonations, // → donors
  migrateSponsorships, // → children
  migrateChildUpdates, // → children
  migrateCommunications, // no app-level FK constraint; safe later
  migrateScheduledPosts, // → child_updates (optional FK)
];

async function runMigration() {
  console.log(
    `Migrating from ${EXPORT_DIR}${DRY_RUN ? ' (DRY RUN — no writes)' : ''}\n`
  );

  if (!fs.existsSync(EXPORT_DIR)) {
    console.error(
      `Folder not found: ${EXPORT_DIR}\nExpected CSVs from Airtable web UI exports.`
    );
    process.exit(1);
  }

  let total = 0;
  for (const migrator of MIGRATION_ORDER) {
    try {
      const n = await migrator();
      total += n;
    } catch (err) {
      console.error(`\n  ✗ ${migrator.name} failed:`, err);
      console.error('  Continuing with remaining tables...');
    }
  }

  console.log(`\n────────────────────────────────────`);
  console.log(`Done. ${total} rows migrated.`);
  console.log(`────────────────────────────────────`);
  process.exit(0);
}

runMigration().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
