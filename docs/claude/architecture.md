# Architecture, the code map

What lives where, what talks to what, and the patterns that are load-bearing. When in doubt about an unfamiliar file, search before assuming; this doc is the compass, not the map. Corrected against the code on 2026-10-28 (docs/audit-2026-10.md).

## Top-level layout

```
beanumber/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx            # Homepage (server component)
│   │   ├── HomePageContent.tsx # Client component for the carousel
│   │   ├── layout.tsx          # Root layout, global metadata
│   │   ├── children/[number]/  # Kid page: the number-to-name reveal, the sponsor surface
│   │   ├── meet/[childId]/     # Public per-kid page, no number
│   │   ├── me/                 # My Campus: every kid the viewer sponsors or holds
│   │   ├── signin/             # Magic-link sign-in (email in, one tap)
│   │   ├── shirts/, market/    # Catalog; in-person booth checkout
│   │   ├── christmas/, gift/   # Seasonal pooled fund; gift sponsorship (unlinked, see audit H2)
│   │   ├── campus/, news/      # Signed-in roster browse; published newsletters
│   │   ├── sponsor/            # Redirect stubs to /signin plus /sponsor/welcome (Stripe return)
│   │   ├── rep/                # Founding Cohort applications and dashboard
│   │   ├── admin/              # Admin OS (middleware-gated)
│   │   ├── api/                # Route handlers (see below)
│   │   ├── donate, founder, impact, governance, contact,
│   │   │   privacy, terms, partnerships, reports, ydo/   # Content pages
│   │   └── globals.css         # Tailwind v4 entry (no tailwind.config file)
│   ├── components/             # Shared client/server components
│   ├── lib/                    # Server-side helpers (see below)
│   └── remotion/               # Impact report and reel videos
├── mobile/                     # Expo app (own package)
├── drizzle/                    # Hand-written SQL migrations, 0000 to 0020
├── docs/claude/                # These files
├── tests/                      # node:test files, run by `npm test`
├── scripts/                    # export-donors, print-preview, run-tests
├── public/                     # Static assets
└── next.config.ts, drizzle.config.ts, eslint.config.mjs, postcss.config.mjs, tsconfig.json
```

## Routes that matter

### Public pages

- `/`: homepage. Hero, horizontal kid carousel (client component at `HomePageContent.tsx`), footer CTA. A kid needs a photo to appear in the carousel.
- `/children/[number]`: the kid page. Where the number-to-name reveal lands when a shirt arrives, and the sponsor surface once the viewer is recognised. Reads through `getChildByShirtNumber` in `src/lib/db/queries.ts` for canonical numbers (1 to 53) and the Batches resolver in `src/lib/cycle.ts` for everything above, with the hardcoded era formula in `src/lib/mobile/shirt-cycle.ts` as the fallback (tested in `tests/cycle.test.ts`).
- `/meet/[childId]`: public per-kid page keyed by the legacy ChildID; the indexable kid surface. Its Sponsor button is signed-in only.
- `/shirts`: catalog from `src/lib/products.ts`. Every button posts to `/api/create-cart-checkout`; the monthly opt-in rides as a cart line flag.
- `/market`: booth checkout, posts to `/api/create-market-cart-checkout`.
- `/signin`: the only sign-in. Email in, magic link out, via `/api/sponsor/recover/send-link`.
- `/me`: My Campus. Every Active or Holder sponsorship for the signed-in email.
- `/sponsorship` is a 301 to `/shirts` (`next.config.ts`). `/campus` is sign-in gated.
- `/donate`: one-time or monthly gift, posts to `/api/create-checkout`.
- `/founder`, `/impact`, `/governance`, `/contact`, `/privacy`, `/terms`, `/partnerships`, `/reports/*`, `/ydo/*`, `/news/*`: content.

### The sponsor surface is the kid page, not a portal

There is no separate sponsor portal. Everything sponsor-only (notes thread and composer, personal updates, report cards and letters, awards, shirt reorders) renders inline on `/children/[N]` when the viewer is recognised, and `/me` lists all of their kids.

Recognition:
- The `sponsor_session` cookie is a plain JSON blob `{ email, sponsorCode, expires }`, `httpOnly`, 365 days (`SESSION.MAX_AGE_DAYS` in `src/lib/constants.ts`). It is not signed; the magic-link token that mints it is (`src/lib/recovery-tokens.ts`, HMAC with `CRON_SECRET`).
- The kid page reads the cookie's email and asks "does this email own a sponsorship of this kid, or hold this number" (`findSponsorshipByEmailForChild` in `page.tsx`, `claimed_shirt_number` first). Active with `monthly_amount > 0` is a sponsor; Active with $0 or Holder is a holder. That split drives every conditional render.
- The cookie is set by three endpoints: `GET /api/sponsor/recover/callback` (the magic link; also the landing for `confirm-claim`), `POST /api/sponsor/claim-match` (Shirt + Stay buyers with a `ban_buyer_session` cookie claiming their first kid), and the mobile API's own token flow (`src/lib/mobile-auth.ts`, bearer JWT, not this cookie).
- Claims go through `src/lib/claim-resolve.ts` (number to identity), `src/lib/claim-guard.ts` (second-claim guard, pure), `src/lib/claim-number.ts` (bind a childless checkout row or mint a Holder).

The code-keyed portal (`/sponsor/login`, `/sponsor/[code]`, `/api/sponsor/verify`, `SponsorDashboard`) was deleted on 2026-10-28. The two page paths remain as redirects to `/signin`. `/sponsor/welcome` stays because it is the Stripe `success_url` for sponsor checkout.

### Admin

- `/admin` is the home (the Today view). Tabs in `src/app/admin/_components/AdminShell.tsx`: roster, review queue, messages, fulfillment, newsletter (`/admin/campus-update`), donors, batches, settings. `/admin/dashboard`, `/admin/updates/submit`, `/admin/retention` and `/admin/sponsors` exist but are not in the nav (see the audit, "verify with Kevin").
- Gating: `middleware.ts` checks the HMAC-signed `ban_admin_session` cookie (`src/lib/admin-session-edge.ts`) for every `/admin/*` page. `/api/admin/*` handlers call `requireAdminAuth` from `src/lib/auth.ts`, which accepts that cookie or an `X-Admin-Token` header.

### API routes (all under `/api`)

**Checkout creation (server side; each has its own line-item shape, metadata contract and success URL):**

- `POST /api/create-cart-checkout` and `/api/create-market-cart-checkout`: shirts, `order_type: 'cart'`. Subscription mode when any line carries the monthly opt-in, payment mode otherwise.
- `POST /api/create-sponsor-checkout`: $25/mo from a kid page or `/meet`, `order_type: 'sponsorship'`. Requires a session or the fresh-buyer one-tap context; otherwise 401 with `redirect: '/shirts'` (non-negotiable 4).
- `POST /api/create-checkout`: `/donate`, one-time or monthly.
- `POST /api/create-christmas-checkout`: the pooled Christmas fund, `order_type: 'christmas_gift'`.
- `POST /api/create-gift-checkout`: gift sponsorship, `order_type: 'gift_sponsorship'`. The surface is unlinked and assigns a kid at purchase; see docs/audit-2026-10.md H2.
- `POST /api/sponsor/portal-purchase`: a sponsor reordering a shirt with their own number, `order_type: 'portal_repeat'`.

**Webhook:**

- `POST /api/webhooks/stripe` (`src/app/api/webhooks/stripe/route.ts`, about 3,400 lines, Postgres-only since 2026-09-14). Verifies the signature with `STRIPE_WEBHOOK_SECRET`, then:
  - `checkout.session.completed`: idempotent on the payment intent (a `donations` row already there means a retry). Branches on `order_type`: cart, sponsorship, shirt, shirt_plus_monthly (legacy, no caller mints these any more), portal_repeat, merch_purchase, christmas_gift, gift_sponsorship, plain donation. Writes fulfillments (in-house queue or Printful), the donation, a sponsorship row where the model says so (cart + monthly gets a childless Active row that the buyer's claim later binds), the drip enrolment, and the customer and admin emails.
  - `customer.subscription.created` / `.updated` / `.deleted`: upserts the `subscriptions` row, moves the donor onto a drip pipeline on `.created`, flips sponsorships on `.deleted`.
  - `invoice.payment_succeeded`: each monthly renewal becomes a `donations` row (`src/lib/tools/donation/process-recurring-payment.ts`) plus the renewal thank-you.
  - `charge.refunded`: marks the donation refunded.
- `POST /api/webhooks/printful`: shipped and status events for the dropship line.

**Cron (vercel.json):**

- `/api/cron/newsletter` daily 13:00 UTC: sends any newsletter whose scheduled time has passed.
- `/api/cron/drip` daily 14:00 UTC: next email for every donor whose `drip_next_send` has arrived. Six pipelines, templates inline in the route.
- `/api/cron/push-drain` daily 12:00 UTC: delivers queued pushes.
- `/api/cron/sunday-batch` Sundays 13:00 UTC: the letter-day push to monthly sponsors with the app.

All four take `CRON_SECRET` as a bearer token or `?secret=`.

**Sponsor:**

- `/api/sponsor/recover/send-link`, `/callback`, `/confirm-claim`: sign-in and claim.
- `/api/sponsor/claim-match`, `/reveal`, `/notes`, `/notes/photo`, `/portal-purchase`, `/logout`.

**Mobile:** `/api/mobile/v1/*` (auth, kids, claim, campus feed, newsletter, push, deferred links, account linking). Bearer-token auth, CORS opened in `middleware.ts`.

**Other:** `/api/unsubscribe` (signed token from `src/lib/unsubscribe-token.ts`), `/api/session/status`, `/api/buyer-session`, `/api/shirts/order-status`, `/api/health/links` (link checker, not scheduled), `/api/rep/*` (cohort), `/api/news/*`, `/api/me/*`.

## Key libraries in `src/lib/`

### `src/lib/db/`: the Postgres data-access layer

Postgres on Supabase is the only data store. Airtable was retired in August 2026 and the last code that called it was removed on 2026-09-14.

- `db/schema.ts`: Drizzle table definitions, the source of truth for the shape of the database. A change goes here first, then a hand-written SQL file in `drizzle/` (`NNNN_name.sql`, idempotent, `IF NOT EXISTS`) that Kevin runs in the Supabase SQL editor. Never run `drizzle-kit generate` or `migrate`; `drizzle/meta` is stale and the npm scripts for both were removed (see `drizzle.config.ts`). Conventions: UUID PKs, `airtable_id` kept on migrated tables for cross-reference, status fields as text not enums, partial unique indexes applied in SQL and documented in comments because Drizzle cannot express them.
- `db/client.ts`: Drizzle over the `postgres` driver, lazy, `prepare: false`, pool of 5, for the transaction-mode pooler.
- `db/queries.ts`: every read the site needs. Email lookups always compare `lower(email)`. Kid joins match both the UUID FK and the legacy ChildID text.
- `db/mutations.ts`: every write, idempotent on natural keys, each one writing an `audit_log` row with a `changed_fields` diff.
- `db/webhook-bridge.ts`: what the Stripe webhook writes through. Each call is wrapped in `mirrorToPostgres(label, fn)` so a database error logs instead of failing the Stripe response (which would make Stripe retry every side effect). The "mirror" name is from the June 2026 dual-write window; these are the only writes now.

### Identity and the number

- `roster-config.ts`: `CANONICAL_ROSTER_MAX = 53`.
- `cycle.ts`: the Batches resolver. `resolveShirtToKid(N)` is `(N - batch.start) mod snapshot.length` inside the batch that covers N; `shirtNumbersForKid` is the per-kid footprint.
- `mobile/shirt-cycle.ts`: the hardcoded era formula for #54 to #300, the fallback when a number has no batch. One copy, imported by the kid page, the JSON kid endpoint and the claim resolver.
- `claim-resolve.ts`, `claim-guard.ts`, `claim-number.ts`: see the sponsor surface above.
- `recovery-tokens.ts`: the two signed token kinds (recovery, claim-confirm), 24 hours.
- `sponsor-relationship.ts`: `getViewerEmail` and `getViewerSponsorshipForChild` for pages other than the kid page.
- `sponsor-codes.ts`: `generateUniqueSponsorCode`, database-checked.

### Everything else

- `auth.ts`: `requireAdminAuth` / `verifyAdminToken` for admin API routes and `requireMobileAuth` for the mobile API. Sponsor sessions are not here.
- `admin-session.ts`, `admin-session-edge.ts`: the HMAC-signed admin cookie, Node and Edge flavours.
- `email.ts`: `sendEmail()` tries Gmail (OAuth2, `gmail.ts`) and fails over to SendGrid only if `SENDGRID_API_KEY` is set. Production has only Gmail. Template functions for the newsletter notifications, the sponsor welcome used by claim-match, update notifications, the renewal thank-you and the admin alerts. Note: the Stripe webhook, the drip cron and several admin routes still build their own HTML and pass their own From address (audit H4).
- `gmail/`: the second Gmail sender, authorised through `/admin/connect-gmail` with tokens in `app_settings`; used only by the donor send-email route.
- `products.ts`: the catalog; prices and fulfilment source (`inhouse` tees, `printful` seasonal pieces).
- `printful/`: the dropship line (client, order submission, print files, variant map). Runbook in `docs/printful.md`.
- `shirt-numbers.ts`: number assignment for Printful pieces under an advisory lock, plus the stocked-numbers list.
- `christmas.ts`: the seasonal campaign constants and open/closed logic.
- `penpal-cycle.ts`: the one-included-letter rule for holders, read from `kid_messages`.
- `push/`: Expo push delivery with per-user caps and quiet hours.
- `mobile-auth.ts`, `mobile-users.ts`, `mobile-viewer.ts`, `mobile-link-tokens.ts`: the app's auth and account linking.
- `deferred-link.ts`: fingerprint helpers for install deep links.
- `cohort-members.ts`: the Founding Cohort (`/rep`), table `cohort_members`, migration 0018 (not yet applied in production as of 2026-10-28).
- `newsletter-feed.ts`, `newsletter-title.ts`, `homepage-roster.ts`, `milestones.ts`, `campus-time.ts`, `grades.ts`, `omoro.ts`, `updates-seen.ts`, `storage.ts` (Supabase Storage uploads), `attachments.ts`, `promo-codes.ts`, `free-shipping-window.ts`, `unsubscribe-token.ts`, `logger.ts` (the export is `logger`), `errors.ts`, `validation.ts` (hand-rolled validators; zod schemas live inline in routes), `env.ts` (nothing is required at import; `getEmailConfig()` is the one source of the From address), `constants.ts`.

### `src/lib/tools/`

- `tools/donation/`: `process-recurring-payment.ts` and `reconcile-subscriptions.ts` (behind `/api/admin/reconciliation`).
- `tools/email/send-campus-newsletter.ts`: the newsletter send, with the sponsor and non-sponsor recipient lists.
- `tools/media/`: Google Drive folder and upload helpers for the child-update intake route.
- `tools/health/check-links.ts`: the link checker.

## Patterns that are load-bearing

### The reveal gate

Number on the shirt, then the name. Until `child_revealed_at` is set on the sponsorship, sponsor-only views stay locked, and the kid page runs Hold-to-Meet for anyone who is not already recognised. The `RevealBeacon` on the kid page posts to `/api/sponsor/reveal` to stamp it.

### Separate checkout routes stay separate

Each creation route has a different line-item shape, metadata contract and success URL, and the webhook dispatches on `order_type`. Do not fold them into one polymorphic route.

### The webhook is the only write path for money

Donation and sponsorship rows are written by the Stripe webhook, never by the checkout creation routes. A session can be created and abandoned; we record money when Stripe says it moved.

### Email goes through `sendEmail()`

Every outgoing email goes through `src/lib/email.ts`. No direct provider calls in route handlers.

### Reads in `queries.ts`, writes in `mutations.ts`

A new read is a function in `queries.ts`; a new write is a function in `mutations.ts` so it gets the audit row and the natural-key idempotency. Reaching for `db` inside a route is the exception.

### Typed metadata on Stripe sessions

Every checkout session sets known metadata keys (`order_type` first). The webhook reads them to dispatch. A new flow extends the switch; it does not invent keys ad hoc.

### Structured intake with fallback

The kid page renders the structured blocks (home village, family, loves, quote, teacher quote) when any are present and falls back to the legacy notes field when none are. Conditional render, never block on complete data.

## Integrations

- **Stripe**: test and live are separate environments; the `hershock48` dashboard owns both. One webhook endpoint per mode, each with its own secret in Vercel.
- **Supabase**: Postgres 17 (project `ttsnwphctjcbtiyijmdf`) through the transaction-mode pooler, plus public Storage buckets for kid, update and newsletter photos. Env: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_ATTACHMENTS_BUCKET`.
- **Gmail OAuth2**: the email provider. `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_USER_EMAIL`, `GMAIL_FROM_EMAIL`, `GMAIL_FROM_NAME`.
- **SendGrid**: code path exists as a failover; no SendGrid variables are set in production.
- **Printful**: dropship for seasonal pieces; see `docs/printful.md`.
- **Vercel**: project `beanumber` serves `www.beanumber.org`; auto-deploys from `main`. The apex redirects to www in both `vercel.json` and `next.config.ts`.
- **GitHub**: `hershock48/beanumber`. Work lands on `main` through short-lived branches and PRs.

## Tailwind

Tailwind v4 through `@tailwindcss/postcss`; there is no `tailwind.config` file, the palette is used as literal classes. The palette in `voice.md` is authoritative: cream `#FFF8F0` background, sand `#e8e0d4` borders, gold `#D4A843` accent, near-black `#0d0d0d` body, mid-gray `#777` secondary. Lora serif for headings (600 weight), system sans for body.

## Deep linking

Unified across four surfaces so a shirt QR, an email link, a push notification, and a bare URL all land on the same in-app screen.

### Route table (contract: appears in QRs, emails, push payloads)

| Web URL                                    | App route             |
|--------------------------------------------|-----------------------|
| `beanumber.org/meet/[N]`                   | `/meet/[N]`           |
| `beanumber.org/children/[N]`               | `/children/[N]`       |
| `beanumber.org/children/[N]/updates`       | `/children/[N]/updates` |
| `beanumber.org/newsletter/[id]`            | `/newsletter/[id]`    |
| `beanumber.org/campus`                     | `/(tabs)/explore`     |
| `beanumber.org/me`                         | `/(tabs)/me`          |
| `beanumber://<same paths>`                 | same                  |

The custom-scheme fallback is for push payloads and dev/testing.

### Delivery surfaces

- **iOS Universal Links**: driven by the AASA at `/.well-known/apple-app-site-association` (served by `src/app/.well-known/apple-app-site-association/route.ts`). App bundle ID and Apple team ID are `APPLE_BUNDLE_ID` and `APPLE_TEAM_ID` in Vercel env. Both are required; the route returns 500 if either is missing so a broken deploy fails loudly. `mobile/app.json` sets `ios.associatedDomains: ["applinks:beanumber.org", "applinks:www.beanumber.org"]` and `ios.bundleIdentifier: "org.beanumber.app"`.
- **Android App Links**: driven by the Digital Asset Links file at `/.well-known/assetlinks.json` (served by `src/app/.well-known/assetlinks.json/route.ts`). Env: `ANDROID_PACKAGE_NAME` and `ANDROID_APP_SHA256`. The SHA-256 fingerprint comes from `eas credentials` for the RELEASE build; debug builds have a different fingerprint. `mobile/app.json` sets `android.package: "org.beanumber.app"` and `android.intentFilters` covering every path in the table above.
- **Custom scheme**: `mobile/app.json` sets `scheme: "beanumber"`. Push notifications emit `beanumber://<path>` in the `data.deepLink` field; the push handler in `mobile/hooks/usePushDeepLinks.ts` routes them.

### Client-side plumbing

Three hooks run in the root layout, each attached to a different event source:

- `usePushDeepLinks`: notification-response listener.
- `useWebDeepLinks`: expo-linking initial URL plus `addEventListener('url')`. Handles universal-link and custom-scheme taps.
- `useDeferredLink`: first open only. Hits `/api/mobile/v1/deferred-link/resolve` with the (IP + UA) fingerprint; routes if a match is found.

All three route through the same normaliser in `mobile/lib/deepLink.ts` (`parseIncomingUrl` plus `routeFor`). The route allow-list is enforced there; anything outside the table above returns null, so `/admin/*` and `/api/*` cannot sneak into the app.

### Deferred-link fallback

When a shirt QR scan hits `beanumber.org/meet/[N]` on a phone without the app, the smart-open banner on `/children/[N]` (rendered when the server-side UA sniff detects iOS or Android, and only when `MOBILE_APP_LIVE=1`) offers "Open in Be A Number." Tapping it:

1. `POST /api/mobile/v1/deferred-link/stamp` with `{ targetPath: "/meet/N", shirtNumber: N, source: "children_banner" }`. The server hashes (client IP + normalised UA) and inserts a row into `pending_deferred_links` with `expires_at = now + 10min`. That table comes from `drizzle/0008`, which had not been applied in production as of 2026-10-28.
2. The client tries `beanumber://meet/N` (fires the app if installed).
3. If the page is still visible after 1.2s, it redirects to the App Store or Play Store with `?ct=meet_N` as a campaign token.
4. On first open, the app calls `POST /api/mobile/v1/deferred-link/resolve` with the same fingerprint. If a live row matches, the endpoint marks it consumed and returns `targetPath`.

The hold-to-meet ritual is preserved regardless of how the number arrives. `/meet/[N]` in the app always runs the HoldButton.

### Files

Web: `src/app/.well-known/apple-app-site-association/route.ts`, `src/app/.well-known/assetlinks.json/route.ts`, `src/app/api/mobile/v1/deferred-link/{stamp,resolve}/route.ts`, `src/lib/deferred-link.ts`, `src/lib/db/schema.ts` (`pendingDeferredLinks`), `drizzle/0008_pending_deferred_links.sql`, `src/app/children/[number]/MobileAppBanner.tsx`, `src/app/children/[number]/page.tsx`.

Mobile: `mobile/app.json`, `mobile/lib/deepLink.ts`, `mobile/hooks/useWebDeepLinks.ts`, `mobile/hooks/useDeferredLink.ts`, `mobile/app/_layout.tsx`.

### Test

```bash
curl -H "Accept: application/json" https://beanumber.org/.well-known/apple-app-site-association | jq .
curl -H "Accept: application/json" https://beanumber.org/.well-known/assetlinks.json | jq .
```

## When you don't know where something lives

- Run `git log --oneline -20` for recent context.
- `grep` the repo for a route path, field name, or symbol. The codebase is not huge.
- If you're about to touch the webhook, reread the whole route file first. It's long but linear.
- `docs/audit-2026-10.md` lists what was dead, what drifted, and what is still open.
