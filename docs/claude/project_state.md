# Project state

Last updated: July 6, 2026.

## 2026-07-06 — where the business actually is

**BAN is live and has real paying customers.** Any sentence below this section that says "pre-launch" or "zero paying customers" is stale; treat this section as authoritative.

Snapshot from the production Postgres as of 7/6:

- **21 unique monthly sponsors** across **24 active/trialing subscriptions** (some sponsors on multiple kids)
- **$600/month** recurring revenue committed
- **44 unique shirt buyers**, **45 total shirt orders** all-time
- **33 active sponsorships** (some pending kid-claim, which is normal — the buyer claims by visiting `/children/[N]`)
- **159 donors** total in the CRM
- **50 real kids** on the canonical roster (shirt numbers 1-53, 3 gaps not yet added)

Growth trajectory (new monthly sponsors by start month):
- April 2026: 3
- May 2026: 8
- June 2026: 12
- July 2026: 1 (as of 7/6)

Stripe is on **live keys** and has been for weeks. The Marshall farmers market booth is a live acquisition channel; cash + card buyers are backfilled into Postgres via `scripts/backfill-market-sales.ts` (patched 7/6 to route subscription buyers to `sponsor_onboard` drip, not `shirt_nurture`).

Site channels currently active:
- `/shirts` — primary conversion surface, two-button pattern
- `/children/[N]` — sponsor identity + kid page + reveal flow (Hold-to-Meet)
- `/me` — signed-in sponsor home (kid cards + campus snapshot + monthly stats)
- `/campus` — browse mode, sign-in gated
- `/news` — newsletter archive
- Drip: 5 pipelines / 17 emails, live and firing
- Newsletter: authored via `/admin/campus-update`, sent from `/admin/newsletter`, mirrors onto every kid page

Zero-paying-customers language elsewhere in this file predates the launch and stays for historical context only. Do not quote it as current fact.

---

## 2026-06-22 session — Postgres migration shipped (dual-write live)

Airtable Free-plan API quota burned through and took the site dark on reads. Kevin refused to upgrade. Migration to a self-owned Postgres stack is now most of the way done:

- **Stack chosen and live**: Supabase Postgres 17 (`ttsnwphctjcbtiyijmdf`) via transaction-mode pooler on `aws-1-us-east-1.pooler.supabase.com:6543`, Drizzle ORM, `postgres` driver. Three Storage buckets (`children-photos`, `update-photos`, `newsletter-photos`) public with 10MB image-MIME allow-list. Connection requires `prepare:false, max:1`. Env vars set in Vercel: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

- **Schema is live**: 15 tables created via Drizzle migration `0000_initial.sql`. All FKs, indexes, unique constraints in place. `audit_log` and `id_mapping` tables exist for write provenance and Airtable→Postgres ID cross-reference. See `docs/claude/postgres_migration.md` for the architecture decisions.

- **Data-access layer built**:
  - `src/lib/db/queries.ts` — every public read (kid by shirt number / UUID / legacy ChildID, homepage roster, viewer→child sponsorship, /me dashboard, recent newsletters, latest update per kid, donor + subscription lookups, batches). Backwards-compat join keys so it handles the transition window where some sponsorships still carry only the legacy ChildID.
  - `src/lib/db/mutations.ts` — every webhook/admin write, each one auditing automatically. Idempotent on natural keys (email lowered, payment intent, subscription id, sponsor_code).
  - `src/lib/db/webhook-bridge.ts` — bridge module the Stripe webhook calls. Wraps every mutation in `mirrorToPostgres(...)` so Postgres failures log without breaking the Airtable write or the Stripe receipt.

- **Stripe webhook dual-writes everything to Postgres now** (commit `b2deb06`). Touches: donation upsert, sponsorship creation (both standard and cart variants), subscription canceled, charge refunded, subscription created/updated (plus the drip-pipeline field mirror on `.created`). Means no webhook events are lost during the cutover window. Once verified, the final cut to Postgres-only is a one-diff Airtable-branch removal.

- **CSV migrator built** (`scripts/migrate-from-csv.ts`). Idempotent, runs once Kevin exports the 11 CSVs from Airtable's web UI (the web export doesn't burn API quota). Resolves Airtable linked records via primary-field lookup, downloads time-sensitive Airtable signed-URL photos and re-uploads to Supabase Storage with correct extensions (derived from attachment filename or content-type, not hardcoded). Subscription donor FK resolves via Stripe API (`sub` → `customer` → `donor.stripe_customer_id`) with a strict name-match fallback that refuses ambiguous matches.

- **What's blocked on Kevin**: export the 11 CSVs (Donors, Donations, Sponsorships, Children, Child Updates, Communications, Subscriptions, Scheduled Posts, Newsletters, Fulfillments, Batches) into `/airtable-export/` (gitignored). Then I run `npm run migrate-csv-dry`, then `npm run migrate-csv`.

- **What ships after CSVs land**:
  1. Refactor read paths (`/[N]`, `/meet/[id]`, `/campus`, `/me`, `/news`, `sponsor-relationship.ts`, `newsletter-feed.ts`, `cycle.ts`) to import from `queries.ts` instead of Airtable.
  2. Verify: row-count diff vs Airtable snapshot, smoke-test `/5` `/10` `/50`, Stripe-CLI replay an end-to-end checkout.
  3. Remove Airtable writes from the webhook (the dual-write becomes Postgres-only).

- **Reminder**: the sandboxed Linux FS can't unlink files in the mounted folder; `git commit` from the mount leaves a lock file. Commit from `/sessions/<session>/work-beanumber/` instead. Did so for `b2deb06`.

## 2026-06-07 session — sponsorship data integrity fires

What happened today, recorded so it doesn't get lost:

- **Amanda Sobel Woods** complained her sponsorship pointed at the wrong kid. She bought shirt #10 (James Bulemu Musinguzi), but her Sponsorship `BAN-2026-793` had `Children` linked to cycle record #64 (which maps via cycle math to Aaron #12). Relinked her sponsorship to kid #10 manually in Airtable, set ChildID = `HSP/BAN-010`, ChildDisplayName = `James Bulemu Musinguzi`.

- **Sam Lynn** (Samantha "Banfield" dupuis, sbanfield2015@gmail.com) reported she keeps getting the non-sponsor newsletter variant despite being an active sponsor of Aaron Ouma Joseph #12. I initially "fixed" this by checking her `Recurring Supporter` checkbox — which was based on a wrong premise. The newsletter segmenter does not look at that field. The real cause is undetermined. See `known_gotchas.md` → "Newsletter May 2026 Recap had non-sponsor variant delivered to actual sponsors."

- **4 cart+monthly buyers from 2026-06-05 had no Sponsorship records and (probably) no Stripe subscriptions:** Jordan Young, Brittany Osborn, Mary Sigler, Jean M Kleppick. All have Stripe Customer IDs and shirt charges, but the deferred `stripe.subscriptions.create()` call in the webhook apparently failed silently for all 4 — no alert emails reached kevin@beanumber.org. Manually created Airtable Sponsorship rows for each (codes BAN-2026-142, -308, -561, -884) with `Children` link blank, Status=Active, $25/mo, SponsorshipStartDate 2026-06-05. **Their actual Stripe subscription state is still unverified.** Kevin needs to either run `POST /api/admin/stripe/sync` from the admin panel (it backfills any missing Sponsorships against active Stripe subs) or spot-check one customer in the Stripe dashboard.

- **Root architecture problem identified:** the cart checkout uses `mode: 'payment'` and tries to retroactively create subscriptions via API in the webhook. That post-payment path is fragile and apparently failing silently. Also, the webhook deliberately skips Sponsorship row creation for cart+monthly buyers ("we can't link to a child we haven't matched yet") — that premise violates `core_model.md` §0 (no matching, ever). See `known_gotchas.md` → "Cart+monthly checkout silently drops the recurring half — CRITICAL."

- **Proposed but not yet shipped:** (1) switch cart+monthly to `mode: 'subscription'` in Stripe Checkout, (2) auto-create Sponsorship row on `checkout.session.completed` with empty `Children` link, (3) investigate why the webhook's alert-email path silently dropped 4 failures in a row.

- **Sync confirmed the 4 have no Stripe subs.** Kevin ran `POST /api/admin/stripe/sync` after the manual Sponsorship creation. The 4 Sponsorship records still have `StripeSubscriptionID` blank, which means the sync (which walks active Stripe subs and links them to Airtable rows) found no matching subscriptions for any of the 4 customers. **None of Jordan, Brittany, Mary, or Jean has an active recurring subscription in Stripe.** They paid for shirts and have saved payment methods on file, but no monthly is being collected. Kevin needs to either manually create the 4 subs in Stripe (using the saved cards) or send them a re-subscribe link before this becomes a $100/mo perpetual loss.

- **Reminder for future sessions: there is no separate sponsor portal anymore.** All sponsor content lives on `/[number]`. `/sponsor/login` and `/sponsor/[code]` are deprecated. Sponsor identity is the `sponsor_session` cookie carrying SponsorCode. See `architecture.md` → "Sponsor surface."

- **Shirt insert card** — print-ready PDF generated at `shirt-insert.pdf`. Front: "This Number has a Name." / "OPEN TO MEET THEM." Back: BAN as 501(c)(3) + EIN. Inside: scan-and-meet flow, "The shirt is how you meet them." / "$25 a month is how you stay." Gold cross logos (#D4A843), black text. Back panel rotated 180° on the print sheet so it reads upright after fold. Inside split into two centered 4.4″ halves. Source: `shirt-insert-print.html` at repo root.

---

**Source of truth is `git log` and the live site.** If this file is stale, trust the code, update the file.

## Stack

- Next.js 16.1.1, App Router, React 19, TypeScript
- Tailwind CSS
- Deployed on Vercel, auto-deploy on push to `main`
- Production domain: `www.beanumber.org`
- Stripe for payments (Checkout Sessions; payment mode and subscription mode). **Live mode** as of the July 2026 snapshot — real money, real sponsors ($600/mo recurring). Test-mode language elsewhere in this doc is stale.
- **Postgres (Supabase) is source of truth** as of July 2026. The public site reads through `src/lib/db/queries.ts`; the webhook writes through `src/lib/db/webhook-bridge.ts` and `src/lib/db/mutations.ts`. Airtable is legacy read-only in a few admin-side surfaces; ignore it for sponsor-facing paths.
- Email: `sendEmail()` in `src/lib/email.ts` is a dual-provider abstraction. Tries Gmail OAuth2 first (`GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`), falls back to SendGrid if Gmail isn't configured. In production, Gmail is configured and active — SendGrid is dead-code fallback. All outbound email routes through this abstraction.
- Admin order notifications: email only (to kevin@beanumber.org). SMS gateway was removed April 18 — Kevin requested it killed, not replaced.

## What's live

- Homepage `/` — hero, children horizontal carousel (photo required, shirt-number badge removed), footer.
- `/shirts` — shirt catalog. Each shirt card has a two-button active-choice CTA pattern (memo §1, shipped May 13): primary filled gold "Shirt + Stay — $25 today, then $25/mo", secondary outlined "Shirt only — $25 once". Stacks vertically on mobile. The old opt-in toggle card is gone; the explanatory "Stay in their life" block above the buttons is now non-interactive context. School-year framing throughout ("$25 starts their year. $25/month finishes it."). Mobile layout shows shirt name above mockups. "Unisex fit" label. FAQ section with JSON-LD FAQPage schema. 4 designs in the live `SHIRTS_SOURCE` array (flagship, do-not-fear, peacemaker, everything-hallelujah).
- `/children/[number]` — child profile page, redesigned April 15 with structured intake fields (ChildQuote pull-quote, Home/Family/Loves labeled blocks, Teacher quote block, "What your $25 does for [firstname]" specific prose). Falls back to `Notes` field if structured intake isn't filled out yet. Shirt-number badge stays on this page — this is where the number-to-name reveal lands. ShirtNumber backfilled for children 32–46 (was empty, caused 404s). Not-found view has "How the number works" explainer and "Shop the collection" CTA instead of a dead 404.
- `/sponsorship` — sponsorship landing, redirects to Stripe Checkout.
- **There is no longer a separate "sponsor portal."** All sponsor-only content (updates, letters, report cards, shop-your-number, manage-subscription, messaging) lives inline on `/[number]`, gated by the `sponsor_session` cookie matching that kid's `SponsorCode`. The `/sponsor/[code]` dashboard route and `/sponsor/login` form still exist in code but are deprecated surfaces — they should not be linked to or advertised, and they are NOT the primary path. **Sponsor identity is the `sponsor_session` cookie.** Set by: (a) clicking the HMAC-signed auto-login link in a sponsor newsletter email (`/api/sponsor/recover/callback`), (b) hitting the "claim" button on `/[number]` after a shirt arrives (`/api/sponsor/claim-match`), or (c) the deprecated manual login form (`/api/sponsor/verify`). When `/[number]` server-renders, it reads the cookie's sponsorCode, compares to the kid's Sponsorship.SponsorCode → if match, `viewerIsSponsor = true`, the page hides the $25/mo ask and shows sponsor-only content.
- `/donate`, `/founder`, `/impact`, `/contact`, `/privacy`, `/terms` — content pages. 96.7% efficiency stat removed from all marketing pages (kept on financial summary report and governance page only).
- `/governance` — 501(c)(3) facts, governance, **funding model section** (memo §0, shipped May 13: pool-funded with personal matching, Compassion/WV comparison, restricted-gift exceptions), 2025 financial snapshot.
- Admin dashboard routes under `/admin`.
- Stripe webhook `/api/webhooks/stripe` — handles `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_succeeded`, `charge.refunded`. Eight branches on `metadata.order_type`: (1) standard one-time donation (no `order_type` set, default), (2) `shirt`, (3) `shirt_plus_monthly`, (4) `sponsorship` (direct from `/[N]`), (5) `cart` (multi-shirt + optional monthly), (6) `portal_repeat` (existing sponsor reorders their number — skips child assignment / new sponsorship / drip enrollment, writes Fulfillment with the existing shirt number), (7) `gift_sponsorship` (gifter pays, recipient gets a kid match), (8) `merch_purchase` (existing sponsor buys hat/hoodie/sticker carrying their kid's number). Admin notification is email-only (no SMS). As of 2026-06-22, all eight branches dual-write to Postgres via `src/lib/db/webhook-bridge.ts` — Airtable writes still happen but a single-line diff cuts to Postgres-only once the 72-hour observation window passes clean.
- Five Stripe checkout creation routes:
  - `/api/create-checkout` — one-time donation, billing address required. Saves payment method off-session for future one-tap conversion.
  - `/api/create-shirt-checkout` — single-shirt purchase; branches on `continueMonthly` flag into payment mode (shirt only) or subscription mode (shirt + $25/mo from day one). All shirt purchases now create a Stripe Customer + save payment method off-session (memo §2 prereq).
  - `/api/create-cart-checkout` — multi-shirt cart purchase. Same customer-object + saved-method behavior, unconditionally.
  - `/api/create-sponsor-checkout` — direct sponsorship signup from child page.
  - `/api/sponsor/portal-purchase` — Shop Your Number repeat orders. Authenticates via sponsor session cookie, gates on `Status === 'Active'`, threads existing shirt number in metadata, attaches to existing Stripe Customer when available for true one-tap.
  - `/api/sponsorship/*` — subscription management from the portal.
- All checkout routes use `payment_method_types: ['card', 'link']` so Stripe Link / Apple Pay / Google Pay are offered.
- **Drip email system** at `/api/cron/drip` — 5 pipelines, 17 emails total, fully built and deployed:
  - `shirt_nurture` (4 emails over ~30 days) — shirt buyer → sponsorship conversion
  - `sponsor_onboard` (3 emails over ~21 days) — new sponsor welcome + portal intro
  - `donor_convert` (3 emails over ~25 days) — one-time donor → sponsorship nudge
  - `shirt_sponsor` (4 emails over ~25 days) — shirt+monthly buyer → portal onboarding
  - `monthly_donor` (3 emails over ~22 days) — monthly donor → meet the kids + sponsorship intro
  - Preview endpoint at `/api/admin/drip-preview` sends all 17 to kevin@beanumber.org (delete after review).
- Daily cron at `/api/cron/*` for newsletter sends, updates, and drip dispatch.
- JSON-LD structured data: Organization schema (root layout), Article schema (founder, impact), FAQPage schema (shirts).
- Mailing address: 108 N. Sycamore Street, Marshall, MI 49068 (updated April 16 in footer + terms).

## What's in flight

- **Mobile app (2026-07-16): client feature-complete, waiting on Kevin-side store prerequisites.** Expo SDK 55 / expo-router app in `mobile/`, built in isolation from the website (server surface is `/api/mobile/v1/*` + shared libs only — the website is not informed of the app). Shipped this pass: verified email linking (`/link/request` + `/link/confirm` — magic link proves inbox ownership, stamps `mobile_users.linked_sponsor_email`, sign-ins never clobber it), email-SET matching on every mobile route (provider + linked email), in-app claim (`POST /api/mobile/v1/claim` using the per-number claim machinery, explicit "Keep #N" CTA on the reveal — never auto-claim), cycle-number display resolution in kids/mine and /me, thread unification across emails, envelope-unwrap fix in the client API layer (every authed surface would have rendered empty without it), manual number entry (EnterNumberSheet — previously QR/deferred links were the only path to `/meet/[N]`), LinkEmailSheet on Home/Penpal/Me, real-name greeting, singular-they copy, deep-link module merge, dead v0.1 prototype deleted, `eas.json` → www host, first-ever clean `tsc` on the mobile codebase. Kevin-side blockers before store submission are in `docs/app-store-submission.md`: Apple Developer Program (+fee waiver), Play Console, OAuth client IDs, four Vercel env vars.
- **Child intake form rollout.** `Child_Profile_Intake_Form.docx` and 6 new Airtable fields (HomeVillage, FamilyContext, Loves, ChildQuote, TeacherName, TeacherQuote) are ready. Kevin needs to send the form to the YDO team. When intake comes back, the structured blocks on `/children/[n]` start rendering.
- **Stripe live mode cutover.** Site is ready for real money. Kevin needs to: (1) copy live API keys from Stripe dashboard, (2) create a live webhook endpoint in Stripe pointing at `www.beanumber.org/api/webhooks/stripe`, (3) update 3 Vercel env vars (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`), (4) redeploy, (5) run a real $1 test donation and refund it.
- **DNS email authentication.** Customer-facing emails from Kevin@beanumber.org show a red "failed domain authentication" warning in Gmail/Protonmail. Fix requires two DNS records on beanumber.org:
  1. SPF: TXT record including `include:_spf.google.com`
  2. DKIM: Generated from Google Workspace admin or Gmail API signing config
  Kevin needs to add these wherever beanumber.org's DNS is managed.
- **Legacy email templates in `src/lib/email.ts` need voice.md rewrite.** Several template functions (`sendSponsorWelcomeEmail`, `sendDonationReceiptEmail`, `sendRecurringDonationThankYouEmail`, `sendUpdateNotificationEmail`, `sendUpdateRequestConfirmationEmail`) use banned phrases ("Dear", "generous", "empowerment", "making a difference", "sustainable community systems") and the wrong visual style (Helvetica, dark headers instead of Georgia/cream). The webhook thank-you email was rewritten; these haven't been yet.
- **Delete drip-preview endpoint** after Kevin finishes reviewing the 17 preview emails.

## What's planned (not started)

- **Founder's Series shirt.** Limited run of 25 premium, hand-pressed shirts at $150–$250, positioned as the major-donor entry point. The natural step up for a donor who already owns a $25 flagship and wants something more meaningful. Lives in operational planning; not yet built, no SKU, no design files in the repo. Sits in the giving-architecture upgrade ladder (one-time shirt → monthly sponsor → second-child sponsor → Founder's Series → cohort trip → restricted gifts).
- **Annual sponsorship tier.** $300/year ("commit to the school year"), positioned alongside the existing $25/month on `/sponsorship` and `/donate` (NOT on `/shirts`). Reduces churn on the most committed segment, captures year-end tax-strategic giving. Requires a second Stripe price object and minor schema work on the Sponsorships table.
- **Gift sponsorships.** Two flavors: gift-shirt (physical) and gift-sponsorship (digital card, scheduled delivery date). Recipient meets their child via a `/[number]?gift=true` framing. Tax receipt to the gifter; if the recipient continues at $25/mo it's their own record going forward.
- **Gift-to-gifter conversion loop.** Follow-up email to the gifter 2 weeks after recipient reveal nudging toward their own sponsorship; holiday-timed re-engagement; `/sponsor/gifter` view in the portal. Depends on gift sponsorships shipping first.
- **/[number] page rebuild as primary conversion surface (memo §2).** Child photo + name + grade above the fold, one-tap recurring confirm via saved Stripe customer, child-voice paragraph, newsletter fallback. Gated on YDO intake form completion (the structured-intake fields drive the page's content).
- **Lapsed-sponsor reactivation cron (memo §7).** `/api/cron/lapsed` with 30/60/90-day cadence + annual back-to-school. Needs live subscription churn events to test against — gated on Stripe live-mode cutover.
- **Quid-pro-quo receipt logic with IRS threshold tiering (memo §8).** Three thresholds: <$75 (FMV note), $75–$250 (IRC §6115 disclosure), $250+ (IRC §170(f)(8) written ack). Needs FMV decisions on each SKU first.

## What's deferred (Kevin and I agreed, don't restart without asking)

- **ChildID → ShirtNumber migration.** ~20 files reference `ChildID` as a join key between Sponsorships and Children. The Ugandan team only uses shirt numbers, so the field is dead weight. Migration requires coordinated code + data changes; we chose not to take it on mid-stream.
- **Stripe webhook 400 at 20:02:15 on April 15.** Signature-verification failure, likely a second stale webhook endpoint in Stripe dashboard. Kevin needs to check Stripe Developers → Webhooks for duplicate endpoints and delete the stale one.
- **Donation Source singleSelect normalizer** (resolved May 13). All four extra labels — `Portal Repeat`, `Sponsorship`, `Shirt Order`, `Shirt + Monthly` — are now valid Airtable options. The normalizer in `webhooks/stripe/route.ts` stays as a safety net for any future label code might pass before its Airtable option exists.

## Recent meaningful commits (as of 2026-05-13)

```
96794f9 feat(portal): Shop Your Number — sponsor reorders with existing shirt number
8ac4046 feat(shirts): two-button active-choice checkout pattern
6f75f5e feat(governance): add public-facing funding model section
863daa2 feat(checkout): create Stripe Customer + save payment method on every order
d70f99f refactor(copy): pool-model verb hygiene + school-year framing across funnel
a6df005 docs(funding-model): document pool-funding model + planned items + v2 memo
8da9852 Speed up child profile page: deduplicate Airtable calls and parallelize I/O
f6c35a0 fix(admin): separate auth from data loading on dashboard
a6bca00 feat(donors): auto-fill summary fields, backfill endpoint
2d26d54 fix(webhook): email Kevin when monthly subscription creation fails
```

Pull `git log --oneline -15` for current context.

## Known production users

**Stale as of 7/6/2026 — see the 2026-07-06 section at the top for real numbers.** Left in place as historical context.

~~Zero paying customers yet. Pre-launch. Every $5 in Stripe is a test donation from Kevin. Stripe is on test mode keys. Switching to live is the next step (see "in flight" above).~~

## Artifacts Kevin has that live outside the repo

- `BAN_Brand_Guide.docx` — in the repo root. The long-form brand voice doc. Source of truth for voice.
- `Kevin_and_Claude_Partnership_Charter.docx` — the identity doc I distilled into `charter.md`.
- `Child_Profile_Intake_Form.docx` — the YDO intake form.
- A Stripe account (test + live mode) at `hershock48`'s dashboard.
- An Airtable base `Donor Management` (ID `app73ZPGbM0BQTOZW`).
- Vercel team `kevins-projects-ec116b76` with two projects: `beanumber` (production, `prj_IwSgQIaCFpVrkmjydT1HcLvufYeO`) and `beanumber-live` (`prj_vuBv3enBM2LxEBYFMqaupqcRbcAn`) — the live production site is served from `beanumber`, not `beanumber-live`.
