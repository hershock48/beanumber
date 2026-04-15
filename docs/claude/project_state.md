# Project state

Last updated: April 15, 2026.

**Source of truth is `git log` and the live site.** If this file is stale, trust the code, update the file.

## Stack

- Next.js 16.1.1, App Router, React 19, TypeScript
- Tailwind CSS
- Deployed on Vercel, auto-deploy on push to `main`
- Production domain: `www.beanumber.org`
- Stripe for payments (Checkout Sessions; payment mode and subscription mode)
- Airtable as the source-of-truth CRM/CMS (Donors, Donations, Sponsorships, Children, Child Updates, Communications, Subscriptions, Scheduled Posts, Newsletters)
- SendGrid for transactional email
- Mailgun-style carrier SMS gateway for admin alerts

## What's live

- Homepage `/` — hero, children horizontal carousel (photo required, shirt-number badge removed), footer.
- `/shirts` — shirt catalog with pre-checkout monthly sponsorship toggle (full-width tappable card, gold-bordered when active).
- `/children/[number]` — child profile page, redesigned April 15 with structured intake fields (ChildQuote pull-quote, Home/Family/Loves labeled blocks, Teacher quote block, "What your $25 does for [firstname]" specific prose). Falls back to `Notes` field if structured intake isn't filled out yet. Shirt-number badge stays on this page — this is where the number-to-name reveal lands.
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

## What's in flight

- **Child intake form rollout.** `Child_Profile_Intake_Form.docx` and 6 new Airtable fields (HomeVillage, FamilyContext, Loves, ChildQuote, TeacherName, TeacherQuote) are ready. Kevin needs to send the form to the YDO team. When intake comes back, the structured blocks on `/children/[n]` start rendering. Some sample records can be pre-filled in Airtable to preview the design before Uganda turnaround.
- **Stripe sandbox webhook validation.** As of commit `2307241`, the webhook no longer writes to nonexistent Airtable fields. Kevin needs to re-run a $5 test donation to verify the Donations record is created, thank-you email goes out, admin notification fires. See `operations.md` for the test procedure.

## What's deferred (Kevin and I agreed, don't restart without asking)

- **ChildID → ShirtNumber migration.** ~20 files reference `ChildID` as a join key between Sponsorships and Children. The Ugandan team only uses shirt numbers, so the field is dead weight. Migration requires coordinated code + data changes; we chose not to take it on mid-stream. When revisiting, search for `ChildID` across the repo and plan the refactor before touching records.
- **Shirt copy cleanup.** Some of the shirt product copy overclaims what the $25 does or frames it as tax-deductible in ways that need a lawyer's eye. Flagged, not fixed.
- **Stripe webhook 400 at 20:02:15 on April 15.** Signature-verification failure, likely a second stale webhook endpoint in Stripe dashboard pointing at the same URL with the wrong secret. Need Kevin to check Stripe Developers → Webhooks for duplicate endpoints on `www.beanumber.org/api/webhooks/stripe` and delete the stale one.
- **Donation Source singleSelect options in Airtable.** Code normalizes to "Website" and prefixes the real label onto the Note. Real fix is to add "Sponsorship", "Shirt", "Shirt + Monthly" as options to the singleSelect in Airtable's UI (Airtable metadata API blocked by sandbox proxy). When that's added, the normalizer in `upsertDonation` can be removed.

## Recent meaningful commits (as of 2026-04-15 afternoon)

```
2307241 fix(webhook): stop writing nonexistent Donation fields
c36b0ab feat(children): structured intake fields + homepage badge cleanup
cca7f72 feat(shirts): promote monthly sponsorship toggle to a real opt-in card
7e4c41d feat(home): convert children grid to horizontal carousel, photo required
5b8e42a refactor(webhook): route transactional emails through sendEmail() abstraction
e7d5ce6 feat(webhook): admin order notification to email + carrier SMS gateway
6a1f5be feat(shirts): remove Cross Tee, flagship front=cross mark, back=white
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
