# Project state

Last updated: April 16, 2026.

**Source of truth is `git log` and the live site.** If this file is stale, trust the code, update the file.

## Stack

- Next.js 16.1.1, App Router, React 19, TypeScript
- Tailwind CSS
- Deployed on Vercel, auto-deploy on push to `main`
- Production domain: `www.beanumber.org`
- Stripe for payments (Checkout Sessions; payment mode and subscription mode)
- Airtable as the source-of-truth CRM/CMS (Donors, Donations, Sponsorships, Children, Child Updates, Communications, Subscriptions, Scheduled Posts, Newsletters)
- Gmail OAuth2 for transactional email (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN) — **not** SendGrid
- Admin SMS alerts: email-to-SMS via T-Mobile gateway — **currently broken**, Twilio recommended as replacement

## What's live

- Homepage `/` — hero, children horizontal carousel (photo required, shirt-number badge removed), footer.
- `/shirts` — shirt catalog with pre-checkout monthly sponsorship toggle (full-width tappable card, gold-bordered when active). Mobile layout shows shirt name above mockups. "Unisex fit" label on each card. FAQ section with JSON-LD FAQPage schema.
- `/children/[number]` — child profile page, redesigned April 15 with structured intake fields (ChildQuote pull-quote, Home/Family/Loves labeled blocks, Teacher quote block, "What your $25 does for [firstname]" specific prose). Falls back to `Notes` field if structured intake isn't filled out yet. Shirt-number badge stays on this page — this is where the number-to-name reveal lands. ShirtNumber backfilled for children 32–46 (was empty, caused 404s). Not-found view has "How the number works" explainer and "Shop the collection" CTA instead of a dead 404.
- `/sponsorship` — sponsorship landing, redirects to Stripe Checkout.
- `/sponsor/login` and sponsor portal — magic-link auth, shows child updates, respects the reveal gate (lockbox mode until `ChildRevealedAt` is set).
- `/donate`, `/founder`, `/impact`, `/governance`, `/contact`, `/privacy`, `/terms` — content pages.
- Admin dashboard routes under `/admin`.
- Stripe webhook `/api/webhooks/stripe` — handles `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_succeeded`, `charge.refunded`.
- Four Stripe checkout creation routes:
  - `/api/create-checkout` — one-time donation, billing address required.
  - `/api/create-shirt-checkout` — shirt purchase; branches on `continueMonthly` flag into payment mode (shirt only) or subscription mode (shirt + $25/mo from day one).
  - `/api/create-sponsor-checkout` — direct sponsorship signup from child page.
  - `/api/sponsorship/*` — subscription management from the portal.
- Daily cron at `/api/cron/*` for newsletter sends and updates.
- JSON-LD structured data: Organization schema (root layout), Article schema (founder, impact), FAQPage schema (shirts).
- Mailing address: 108 N. Sycamore Street, Marshall, MI 49068 (updated April 16 in footer + terms).

## What's in flight

- **Child intake form rollout.** `Child_Profile_Intake_Form.docx` and 6 new Airtable fields (HomeVillage, FamilyContext, Loves, ChildQuote, TeacherName, TeacherQuote) are ready. Kevin needs to send the form to the YDO team. When intake comes back, the structured blocks on `/children/[n]` start rendering.
- **Stripe sandbox webhook validation.** As of commit `2307241`, the webhook no longer writes to nonexistent Airtable fields. Kevin needs to re-run a $5 test donation to verify the Donations record is created, thank-you email goes out, admin notification fires.
- **Shirt-buyer nurture drip sequence.** Shirt-only buyers (no monthly opt-in) currently get one confirmation email and the monthly newsletter. No targeted conversion pipeline exists. Plan: 5 emails over ~30 days nudging toward monthly sponsorship. Infrastructure (cron, email, Airtable Communications table) exists; needs stitching.
- **DNS email authentication.** Customer-facing emails from Kevin@beanumber.org show a red "failed domain authentication" warning in Gmail/Protonmail. Fix requires two DNS records on beanumber.org:
  1. SPF: TXT record including `include:_spf.google.com`
  2. DKIM: Generated from Google Workspace admin or Gmail API signing config
  Kevin needs to add these wherever beanumber.org's DNS is managed.

## What's deferred (Kevin and I agreed, don't restart without asking)

- **ChildID → ShirtNumber migration.** ~20 files reference `ChildID` as a join key between Sponsorships and Children. The Ugandan team only uses shirt numbers, so the field is dead weight. Migration requires coordinated code + data changes; we chose not to take it on mid-stream.
- **Shirt copy cleanup.** Some of the shirt product copy overclaims what the $25 does or frames it as tax-deductible in ways that need a lawyer's eye. Flagged, not fixed.
- **Stripe webhook 400 at 20:02:15 on April 15.** Signature-verification failure, likely a second stale webhook endpoint in Stripe dashboard. Kevin needs to check Stripe Developers → Webhooks for duplicate endpoints and delete the stale one.
- **Donation Source singleSelect options in Airtable.** Code normalizes to "Website" and prefixes the real label onto the Note. Real fix is to add "Sponsorship", "Shirt", "Shirt + Monthly" as options in Airtable's UI.
- **SMS admin alerts.** Email-to-SMS gateway (T-Mobile) silently drops MIME messages. Twilio is the recommended replacement. Parked until Kevin wants to prioritize it.

## Recent meaningful commits (as of 2026-04-16 evening)

```
5c0f118 fix(email): smooth out customer shirt confirmation copy
5fbb130 feat(seo): JSON-LD schema markup + fix success page copy
b59a296 fix(shirts): mobile layout order + unisex fit label
5437ec3 fix: address update, impact photo swap, expanded child not-found page
e2bdd95 fix(shirts): mobile mockup sizing and spacing improvements
6dba1f8 fix(email): ASCII subject + RFC 2047 encoding for non-ASCII
f1f127c fix(email): plain-text-only mode for SMS gateway
af50529 fix(email): rebuild MIME message construction
```

Pull `git log --oneline -15` for current context.

## Known production users

Zero paying customers yet. This is pre-launch. Every $5 you see in Stripe is a test donation from Kevin. Treat Stripe test mode and Stripe live mode as different environments — don't conflate them.

## Artifacts Kevin has that live outside the repo

- `BAN_Brand_Guide.docx` — the long-form brand voice doc. Source of truth for voice.
- `Kevin_and_Claude_Partnership_Charter.docx` — the identity doc I distilled into `charter.md`.
- `Child_Profile_Intake_Form.docx` — the YDO intake form.
- A Stripe account (test + live mode) at `hershock48`'s dashboard.
- An Airtable base `Donor Management` (ID `app73ZPGbM0BQTOZW`).
- Vercel team `kevins-projects-ec116b76` with two projects: `beanumber` (production, `prj_IwSgQIaCFpVrkmjydT1HcLvufYeO`) and `beanumber-live` (`prj_vuBv3enBM2LxEBYFMqaupqcRbcAn`) — the live production site is served from `beanumber`, not `beanumber-live`.
