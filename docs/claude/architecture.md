# Architecture — the code map

What lives where, what talks to what, and the patterns that are load-bearing. When in doubt about an unfamiliar file, search before assuming; this doc is the compass, not the map.

## Top-level layout

```
beanumber/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx            # Homepage (server component)
│   │   ├── HomePageContent.tsx # Client component for carousel
│   │   ├── layout.tsx          # Root layout, global metadata
│   │   ├── children/[number]/  # Child profile — number-to-name reveal
│   │   ├── shirts/             # Catalog + product pages
│   │   ├── sponsorship/        # Sponsorship landing
│   │   ├── sponsor/            # Sponsor portal (magic-link auth)
│   │   ├── admin/              # Admin dashboard
│   │   ├── api/                # Route handlers (see below)
│   │   ├── donate, founder, impact, governance,
│   │   │   contact, privacy, terms, partnerships,
│   │   │   reports, ydo/       # Content pages
│   │   └── globals.css         # Tailwind entry
│   └── lib/                    # Server-side helpers
├── docs/claude/                # These files
├── public/                     # Static assets
└── (Next config, Tailwind config, tsconfig, etc.)
```

## Routes that matter

### Public pages

- `/` — Homepage. Hero, horizontal children carousel (client component at `HomePageContent.tsx`), footer CTA. Photo is required to appear in the carousel; shirt-number badge is removed on the home tile (lives on the profile page instead).
- `/children/[number]` — The profile page. This is where the number-to-name reveal lands when a shirt arrives. April 15 redesign adds structured intake blocks (ChildQuote pull-quote, Home/Family/Loves labeled blocks, Teacher quote, specific $25-does prose). Falls back to `Notes` if intake isn't filled. Fetches via `getChildByShirtNumber` in `src/lib/tools/children/`.
- `/shirts` — Catalog. Product cards with pre-checkout monthly sponsorship toggle (full-width tappable, gold border when active). The toggle drives the branch in `/api/create-shirt-checkout`.
- `/sponsorship` — Landing page. CTA redirects to Stripe Checkout via `/api/create-sponsor-checkout`.
- `/donate` — One-time donation form. POSTs to `/api/create-checkout`.
- `/founder`, `/impact`, `/governance`, `/contact`, `/privacy`, `/terms`, `/partnerships`, `/reports`, `/ydo` — Content-only.

### Sponsor portal

- `/sponsor/login` — Magic-link request form. Generates a one-time token, stores in Airtable, emails via SendGrid.
- `/sponsor/welcome` — Post-login landing inside the portal.
- `/sponsor/[code]` — Authenticated portal view. Shows child updates, subscription state, billing controls. Respects the reveal gate: lockbox mode (redacted photo, first-initial name) until `ChildRevealedAt` is set on the Sponsorship record. Once revealed, full profile is visible.

### Admin

- `/admin/dashboard` — Top-level admin.
- `/admin/sponsors`, `/admin/updates`, `/admin/newsletter`, `/admin/retention` — Specific subpages. Gated by admin auth (see `src/lib/auth.ts`).

### API routes (all under `/api`)

**Checkout creation (4 routes, all server-side):**

- `POST /api/create-checkout` — One-time donation. `billing_address_collection: 'required'`. Metadata includes donor name, email, optional message.
- `POST /api/create-shirt-checkout` — Shirt purchase. Branches on `continueMonthly` flag: if true, creates a subscription-mode session with shirt as one-time line item + $25/mo recurring; if false, pure payment-mode session for the shirt only.
- `POST /api/create-sponsor-checkout` — Direct sponsorship signup from the child page. Subscription mode, $25/mo, metadata carries shirt number for child linkage.
- `/api/sponsorship/*` — Subscription management from the portal (cancel, pause, update card, swap child).

**Webhook:**

- `POST /api/webhooks/stripe` — The single most load-bearing file in the repo at `src/app/api/webhooks/stripe/route.ts` (~1900 lines). Verifies signature with `STRIPE_WEBHOOK_SECRET`, dispatches on event type:
  - `checkout.session.completed` — creates Donation record, sends thank-you email, notifies admin (email only, no SMS), creates Sponsorship record if applicable, links to Donor (creates if new).
  - `customer.subscription.created` / `.updated` / `.deleted` — mirror subscription lifecycle into Airtable.
  - `invoice.payment_succeeded` — logs recurring payments as Donation records.
  - `charge.refunded` — flags Donation as refunded.

**Cron (hit by Vercel Cron):**

- `/api/cron/drip` — Daily drip email dispatch. Queries Donors where `DripPipeline` is set and `DripNextSend` ≤ today. Sends the next email in the pipeline, advances `DripStage`, sets the next `DripNextSend` based on per-pipeline gap arrays. Clears drip fields when the sequence completes. 5 pipelines, 17 total emails.
- `/api/cron/newsletter` — Daily newsletter assembly from `Scheduled Posts` and dispatch.
- `/api/cron/publish-scheduled` — Runs child-update publishing logic.
- `/api/cron/compliance` — Compliance checks (retention windows, receipt deadlines).

**Admin:**

- `/api/admin/drip-preview` — Sends all 17 drip emails to kevin@beanumber.org with `[PIPELINE X/Y]` subject prefixes. Temporary — delete after review.
- `/api/admin/updates/notify` — Sends update notification to a sponsor (requires admin auth).

**Utility:**

- `/api/health` — Health check endpoint.
- `/api/unsubscribe` — One-click unsubscribe using signed token from `src/lib/unsubscribe-token.ts`.

## Key libraries in `src/lib/`

- `airtable.ts` — The one place the Airtable client is configured. All reads/writes route through here. Table names and field keys are strings; check `airtable_schema.md` before adding new ones — the webhook has 422'd more than once because we wrote to fields that don't exist.
- `auth.ts` — Magic-link token generation + verification for sponsor portal. Admin auth lives alongside.
- `email.ts` — `sendEmail()` abstraction that tries Gmail OAuth2 first, falls back to SendGrid if Gmail isn't configured. In production, Gmail is active. Contains several template functions (`sendSponsorWelcomeEmail`, `sendDonationReceiptEmail`, etc.) that still use old copy and need a voice.md rewrite. All transactional email routes through this file.
- `gmail.ts` — Gmail OAuth2 send implementation. Builds raw MIME messages, handles plain-text-only mode, refresh token flow. This is the active email provider in production.
- `googledrive.ts` — Google Workspace integration for admin workflows (not customer-facing).
- `meta.ts` — OG/Twitter card metadata builders.
- `rate-limit.ts` — In-memory rate limiter for public endpoints.
- `unsubscribe-token.ts` — HMAC-signed unsubscribe tokens.
- `validation.ts` — Zod schemas for route input validation.
- `logger.ts` — Structured logger. Use `log.info`, `log.warn`, `log.error` — do not `console.log`.
- `errors.ts` — Typed error classes + `toResponse()` helpers for consistent API error shape.
- `env.ts` — Validated environment variable loader. If a var is missing, fail at import, not at request time.
- `constants.ts` — Magic numbers (sponsorship amount, shirt price, etc.). Change once, propagate.

### `src/lib/tools/` — the reusable data layer

- `tools/index.ts` — Barrel export. Import domain helpers from here.
- `tools/children/` — `getChildByShirtNumber`, `listChildren`, `getChildUpdates`. These are the canonical read paths for child data.
- `tools/sponsors/` — Sponsor CRUD, subscription state, reveal gate logic.
- `tools/donation/` — `upsertDonation`, Donation Source normalizer, receipt generation.
- `tools/email/` — Template-specific email senders (thank-you, welcome, reveal, monthly update).
- `tools/updates/` — Child update publishing (draft → scheduled → sent).
- `tools/media/` — Image handling, S3/Airtable attachment helpers.
- `tools/social/` — Social post scheduling, attribution shortlinks.
- `tools/compliance/` — 501(c)(3) compliance helpers (receipt year-end roll-up, retention enforcement).
- `tools/send-email.ts` — Lower-level send that `email.ts` wraps. Rarely import directly.
- `tools/_template.ts` — Starter file for a new tool module.

## Patterns that are load-bearing

### The reveal gate

The core brand mechanic is: number on the shirt → name of the child, revealed after purchase. Until `ChildRevealedAt` is set on the Sponsorship record, the sponsor portal renders a "lockbox" state (redacted photo, first initial, no name). Any code that renders child data inside the sponsor portal MUST check reveal status before exposing identifying info. Shortcutting this breaks the brand.

### The four checkout routes are four, not one

Don't try to unify `create-checkout`, `create-shirt-checkout`, `create-sponsor-checkout`, and `sponsorship/*` into a single polymorphic route. Each has a different line-item shape, a different metadata contract, and a different success URL. The webhook handler reads metadata to dispatch; keeping creation routes separate is what keeps the metadata contract readable.

### Webhook as the only write path for donations

All Donation/Sponsorship records are written by the Stripe webhook, never by the checkout creation routes. Reason: checkout creation can fire and the user can bounce. We only record a donation when Stripe confirms money moved. This is correct and non-negotiable.

### Email through `sendEmail()` abstraction

Every outgoing email — transactional, admin notification, cron-driven — goes through `src/lib/email.ts`. Commit `5b8e42a` refactored this; do not reintroduce direct `sgMail.send()` calls in route handlers.

### Airtable reads use the lib, not fetch

Never hit the Airtable REST API directly from a route. Use `src/lib/airtable.ts` or `src/lib/tools/*`. Reason: the lib handles retries, rate limiting, and field-name indirection in one place.

### Typed metadata on Stripe sessions

Every checkout session sets `metadata` with known keys (`kind`, `shirtNumber`, `donorEmail`, etc.). The webhook reads these to dispatch. If you add a new checkout flow, extend the metadata type in the webhook handler's switch, don't shove arbitrary keys.

### Structured intake with fallback

The `/children/[number]` page checks `hasStructured` (any of HomeVillage, FamilyContext, Loves, ChildQuote, TeacherQuote) and renders the new design if any are present, falling back to the legacy Notes field if none are. This is the pattern for any future schema rollout: conditional render, never block on 100% data.

## Integrations

- **Stripe** — Test mode and live mode are different environments. `hershock48` dashboard owns both. Webhook secret differs per endpoint; there's currently a stale endpoint somewhere in the dashboard causing 400 signature-verification failures (see `project_state.md`).
- **Airtable** — Base `app73ZPGbM0BQTOZW` named `Donor Management`. Schema in `airtable_schema.md`. Metadata API (adding singleSelect options, creating fields) is blocked by the sandbox proxy, so schema changes have to happen in the Airtable UI.
- **Gmail OAuth2** — Active email provider. All transactional email (thank-you, drip, admin notification, newsletter, magic link) sends through Gmail API via `src/lib/gmail.ts`. Credentials: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` in Vercel env.
- **SendGrid** — Inactive fallback in `src/lib/email.ts`. Code exists but Gmail takes priority when configured. SendGrid API key is in env but not used in production.
- **Vercel** — Two projects under team `kevins-projects-ec116b76`: `beanumber` (prod, `prj_IwSgQIaCFpVrkmjydT1HcLvufYeO`, serves `www.beanumber.org`) and `beanumber-live` (`prj_vuBv3enBM2LxEBYFMqaupqcRbcAn`, not currently prod). Auto-deploy on push to `main`.
- **GitHub** — Repo `hershock48/beanumber`. Single `main` branch, no feature-branch workflow. Kevin ships from `main`.

## Tailwind conventions

Custom colors and spacing are in `tailwind.config.ts`. The palette in `voice.md` is authoritative: cream `#FFF8F0` background, sand `#e8e0d4` borders, gold `#D4A843` accent, near-black `#0d0d0d` body, mid-gray `#777` secondary. Lora serif for headings (600 weight), system sans for body. When adding new components, reach for these before inventing new values.

## When you don't know where something lives

- Run `git log --oneline -20` for recent context.
- `grep` the repo for a route path, field name, or symbol. The codebase is not huge.
- Check `src/lib/tools/index.ts` for the canonical export list.
- If you're about to touch the webhook, reread the whole route file first. It's long but linear.
