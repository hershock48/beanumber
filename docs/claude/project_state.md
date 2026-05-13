# Project state

Last updated: May 13, 2026.

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
- `/shirts` — shirt catalog. Each shirt card has a two-button active-choice CTA pattern (memo §1, shipped May 13): primary filled gold "Shirt + Stay — $25 today, then $25/mo", secondary outlined "Shirt only — $25 once". Stacks vertically on mobile. The old opt-in toggle card is gone; the explanatory "Stay in their life" block above the buttons is now non-interactive context. School-year framing throughout ("$25 starts their year. $25/month finishes it."). Mobile layout shows shirt name above mockups. "Unisex fit" label. FAQ section with JSON-LD FAQPage schema. 4 designs in the live `SHIRTS_SOURCE` array (flagship, do-not-fear, peacemaker, everything-hallelujah).
- `/children/[number]` — child profile page, redesigned April 15 with structured intake fields (ChildQuote pull-quote, Home/Family/Loves labeled blocks, Teacher quote block, "What your $25 does for [firstname]" specific prose). Falls back to `Notes` field if structured intake isn't filled out yet. Shirt-number badge stays on this page — this is where the number-to-name reveal lands. ShirtNumber backfilled for children 32–46 (was empty, caused 404s). Not-found view has "How the number works" explainer and "Shop the collection" CTA instead of a dead 404.
- `/sponsorship` — sponsorship landing, redirects to Stripe Checkout.
- `/sponsor/login` and sponsor portal — magic-link auth, shows child updates, respects the reveal gate (lockbox mode until `ChildRevealedAt` is set). Live impact counters (days, meals, school days, dollars) computed from sponsorship start date. Timeline with milestones (3-month, 100/365/500/1000 days, yearly). Single-screen messaging flow with randomized conversation starters (40 prompts, shuffleable). "New" badges on updates since last visit. **"Shop Your Number" section** (memo §5, shipped May 13): active sponsors with a revealed child can reorder shirts that ship stamped with their existing number; gated by `sponsorship.status === 'Active'` and a known `ShirtNumber`. Lapsed sponsors keep number + match but lose the order surface.
- `/donate`, `/founder`, `/impact`, `/contact`, `/privacy`, `/terms` — content pages. 96.7% efficiency stat removed from all marketing pages (kept on financial summary report and governance page only).
- `/governance` — 501(c)(3) facts, governance, **funding model section** (memo §0, shipped May 13: pool-funded with personal matching, Compassion/WV comparison, restricted-gift exceptions), 2025 financial snapshot.
- Admin dashboard routes under `/admin`.
- Stripe webhook `/api/webhooks/stripe` — handles `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_succeeded`, `charge.refunded`. Branches on `metadata.order_type`: `shirt`, `shirt_plus_monthly`, `sponsorship`, `cart`, `portal_repeat` (new), or default donation. The `portal_repeat` branch skips child assignment / new sponsorship / drip enrollment and writes Fulfillment with the existing shirt number plus a production note. Admin notification is email-only (no SMS).
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

Zero paying customers yet. Pre-launch. Every $5 in Stripe is a test donation from Kevin. Stripe is on test mode keys. Switching to live is the next step (see "in flight" above).

## Artifacts Kevin has that live outside the repo

- `BAN_Brand_Guide.docx` — in the repo root. The long-form brand voice doc. Source of truth for voice.
- `Kevin_and_Claude_Partnership_Charter.docx` — the identity doc I distilled into `charter.md`.
- `Child_Profile_Intake_Form.docx` — the YDO intake form.
- A Stripe account (test + live mode) at `hershock48`'s dashboard.
- An Airtable base `Donor Management` (ID `app73ZPGbM0BQTOZW`).
- Vercel team `kevins-projects-ec116b76` with two projects: `beanumber` (production, `prj_IwSgQIaCFpVrkmjydT1HcLvufYeO`) and `beanumber-live` (`prj_vuBv3enBM2LxEBYFMqaupqcRbcAn`) — the live production site is served from `beanumber`, not `beanumber-live`.
