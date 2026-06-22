# Verifying the Stripe webhook dual-write

After `b2deb06` deploys, every Stripe webhook event Airtable handles also writes to Postgres through `src/lib/db/webhook-bridge.ts`. This doc is the procedure to prove it&rsquo;s working.

## What "working" looks like

Three things must be true after a real Stripe event fires:

1. **Vercel logs** contain a `[pg-mirror] ✓ <label>` line for each branch the event touched.
2. **The Postgres row exists** with the expected fields populated.
3. **The audit_log row exists** with `actor_type = 'webhook'` and a sensible `changed_fields` snapshot.

If a `[pg-mirror] ✗ <label>` line shows up, that's a Postgres write that failed — the Airtable write still happened, the user&rsquo;s receipt still went out, but we need to investigate (usually a schema drift or a missing FK).

## Quick procedure after deploy

### 1. Tail the Vercel logs

```
vercel logs --follow www.beanumber.org | grep pg-mirror
```

Leave it open. Every webhook event should produce at least one `[pg-mirror] ✓` line.

### 2. Fire a test event with Stripe CLI

If `stripe listen` is connected to the production webhook secret:

```
stripe trigger checkout.session.completed
```

Or use Stripe Dashboard → Developers → Webhooks → the production endpoint → "Send test webhook." You should see in the Vercel log:

```
[pg-mirror] ✓ donation pi_xxxxxxxxxxxx
```

### 3. Spot-check Postgres

Open Supabase SQL editor (project `ttsnwphctjcbtiyijmdf`) and run:

```sql
-- Most recent 5 mirrored events of each type
select id, donation_source, donation_amount, donor_email_at_donation, created_at
  from donations
  order by created_at desc
  limit 5;

select id, sponsor_code, sponsor_email, monthly_amount, status, created_at
  from sponsorships
  order by created_at desc
  limit 5;

select id, stripe_subscription_id, status, amount, created_at
  from subscriptions
  order by created_at desc
  limit 5;

select id, email, name, stripe_customer_id, created_at
  from donors
  order by created_at desc
  limit 5;
```

### 4. Verify audit_log

```sql
-- Every webhook write in the last hour
select table_name, action, record_id, changed_fields, occurred_at
  from audit_log
  where actor_type = 'webhook'
    and occurred_at > now() - interval '1 hour'
  order by occurred_at desc;
```

There should be one row per mirror call. If not, the audit insert is failing — check the Vercel log for `[audit] failed to write audit row`.

## Per-branch verification

### Standard donation

Trigger: any `checkout.session.completed` without `metadata.order_type` set.
Expected:
- `donors` row upserted by email.
- `donations` row inserted with `donation_source = 'Website'`, `recurring_donation = false`, the Stripe `pi_xxx` in `stripe_payment_intent_id`.
- `audit_log` rows for both.

Query:
```sql
select * from donations
  where stripe_payment_intent_id = 'pi_xxx_from_stripe';
```

### Shirt order

Trigger: `metadata.order_type = 'shirt'`.
Expected:
- `donations` row with `donation_source = 'Shirt Order'`, `donation_note` has size/color details.
- No `sponsorships` row (shirt-only doesn't create one).

### Shirt + monthly

Trigger: `metadata.order_type = 'shirt_plus_monthly'`.
Expected:
- `donations` row with `donation_source = 'Shirt + Monthly'`, `recurring_donation = true`.
- A subsequent `customer.subscription.created` event mirrors into `subscriptions` and (via the drip mirror) updates `donors.drip_pipeline = 'shirt_sponsor'`.

### Sponsorship (kid-page direct)

Trigger: `metadata.order_type = 'sponsorship'`.
Expected:
- `donations` row, `recurring_donation = true`.
- `sponsorships` row with `child_id` populated (resolved from the legacy ChildID via the bridge), `status = 'Active'`, `child_revealed_at` set to now.
- `subscriptions` row mirrored from the subscription event.

### Cart

Trigger: `metadata.order_type = 'cart'`.
Expected:
- `donations` row.
- `sponsorships` row with `child_id = NULL` and `child_id_legacy = NULL` (cart-mode doesn't bind to a kid).

### Subscription canceled

Trigger: `customer.subscription.deleted`.
Expected:
- `sponsorships` rows with that `stripe_subscription_id` flip to `status = 'Cancelled'`, `auth_status = 'Inactive'`, `visible_to_sponsor = false`.

Query:
```sql
select status, auth_status, visible_to_sponsor
  from sponsorships
  where stripe_subscription_id = 'sub_xxx_canceled';
```

### Charge refunded

Trigger: `charge.refunded`.
Expected:
- `donations.payment_status = 'Refunded'`.
- `donations.donation_note` has `[Refunded in full on YYYY-MM-DD]` or `[Partially refunded $X.XX on YYYY-MM-DD]` appended.
- Original `donation_amount` unchanged.

## When something&rsquo;s wrong

### "[pg-mirror] ✗" for a specific branch

The bridge function threw. Read the error suffix in the log line. Common causes:

- **FK violation**: the bridge tried to set `child_id` to a UUID that doesn't exist. Means the kid hasn't been migrated yet (CSVs not loaded), or the legacy ChildID doesn't resolve. The bridge handles this by writing NULL — if you see this error anyway, the schema may have a stricter constraint than expected.
- **Unique violation on `donors_email_lower_idx`**: two donors with the same lowercased email tried to land. Check `upsertDonorByEmail` is being called instead of raw insert.
- **Unique violation on `donations_payment_intent_idx`**: webhook retried, idempotency should have caught it. If it didn't, the dedupe check in `recordDonation` failed — file a bug.

### Postgres row missing but Airtable row exists

The mirror call probably never fired. Check:

1. The webhook code path actually reached the `mirrorToPostgres(...)` line (Vercel log "donation created" before it).
2. The Vercel deploy includes commit `b2deb06` or later. Check `vercel deployments list`.
3. `DATABASE_URL` env var is set on the deploy (Vercel project settings → Environment variables).

### audit_log row missing but the data row exists

The audit insert failed silently. `mutations.ts → audit()` catches every error and logs `[audit] failed to write audit row` to console. Most likely cause is a schema mismatch between the mutation&rsquo;s `auditLog` insert and the actual table. Re-run `npx drizzle-kit migrate` to confirm the schema is in sync.

## Cutover criteria (when to delete the Airtable branches)

Before removing the Airtable writes from the webhook, all of these must be true for at least 72 hours of production traffic:

- Zero `[pg-mirror] ✗` lines in Vercel logs.
- Row counts in Postgres for `donors`, `donations`, `sponsorships`, `subscriptions` match Airtable counts (within ±1, accounting for events in flight).
- A spot-check of the 5 most recent donations confirms field parity between Airtable and Postgres.
- A test sponsor checkout end-to-end produces correct data in both stores.

Once those four conditions hold, the cut is:
1. Delete the Airtable write calls in `/api/webhooks/stripe/route.ts` (keep the mirror calls).
2. Refactor read paths to import from `src/lib/db/queries.ts`.
3. Deploy. Remove `AIRTABLE_*` env vars from Vercel.
4. Cancel the Airtable subscription.
