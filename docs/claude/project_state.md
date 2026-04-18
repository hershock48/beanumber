# Project state

Last updated: April 18, 2026.

**Source of truth is `git log` and the live site.** If this file is stale, trust the code, update the file.

## Stack

- Next.js 16.1.1, App Router, React 19, TypeScript
- Tailwind CSS
- Deployed on Vercel, auto-deploy on push to `main`
- Production domain: `www.beanumber.org`
- Stripe for payments (Checkout Sessions; payment mode and subscription mode). Currently on **test mode keys** in Vercel env. Switching to live requires swapping 3 env vars (see operations.md).
- Airtable as the source-of-truth CRM/CMS (Donors, Donations, Sponsorships, Children, Child Updates, Communications, Subscriptions, Scheduled Posts, Newsletters)
- Email: `sendEmail()` in `src/lib/email.ts` is a dual-provider abstraction. Tries Gmail OAuth2 first (`GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`), falls back to SendGrid if Gmail isn't configured. In production, Gmail is configured and active — SendGrid is dead-code fallback. All outbound email routes through this abstraction.
- Admin order notifications: email only (to kevin@beanumber.org). SMS gateway was removed April 18 — Kevin requested it killed, not replaced.

## What's live

- Homepage `/` — hero, children horizontal carousel (photo required, shirt-number badge removed), footer.
- `/shirts` — shirt catalog with pre-checkout monthly sponsorship toggle (full-width tappable card, gold-bordered when active). Mobile layout shows shirt name above mockups. "Unisex fit" label on each card. FAQ section with JSON-LD FAQPage schema. 6 designs: flagship, thank-you, do-not-fear, peacemaker, everything-hallelujah, nigeria. Container-query-based responsive sizing on all mockups.
- `/children/[number]` — child profile page, redesigned April 15 with structured intake fields (ChildQuote pull-quote, Home/Family/Loves labeled blocks, Teacher quote block, "What your $25 does for [firstname]" specific prose). Falls back to `Notes` field if structured intake isn't filled out yet. Shirt-number badge stays on this page — this is where the number-to-name reveal lands. ShirtNumber backfilled for children 32–46 (was empty, caused 404s). Not-found view has "How the number works" explainer and "Shop the collection" CTA instead of a dead 404.
- `/sponsorship` — sponsorship landing, redirects to Stripe Checkout.
- `/sponsor/login` and sponsor portal — magic-link auth, shows child updates, respects the reveal gate (lockbox mode until `ChildRevealedAt` is set). Live impact counters (days, meals, school days, dollars) computed from sponsorship start date. Timeline with milestones (3-month, 100/365/500/1000 days, yearly). Single-screen messaging flow with randomized conversation starters (40 prompts, shuffleable). "New" badges on updates since last visit.
- `/donate`, `/founder`, `/impact`, `/governance`, `/contact`, `/privacy`, `/terms` — content pages. 96.7% efficiency stat removed from all marketing pages (kept on financial summary report and governance page only).
- Admin dashboard routes under `/admin`.
- Stripe webhook `/api/webhooks/stripe` — handles `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_succeeded`, `charge.refunded`. Admin notification is email-only (no SMS).
- Four Stripe checkout creation routes:
  - `/api/create-checkout` — one-time donation, billing address required.
  - `/api/create-shirt-checkout` — shirt purchase; branches on `continueMonthly` flag into payment mode (shirt only) or subscription mode (shirt + $25/mo from day one).
  - `/api/create-sponsor-checkout` — direct sponsorship signup from child page.
  - `/api/sponsorship/*` — subscription management from the portal.
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

- **Child intake form rollout.** `Child_Profile_Intake_Form.docx` and 6 new Airtable fields (HomeVillage, FamilyContext, Loves, ChildQuote, TeacherName, TeacherQuote) are ready. Kevin needs to send the form to the YDO team. When intake comes back, the structured blocks on `/children/[n]` start rendering.
- **Stripe live mode cutover.** Site is ready for real money. Kevin needs to: (1) copy live API keys from Stripe dashboard, (2) create a live webhook endpoint in Stripe pointing at `www.beanumber.org/api/webhooks/stripe`, (3) update 3 Vercel env vars (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`), (4) redeploy, (5) run a real $1 test donation and refund it.
- **DNS email authentication.** Customer-facing emails from Kevin@beanumber.org show a red "failed domain authentication" warning in Gmail/Protonmail. Fix requires two DNS records on beanumber.org:
  1. SPF: TXT record including `include:_spf.google.com`
  2. DKIM: Generated from Google Workspace admin or Gmail API signing config
  Kevin needs to add these wherever beanumber.org's DNS is managed.
- **Legacy email templates in `src/lib/email.ts` need voice.md rewrite.** Several template functions (`sendSponsorWelcomeEmail`, `sendDonationReceiptEmail`, `sendRecurringDonationThankYouEmail`, `sendUpdateNotificationEmail`, `sendUpdateRequestConfirmationEmail`) use banned phrases ("Dear", "generous", "empowerment", "making a difference", "sustainable community systems") and the wrong visual style (Helvetica, dark headers instead of Georgia/cream). The webhook thank-you email was rewritten; these haven't been yet.
- **Delete drip-preview endpoint** after Kevin finishes reviewing the 17 preview emails.

## What's deferred (Kevin and I agreed, don't restart without asking)

- **ChildID → ShirtNumber migration.** ~20 files reference `ChildID` as a join key between Sponsorships and Children. The Ugandan team only uses shirt numbers, so the field is dead weight. Migration requires coordinated code + data changes; we chose not to take it on mid-stream.
- **Shirt copy cleanup.** Some of the shirt product copy overclaims what the $25 does or frames it as tax-deductible in ways that need a lawyer's eye. Flagged, not fixed.
- **Stripe webhook 400 at 20:02:15 on April 15.** Signature-verification failure, likely a second stale webhook endpoint in Stripe dashboard. Kevin needs to check Stripe Developers → Webhooks for duplicate endpoints and delete the stale one.
- **Donation Source singleSelect options in Airtable.** Code normalizes to "Website" and prefixes the real label onto the Note. Real fix is to add "Sponsorship", "Shirt", "Shirt + Monthly" as options in Airtable's UI.

## Recent meaningful commits (as of 2026-04-18)

```
93406f3 shrink shirt mockup designs: front logo, nigeria, hallelujah
237b1e7 remove 96.7% efficiency stat from marketing pages
a231b94 remove SMS gateway notification from webhook
02c9a18 swap impact page photos: campus to hero, Kevin to body
1ec16a5 fix(drip): rewrite all 17 emails for natural human voice
af769ea New-update badges + localStorage last-visited tracking
d3937bd Randomized conversation starters (20 share + 20 ask prompts)
860f14c Delay sponsor code to email 2, rewrite email 1 tone, trim portal copy
d6f770c Fix school days math, simplify messaging to single-screen
1c77f61 feat(portal): live impact counters, richer timeline, table ID fix
```

Pull `git log --oneline -15` for current context.

## Known production users

Zero paying customers yet. Pre-launch. Every $5 in Stripe is a test donation from Kevin. Stripe is on test mode keys. Switching to live is the next step (see "in flight" above).

## Artifacts Kevin has that live outside the repo

- `BAN_Brand_Guide.docx` — in the repo root. The long-form brand voice doc. Source of truth for voice.
- `Kevin_and_Claude_Partnership_Charter.docx` — the identity doc I distilled into `charter.md`.
- `Child_Profile_Intake_Form.docx` — the YDO intake form.
- A Stripe account (test + live mode) at `hershock48`'s dashboard.
- An Airtable base `Donor Management` (ID `app73ZPGbM0BQTOZW`).
- Vercel team `kevins-projects-ec116b76` with two projects: `beanumber` (production, `prj_IwSgQIaCFpVrkmjydT1HcLvufYeO`) and `beanumber-live` (`prj_vuBv3enBM2LxEBYFMqaupqcRbcAn`) — the live production site is served from `beanumber`, not `beanumber-live`.
