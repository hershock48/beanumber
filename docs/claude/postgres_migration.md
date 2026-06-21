# Postgres migration — owning the stack

**Status:** In progress. Site currently dark on API reads (Airtable workspace quota exhausted, Kevin not upgrading). Migration is BOTH the long-term right architecture AND the only path to bring the site back up.

**Decision date:** June 19, 2026.

---

## Why we're doing this

Three things came together to force the move:

1. **The Airtable workspace hit its monthly API quota on the Free plan.** Every public-site page that loads kid data hits Airtable. Pre-launch traffic + cron jobs + admin tools exhausted 1,000 requests in under a month. Site is currently returning 429s on every read path.

2. **Pro plan is not the answer.** Pro at $24/user/mo gives 100K requests/mo. BAN burns through that the moment marketing hits — even with aggressive caching, the underlying architecture (treating Airtable as the production read database) doesn't scale. Same trap, larger trap.

3. **Kevin wants to own the stack.** "Doing this right" means data sovereignty. Children's photos, sponsor PII, payment metadata, departure notes — handing all of that to Airtable's servers is wrong for a 501(c)(3) handling minors' information long-term. Owning a Postgres database in your own infrastructure account is the right hygiene.

Airtable is the wrong tool for BAN's storage layer. It's a fine tool for ONE job — editing — and the long-term answer is: own the storage, replace the editing UI in-app over time, eventually cancel Airtable entirely.

## What we're committing to

### Stack

- **Database:** Supabase. Postgres + Storage + Auth + Edge in one product. Single bill, single dashboard, mature platform.
- **ORM:** Drizzle. TypeScript-first, SQL-like, fast cold starts, schema-as-code with auto-generated migrations.
- **File storage:** Supabase Storage. Kid photos, update images, newsletter heroes. Permanent URLs (no Airtable signed-URL rotation breaking image caching).
- **Auth:** Existing `sponsor_session` cookie pattern stays for sponsors. Admin gets a Postgres-backed `admin_users` table with the same cookie pattern, role field (`admin` / `simon` / `viewer`).
- **Schema management:** Drizzle migrations checked into `migrations/` directory. Every schema change is reviewable code.
- **Hosting:** Vercel as-is.
- **Email:** Gmail OAuth as-is.
- **Payments:** Stripe as-is.
- **Error tracking:** Sentry (deferred — add when scale demands it).
- **Audit log:** Postgres triggers writing to `audit_log` table. Built in from day one.

### What gets migrated

Every Airtable table becomes a Postgres table:

| Airtable table | Postgres table | Notes |
|---|---|---|
| Children | `children` | Linked records → proper FKs; attachment URLs → Supabase Storage URLs |
| Sponsorships | `sponsorships` | `Children` linked field → junction table `sponsorship_children` |
| Donors | `donors` | Stripe Customer ID becomes searchable index |
| Donations | `donations` | Foreign key to `donors`, indexed by Stripe payment intent |
| Fulfillment | `fulfillments` | Stays close to current shape |
| Child Updates | `child_updates` | Foreign key to `children`, indexed by `published_at` |
| Newsletters | `newsletters` | HTML body, scheduling, send status |
| Communications | `communications` | Sponsor↔kid messages |
| Subscriptions | `subscriptions` | Mirrors Stripe subscription state |
| Scheduled Posts | `scheduled_posts` | Social media queue |
| Batches | `batches` | Shirt-number-to-roster-snapshot mapping for cycle math |
| Hangtag Orders / others | TBD | Any small tables we have, migrated one-to-one |

### What stays in Airtable (temporarily)

Nothing functional. After the migration completes, Airtable is read-only mirror for a brief verification window, then disconnected. Once cancelled, BAN owns 100% of its data.

## Migration sequence (no timelines — happens as fast as quality allows)

### Step 0: Crisis triage (today)

Site is currently dark on reads. Kevin is NOT upgrading Airtable. The path back to "site loads":

1. Create Supabase project (CLAUDE — has access via Management API).
2. Apply schema to Supabase (CLAUDE).
3. Kevin exports CSVs from Airtable web UI for every table. The CSV download in Airtable web UI does NOT count against the API quota — it's a different endpoint. Drops the CSVs in a folder I can read.
4. Migration script reads CSVs, writes to Postgres (CLAUDE).
5. Photos migrated to Supabase Storage. Attachment URLs in the CSV exports are signed and valid for a few hours — script downloads each photo and re-uploads to Supabase before URLs expire. Run the script promptly after CSV export.
6. Public site reads switch from Airtable to Postgres via the data-access abstraction (CLAUDE).
7. Site loads again. Done.

### Step 1: Stop active data loss (today, parallel)

While the workspace is rate-limited, the Stripe webhook can't write to Airtable. Any sponsor signing up or buying a shirt right now → webhook tries to write → Airtable returns 429 → write fails → data potentially lost.

Stripe retries webhook deliveries for up to 3 days. So we have a recovery window. Once Postgres is online:

1. Webhook is modified to write to Postgres (the new source of truth) instead of Airtable.
2. Stripe replays queued failed events from the last few days. They succeed against Postgres.
3. No data loss.

This is more urgent than the read-path fix. We're losing data right now and don't know it.

### Step 2: Public site reads through the abstraction (today/this week)

Build `src/lib/db/` directory with:

- `schema.ts` — Drizzle schema definitions (every table)
- `client.ts` — Drizzle + Supabase client
- `queries.ts` — every query the app makes, typed and named (e.g. `getChildByShirtNumber`, `listAllChildren`, `getSponsorshipsForEmail`, `getViewerSponsorshipForChild`)
- `mutations.ts` — every write the app makes (createDonor, createSponsorship, updateChildPhoto, etc.)

Refactor every page that currently hits Airtable directly to use this abstraction. List of paths to refactor:

- `src/app/page.tsx` (homepage carousel)
- `src/app/HomePageContent.tsx`
- `src/app/campus/page.tsx`
- `src/app/children/[number]/page.tsx`
- `src/app/meet/[childId]/page.tsx`
- `src/app/me/page.tsx`
- `src/app/news/page.tsx`
- `src/app/api/children/route.ts`
- `src/app/api/children/[number]/route.ts`
- `src/lib/sponsor-relationship.ts`
- `src/lib/newsletter-feed.ts`
- `src/lib/cycle.ts` (batches lookup)
- Any cron job at `src/app/api/cron/*` that reads kids/sponsorships
- The Stripe webhook at `src/app/api/webhooks/stripe/route.ts` (mutations)
- Every admin tool at `src/app/api/admin/*`

This is the most mechanical part of the work. Lots of files, but each refactor is "replace fetch Airtable → call new query function." Same return shapes, same downstream code.

### Step 3: Verification

Before cutting Airtable entirely:

1. Diff every table's row count: Postgres vs CSV export. Must match.
2. Spot-check 10 random Children records: every field present, photos resolve, links work.
3. Spot-check 10 Sponsorships: foreign keys to Children and Donors resolved, status correct.
4. Hit /[N] for every active shirt number — verify kid pages render.
5. Hit /me as a known sponsor — verify family of kids shows.
6. Trigger a test sponsor checkout — verify webhook writes to Postgres correctly.

### Step 4: Build in-app admin (ongoing)

Airtable stays as the editing surface for tables that don't have in-app admin yet. We rebuild admin tools one table at a time:

- `/admin/children/*` — list, edit, photo upload, departure trigger, manual reassign
- `/admin/sponsorships/*` — list, edit Status, view linked children, manual reassignment
- `/admin/donors/*` — search by email/Stripe ID, view donation history
- `/admin/newsletters/*` — draft (uses our existing HTML editor), preview, send
- `/admin/updates/*` — Simon writes, Kevin approves, publish
- `/admin/communications/*` — message threads with sponsors
- `/admin/scheduled-posts/*` — social calendar
- `/admin/batches/*` — cycle math configuration

Each in-app admin built = one fewer reason to open Airtable. When the last is built, Airtable gets canceled.

### Step 5: Cancel Airtable

After every admin tool is in-app and verified:

1. Final CSV export from Airtable (snapshot for archival).
2. Confirm Postgres is the source of truth for every read and write.
3. Cancel Airtable subscription. Data archive stays on Kevin's local drive forever.

End state: BAN owns 100% of its data. Cost of storage layer = Supabase free tier for a long time, then $25/mo when usage warrants. No per-user fees. Total control.

## Architecture details that matter

### The data-access abstraction is the keystone

Every page goes through `src/lib/db/queries.ts`. The page code never knows it's talking to Postgres specifically — it calls `getChildByShirtNumber(99)` and gets back a typed `Child` object. Whether the backing store is Postgres, Airtable (during transition), or hypothetically something else later — page code doesn't change.

This is what makes the cutover safe. We swap implementations behind one interface. If Postgres has a bug, we fall back to Airtable (during the transition window). After cutover, we delete the Airtable adapter.

### Dual-write transition

For the period after Postgres goes live but before Airtable is canceled:

- READS come from Postgres (Airtable read path deleted as soon as Postgres is populated and verified).
- WRITES from the Stripe webhook go to Postgres. Optionally also written to Airtable for the verification window so Kevin can keep using Airtable UI to verify records appear.
- Admin tools (until rebuilt in-app) edit Airtable directly. A sync job pushes those Airtable edits into Postgres so the public site sees them.

Once all admin is in-app, the Airtable→Postgres sync job stops. Airtable becomes inert. Cancel.

### Photo migration

Airtable attachment URLs rotate every few hours. Migrating photos requires:

1. CSV export contains the URL at time-of-export.
2. Script downloads the photo from the URL within the URL's validity window (run immediately after CSV export).
3. Photo uploaded to Supabase Storage at `children/{child_id}.jpg`.
4. Postgres `children.profile_photo_url` set to the permanent Supabase Storage URL.
5. `next/image` continues to optimize and edge-cache as before.

Same approach for Child Update photos and Newsletter hero photos.

### Audit log from day one

Postgres trigger on every UPDATE and DELETE writes to an `audit_log` table:

```sql
CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL,  -- 'INSERT' | 'UPDATE' | 'DELETE'
  changed_fields jsonb,
  actor_id uuid,  -- which admin user did it; NULL for system actions
  actor_type text,  -- 'admin' | 'system' | 'webhook'
  occurred_at timestamptz DEFAULT now()
);
```

Every meaningful change is recorded. Critical for nonprofit governance, debugging, and trust at scale.

### Indexes from day one

Every column we query on gets a Postgres index:

- `children.shirt_number` — primary lookup path for /[N]
- `children.child_id` — used in sponsorship FK matching
- `sponsorships.sponsor_email` — /me sponsorship lookup
- `sponsorships.stripe_subscription_id` — webhook reconciliation
- `donors.email` — donor lookup by email
- `donors.stripe_customer_id` — webhook customer matching
- `donations.stripe_payment_intent_id` — webhook donation matching
- `child_updates.published_at` — feed ordering

This is one of the immediate wins over Airtable — proper indexes mean queries are fast at any scale.

## What Kevin needs to do

1. **Done:** Provided Supabase access token (`sbp_*`). Project will be created via Management API.
2. **Pending:** Export CSVs from Airtable web UI for every table. Open each table in Airtable → ⋯ menu → Download CSV. Drop all CSVs in a folder Claude can read (probably `airtable-export/` at the repo root, gitignored). 11 tables, each export takes 10 seconds, total maybe 5 minutes of clicks.
3. **Pending:** Add Supabase env vars to Vercel:
   - `SUPABASE_URL` (project URL)
   - `SUPABASE_ANON_KEY` (public anon key)
   - `SUPABASE_SERVICE_ROLE_KEY` (server-side secret, sensitive)
   - `DATABASE_URL` (Postgres connection string in transaction mode)
   Claude will surface all four values after the project is created.
4. **Pending:** Verify the first cutover. After Claude says "ready," hit beanumber.org/[some number] and confirm the kid page loads.

## What Claude is doing

1. **In progress:** Creating Supabase project via Management API.
2. **In progress:** Writing this doc (you're reading it).
3. **Next:** Drizzle schema for every table.
4. **Next:** Migration script that reads CSV exports and writes to Postgres + downloads + re-uploads photos.
5. **Next:** Data-access abstraction (`src/lib/db/`).
6. **Next:** Refactor public read paths to use the abstraction.
7. **Next:** Modify Stripe webhook to write Postgres (and optionally also Airtable during verification window).
8. **Next:** Verification, then deploy.

## Open questions

1. **Bare table names or `prod_` prefix?** Default to bare names (`children`, `sponsorships`) unless Kevin wants to share the Supabase project with a staging environment later. Easier to migrate to bare names later than away from them.

2. **Audit log granularity.** Capture every field change or only sensitive ones (status changes, photo updates, sponsor reassignments)? Going with "every change" by default — disk is cheap, you can't add audit logs retroactively.

3. **Backups.** Supabase Pro tier ($25/mo) gets daily automated backups with 7-day retention. Free tier gets less. For BAN handling kid data, the Pro backup tier is worth it even at free-tier database usage. Recommend adding Pro before we accumulate real production data.

4. **Region.** Supabase project region. Default is `us-east-1` (matches Vercel's iad1 deploy region). Confirm or override.

5. **Sentry.** Add now or later? At thousand-hits-a-day no, at million-hits-a-day yes. Defer until traffic warrants.

## Risks

- **Photo URL migration window.** Airtable attachment URLs expire. If we mess up the timing, we lose photos and have to re-export. Mitigation: run the photo download script immediately after CSV export, never wait.

- **Foreign key mismatches.** Airtable linked records are arrays of record IDs; Postgres FKs are single UUIDs (or junction tables for many-to-many). Migration script needs careful mapping. Mitigation: maintain an `id_mapping` table during migration showing `airtable_record_id → postgres_uuid` for every row, in case we need to debug "where did this Sponsorship get linked."

- **Stripe webhook outage during cutover.** If the webhook handler errors during the switch from Airtable-writes to Postgres-writes, Stripe retries — eventually delivered. But during the gap, /[N] pages for newly-purchased shirts won't show the kid because the Sponsorship row hasn't landed yet. Mitigation: deploy the webhook change last, after Postgres is fully populated and the abstraction is verified.

- **Admin disruption.** While we rebuild admin in-app, Kevin and Simon keep using Airtable for editing — but Airtable is currently rate-limited for THEM too. Mitigation: the Airtable web UI editing surface uses a different connection than the API, so editing in the UI still works during the rate-limit window. Just the API-driven public site is blocked. Confirm with Kevin that Airtable UI editing still functions for him right now.

- **Vendor risk on Supabase.** They're well-funded (Series B, billion-dollar valuation, profitable). Standard cloud Postgres is portable — if Supabase ever goes away, we export and migrate to any other Postgres provider. We're not architecturally locked in.

## Cost analysis

**Current state (broken):**
- Airtable Free: $0/mo — but the site is dark, so the real cost is unbounded (lost transactions, broken trust).

**During migration:**
- Supabase Free tier: $0/mo (500MB DB, 1GB storage, 50K MAU). BAN fits comfortably.
- Vercel: existing cost, no change.
- Kevin's time + Claude's effort: real but already committed.

**Steady state, post-migration:**
- Supabase Pro: $25/mo (8GB DB, 100GB storage, daily backups, point-in-time recovery). Recommended.
- Airtable: $0/mo (canceled).
- Sentry: $0 free tier or ~$26/mo if added.
- Total: ~$25-50/mo for the entire data layer + observability, at any scale BAN realistically reaches.

vs. the alternative of Airtable Business ($54/user/mo × multiple users + still hitting limits): cheaper AND more capable on Postgres.

## End state

- BAN owns 100% of its data in Postgres in Kevin's Supabase account.
- Public site reads from Postgres with effectively no quota ceiling.
- Admin tools are in-app, brand-cohesive, workflow-dense (auto-reveal, drip migration, claim flow all happen IN the admin UI, not as separate triggers).
- Airtable is gone. No per-user fee. No rate limits. No vendor in the middle of customer data.
- Schema is in code, migrations are reviewable, audit log captures every change, backups are automated.
- The stack scales to whatever traffic BAN reaches without architectural change.

This is the right destination. We're starting now.
