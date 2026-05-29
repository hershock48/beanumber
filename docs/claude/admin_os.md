# BAN Admin OS — design + build plan

> The software Kevin uses to run Be A Number every day. Not an admin panel.
> An operating system for running a nonprofit alone.

---

## Vision

Be A Number is a one-person nonprofit. Kevin runs shipping, sponsor comms,
content, finance, fulfillment, partner relations, fundraising, and the
ongoing relationship with Simon and the YDO team — all of it. The software
he logs into every day should compress all of that into a single surface
that knows what's happening, tells him what's waiting on him, and gives him
one-tap actions to handle it.

The legacy `/admin/*` routes are gone-by-the-end-of-this-rebuild. They were
built page-by-page (newsletter, fulfillment, updates) each with its own
password gate, each surfacing a slice of Airtable. That's a CMS, not an
operating system. Kevin doesn't want a CMS. He has Airtable for that.

---

## Principles

1. **One login per device.** Cookie auth, 30-day expiration. Password
   prompt once, never again until logout or expiry. This is the floor.
2. **Triage over navigation.** The home screen is a list of things waiting
   on Kevin, in priority order. Not a feature menu. Not a sidebar of links.
3. **Action where the data is shown.** If the home screen surfaces "3
   child updates pending," the publish button sits inside that card. No
   nav.
4. **Where Airtable already wins, don't recreate it.** Raw data entry
   (adding a Donor manually, editing a Sponsorship's Notes field for
   internal reference) stays in Airtable. Admin OS owns the workflows
   Airtable is bad at: writing kid bios, sending newsletters, publishing
   updates, processing shipments, triaging churn.
5. **Mobile-first.** Kevin runs BAN from his phone half the time. Every
   screen must work at 375px wide, with thumb-reachable controls and
   no two-column layouts that collapse to garbage on iOS.
6. **Voice-aware AI.** Claude API is wired in with voice.md as the system
   prompt. Every writing task in the admin (bio rewrite, newsletter
   draft, sponsor thank-you) uses it. Kevin reviews, edits, ships. The
   AI never auto-publishes — Kevin always has the last word.
7. **Proactive over reactive.** A 7am daily digest email tells Kevin
   what happened yesterday and what's waiting today. Push notifications
   for high-priority events (high-LTV sponsor cancel, Simon submits a
   batch). Kevin shouldn't have to remember to check.
8. **One source of truth: Airtable.** The admin reads from and writes
   to Airtable. No second database. Kevin can still open Airtable
   directly for anything we haven't built UI for.

---

## The home screen — what Kevin sees when he opens /admin

A single column of action cards, prioritized top to bottom by urgency.
Each card has a title, a count, a one-sentence summary, and either an
inline action or a "see all" link into a focused sub-screen.

Cards (in priority order):

### Updates pending publish
> **3 child updates from Simon's team — waiting for you.**
> "Naume #1 (Naume term-end), Mara #3 (photo + grades), Elvis #9 (handwritten letter)."
> [Publish & notify all] [Review one by one →]

Each update has been submitted by YDO via the admin/updates intake form
(already exists). Tap "Publish & notify" → publishes to Airtable, sends
the per-kid sponsor notification email, marks the update Published.
Bulk publish ships in v1 if all updates are routine; review-one-by-one
opens a swipeable card stack.

### Shirts to ship
> **12 orders ready to ship.**
> "$300 in shirt revenue waiting on you."
> [Print packing slips] [Mark all shipped] [See orders →]

One-tap print of all packing slips as a single PDF. Mark shipped flips
their fulfillment status and triggers the shipping confirmation email.
v2 wires Pirate Ship for one-click labels.

### Newsletter due
> **It's been 31 days since your last newsletter.**
> "Last sent April 27. Open the editor when you're ready."
> [Compose] [Skip this month]

When clicked, the newsletter editor opens inline (modal or full-screen
takeover) — not a separate page that re-prompts auth. The editor has
the AI-assist hook: paste raw notes from a campus report → Claude API
drafts in Kevin's voice → Kevin edits → preview → dry run → send.

### Sponsor activity
> **2 new sponsors this week. 1 cancellation.**
> "Marc Snyder → Naume #1. Erin Kelley → Elvis #9. Cancelled: Sandra Goff."
> [Send thank-yous] [Save attempt for Sandra]

Tap "Send thank-yous" → Claude drafts a personal thank-you to each new
sponsor in Kevin's voice → Kevin reviews → sends. Tap "Save attempt"
→ drafts the win-back email.

### Roster gaps
> **18 kids missing name meanings. 22 missing bios. 4 missing photos.**
> [Open the roster manager →]

Click through to the roster manager (dedicated sub-screen — see below).

### This month
> **8 new sponsorships · 1 churned · $475 in shirts · $2,150 MRR**
> Up from $1,950 last month.

Quick numerical pulse. No charts in v1. A "see breakdown" link opens
the financial dashboard (v2).

---

## Sub-screens

### Roster manager (`/admin/roster`)
Grid of kid cards. Each card shows photo, name, age, grade, shirt
number, and a profile-completeness indicator (5 dots: photo, name
meaning, family context, loves, bio). Sortable by completeness, by
number, by last edited.

Tap a card → split screen:
- Left: source material (paste from Simon's email or YDO PDFs)
- Right: editable form for the structured fields + bio + name meaning
- Below: live preview of the rendered `/[number]` page (iframe)
- Top right: "Rewrite in my voice" button → Claude API call → fills
  in the right-side form with a draft Kevin reviews/edits

Saving writes to Airtable. Live preview reloads.

### Newsletter editor (`/admin/newsletter`)
Renamed and modernized. Stays a sub-route but no password re-prompt.
Same compose/preview/dry-run/send workflow as today, but with:
- AI-assist button: "draft from these notes" → Claude API drafts in
  Kevin's voice using existing newsletter archive + voice.md as
  context
- Hero photo upload directly in the editor (writes to Airtable's
  HeroPhoto field)
- Visible recipient count + segment preview before send
- Send confirmation flow that explicitly states "this will email N
  active sponsors and is irreversible"

### Fulfillment (`/admin/fulfillment`)
Modernized version of what exists today. Mobile-friendly card-per-order
view. Print packing slips as PDF (one or many). Mark shipped (one or
many). Stripe webhook handles confirmation email.

v2 integrations:
- Pirate Ship label generation
- Tracking number auto-populate
- Photo upload of the shipped package (proof + future content)

### Inbox & sponsor activity (`/admin/inbox`)
v2 screen. Consolidated view of:
- New sponsorships (Stripe webhook events)
- Cancellations (Stripe webhook events)
- Recovery requests (magic-link form submissions)
- Reply-tos on drip emails (if email provider supports inbound)

Each row has a one-tap action: thank-you, save-attempt, send-link, reply.

### Financial pulse (`/admin/finance`)
v2 screen. Two or three numbers that matter, displayed without ceremony:
- MRR this month vs last month
- Net new sponsors per week (last 12 weeks)
- Average sponsor lifetime
- Top 10 highest-LTV sponsors
- Stripe-Airtable reconciliation status (any orphans?)

No charts unless they earn their place.

---

## AI integration design

A single Claude API endpoint at `/api/admin/ai/generate` that all
writing surfaces in the admin use. It takes:
- `kind`: 'kid_bio' | 'newsletter_draft' | 'sponsor_thank_you' | 'sponsor_save_attempt' | 'partnership_email' | 'campus_update'
- `source`: the raw input text Kevin's working from
- `context`: any per-kind metadata (kid record for bios, recent newsletters for newsletter drafts, sponsor history for thank-yous)

The endpoint:
1. Loads `voice.md` as the system prompt baseline
2. Loads the appropriate template/example for the `kind`
3. Loads `context` (e.g. for kid bios: the existing bios for siblings,
   the kid's structured fields, the schema rules from `airtable_schema.md`)
4. Calls Claude (Sonnet) with that primed prompt
5. Returns the draft as text

Kevin always reviews and edits before publishing. The AI never writes
directly to Airtable. The "Publish" / "Send" button is always a
deliberate second click.

Voice rules from voice.md are absolute:
- No "generous," no "impact" as verb, no "empowerment"
- No "peasant farmer," no "bright and hopeful," no "investing in a life"
- Direct, specific, personal, confident, faith-rooted not faith-forward
- Short sentences. Real names. Concrete details. No rule-of-three patterns.

---

## Auth design

Single login flow:
1. Kevin visits any `/admin/*` route
2. If no valid session cookie → redirect to `/admin/login`
3. `/admin/login` is a single password field + submit button
4. POST `/api/admin/auth` validates against `ADMIN_PASSWORD` env var
5. On success: set httpOnly cookie `admin_session` with HMAC-signed
   value (admin_id + expires), 30-day expiry
6. All subsequent `/admin/*` route renders check the cookie via
   `requireAdminSession()` server-side
7. All admin API endpoints check the cookie OR the X-Admin-Token header
   (for backward compat / cron / scripts)
8. Logout button clears the cookie

This means: one password entry per device, valid for 30 days. No
re-prompting between admin pages. Sessions can be revoked by rotating
`ADMIN_PASSWORD` (everyone gets logged out on next page load).

---

## Mobile-first specifics

Every screen is built for 375px wide first, then scaled up.
- Single column layout always
- Action cards stack vertically, full-width
- Buttons are thumb-reachable: 44pt minimum tap target
- Text is 16px+ (no smaller, never)
- Forms use native iOS keyboards (email type, number type, etc.)
- Photo uploads accept camera + photo library
- No drag-and-drop UI that doesn't work on touch
- "See all" / "Review one by one" CTAs open swipeable card stacks
  on mobile, side-by-side on desktop
- Login form is a single full-screen field

---

## Technical architecture

### Routes
- `/admin` — triage home
- `/admin/login` — password form
- `/admin/roster` — kid roster manager
- `/admin/roster/[number]` — kid profile editor
- `/admin/newsletter` — newsletter editor (existing, refactored)
- `/admin/newsletter/[id]` — editing a specific newsletter
- `/admin/fulfillment` — shipping queue (existing, refactored)
- `/admin/updates` — pending updates queue
- `/admin/updates/[id]` — review one update
- `/admin/inbox` — v2
- `/admin/finance` — v2
- `/admin/settings` — logout, rotate password, manage integrations

### Middleware
- `middleware.ts` at the repo root checks the admin session cookie for
  any `/admin/*` route and redirects to `/admin/login` if missing or
  expired. Single source of truth for admin auth.

### Server-side data layer
- `src/lib/admin/queries.ts` — read functions (pending updates, ships
  due, this month's stats, roster completeness)
- `src/lib/admin/actions.ts` — write functions (publish update, mark
  shipped, send newsletter, save kid bio)
- Both wrap the existing Airtable client. No new database.

### Daily digest
- `/api/cron/admin-digest` — runs at 6:55am Marshall time. Builds the
  same data as the home screen, formats as an email, sends to Kevin's
  email.

### Push notifications
- v2. Vercel cron + a Slack webhook OR a service like Pushover for
  high-priority events. Defer until v1 is in use.

---

## Build phases — what ships when

### v1 — foundation + triage (this build, target: shippable end of next session)
Goal: Kevin logs in once, sees what's waiting, can act on the most
common tasks without re-authing.

- [ ] Cookie auth + middleware
- [ ] `/admin/login` page (single password field)
- [ ] `/admin` home page (server-rendered, mobile-first)
- [ ] Card: Updates pending publish (links to existing publish flow)
- [ ] Card: Shirts to ship (links to existing fulfillment page)
- [ ] Card: Newsletter due (links to existing newsletter page)
- [ ] Card: Sponsor activity (read-only this/last week)
- [ ] Card: Roster gaps (read-only count)
- [ ] Card: This month numbers (read-only)
- [ ] Top nav with logout button
- [ ] Kill the password gate from `/admin/newsletter`, `/admin/dashboard`,
  `/admin/fulfillment` — they all use the new cookie

### v2 — roster manager (next build)
- [ ] `/admin/roster` grid view
- [ ] `/admin/roster/[number]` split-screen editor
- [ ] Live preview iframe
- [ ] Claude API integration for "rewrite in my voice"
- [ ] Photo upload from device
- [ ] AI assist for kid bio writing

### v3 — communications hub
- [ ] Newsletter editor refresh (AI-assisted draft)
- [ ] Drip campaign visibility
- [ ] Segmented broadcast email
- [ ] AI-assisted sponsor thank-yous (triggered from sponsor-activity card)
- [ ] AI-assisted churn save-attempt drafts

### v4 — operational integrations
- [ ] Pirate Ship label generation
- [ ] One-click Stripe customer portal session link generator
- [ ] WhatsApp/SMS to Simon

### v5 — financial pulse + inbox
- [ ] `/admin/finance` with MRR + churn + LTV + reconciliation
- [ ] `/admin/inbox` consolidated activity feed
- [ ] Email replies inbound (if provider supports it)

### v6 — proactive
- [ ] Daily 7am digest email
- [ ] Push notifications for high-priority events
- [ ] Predictive churn alerts (sponsors at risk before they cancel)

---

## What gets killed

The current admin surfaces, after v1 ships:
- `/admin/dashboard` — replaced by `/admin`
- The per-page password prompts on `/admin/newsletter` and
  `/admin/fulfillment` — replaced by cookie middleware
- The `/admin/updates/submit` page is YDO-facing (not Kevin's), so it
  stays as-is. But the publish/notify flow moves into the new home.

Any orphan admin route discovered during the v1 build that nothing
references gets deleted.

---

## Success criteria

After v1 ships, Kevin should be able to do all of the following on his
phone in under five minutes total, with one password entry per device
per month:

1. Land on `/admin`, see the four things waiting on him today.
2. Publish 3 pending child updates in three taps, triggering all
   sponsor notifications.
3. Mark today's shirts shipped.
4. Compose and send the May newsletter without re-authing.
5. Glance at this month's MRR and net new sponsors.

That's the bar. Until the v1 ships and Kevin can do that, no v2 work.
