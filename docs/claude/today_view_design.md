# Today View + Donor Profiles — Design Outline

> The morning-ritual screen. Replaces the current task-card admin home with a person-centric, prioritized list of "here are the 8 things to do right now." Each item drills into a donor / sponsor profile page that gives Kevin every piece of context he needs to write something personal. The two surfaces are designed together — Today shows who to look at, the profile shows everything about them. One ritual, no bouncing between tabs.

---

## 1. What it is

The current admin is **task-organized**: Newsletter, Roster, Fulfillment, SOTM. You open the tab that matches the work you remember to do.

The Today view is **person-organized**: every signal across every system distilled into a ranked list of relationships and actions waiting on you. You don't have to remember to check the newsletter tab — if a newsletter action is needed, it shows up here.

Concrete example of what the top of the screen reads on a Friday morning:

```
GOOD MORNING, KEVIN.  6 ITEMS WAITING.

URGENT
⚠ Order #134 has been stuck in the queue for 9 days.
  [Ship now]   [Why?]                    [done] [snooze]

QUICK WINS
★ Sarah hits 6 months with Marvin tomorrow.
  [Open Sarah's profile]                  [done] [snooze]

✦ Simon picked Aaron Ouma Joseph for SOTM.
  [Approve]   [See kid]                   [done] [snooze]

✦ 12 orders ready to ship.
  [Open queue]                            [snooze]

RELATIONSHIPS
✦ Mike Davis's shirt arrived 4 days ago — hasn't visited Asenath yet.
  [Open Mike's profile]                   [done] [snooze]

✦ 2 sponsors cancelled in May. Worth asking why?
  [See list]                              [snooze]

May 2026 · 52 active sponsors · $1,300/mo · 47 profiles complete
```

Click "Open Sarah's profile" → lands on the new donor profile page with everything in one view: kid she sponsors, gift history, drip stage, when Kevin last talked to her, free-form notes. Kevin reads, writes a personal email in Gmail (his own composing, not pre-filled), comes back, clicks "Mark contacted" with a quick note. The Today item disappears.

Done in 15 minutes. Close tab. Repeat tomorrow.

---

## 2. The daily flow

**Morning (the main use case).** Coffee. Open `/admin`. Scan the top section. Handle 5–8 items. Most are one click — primary button either resolves the item (Approve, Ship now) or opens the donor's profile so Kevin has full context for a personal reach-out. Close tab.

**Mid-day check-in.** New items have surfaced (new sponsors, new orders, Simon edits). Same UX — scan and handle.

**Evening.** Lower-stakes relationship work — lapsed donors, anniversaries coming up later this week, "I should call X" notes.

Not the use case: real-time alerts, inbox-style chat, custom dashboards. Today is a list that gets done and goes empty.

---

## 3. Item types

Grouped by signal source. Each item type produces zero or more rows in the daily list.

### A. Sponsorship lifecycle (the highest-leverage group)

| Item | Trigger | Action |
|---|---|---|
| **New sponsor needs welcome** | Sponsorship created in last 48h, no welcome interaction logged | Open profile |
| **Anniversary milestone** | 1mo / 3mo / 6mo / 1yr exactly | Open profile |
| **Sponsor cancelled** | Stripe `customer.subscription.deleted` in last 30d | Open profile |
| **Payment failed** | Stripe `invoice.payment_failed` | Open profile |
| **Sponsor at risk** | No portal login in 60+d AND monthly amount ≥$50 | Outreach email |
| **Kid's sponsor got a moment** | Kid was named SOTM, or report card / letter uploaded | Open each sponsor's profile |

### B. Shirt buyer journey

| Item | Trigger | Action |
|---|---|---|
| **Shirt arrived, no visit yet** | Order shipped 3+ days ago, no recorded visit to `/[number]` | Open profile |
| **Drip completed without converting** | DripStage reached final stage, no sponsorship | "Hey, want to chat?" email |
| **Multi-shirt buyer, no sponsorship** | Bought ≥2 shirts, no active sponsorship | Higher-value conversion email |

> Note: "visit to /[number]" requires lightweight page-view tracking — not built yet. Phase 2 unless we add a hit counter.

### C. Operational tasks

| Item | Trigger | Action |
|---|---|---|
| **Orders ready to ship** | Fulfillment rows with Production=Ready | Jump to fulfillment queue |
| **Stuck order** | Single row in queue 7+ days | Open that order |
| **Simon edits to review** | Any kid with PendingFields or LastEditedBySimon | Open kid editor (jumps to most-recent edit) |
| **SOTM pending approval** | Any kid with PendingSOTMMonth | One-click approve |
| **Monthly campus update due** | Today is ≥28th and no Newsletter sent for this month | Open editor |
| **Quarter end approaching** | <14 days to quarter-end, X kids without report card | List those kids |
| **Letter deadline approaching** | <30 days to Dec 1, X kids without letters | List those kids |

### D. Donor relationships

| Item | Trigger | Action |
|---|---|---|
| **Large gift just came in** | One-time donation ≥$100 in last 48h | Open profile |
| **Repeat donor anniversary** | 1yr since first donation | Open profile |
| **Lapsed donor** | No donation in 6+ months | Open profile |
| **Donor with no kid attached** | Has given but never sponsored a specific kid | Open profile (match suggestion lives there) |

### E. Light-touch signals (read-only context)

These don't generate action rows but inform the footer or sidebar:
- Active sponsor count + MRR delta vs last month
- Newsletter send queued / scheduled
- Recent /[number] traffic if we have it

---

## 4. Signal sources (where the data comes from)

Every item type maps to an existing or near-existing data source. No new external integrations required for v1.

| Source | What we pull | Used for |
|---|---|---|
| Airtable `Sponsorships` | Status, SponsorshipStartDate, MonthlyAmount, SponsorEmail, SponsorName, ChildID | Anniversaries, cancellations, at-risk |
| Airtable `Donors` | DripPipeline, DripStage, DripNextSend, Recurring Supporter, Most Recent Donation | Drip stage, lapsed donor |
| Airtable `Donations` | Donation Amount, Donation Date, Donor Email | Large gifts, repeat donors |
| Airtable `Children` | StudentOfMonth, PendingSOTMMonth, LastEditedBySimon, PendingFields, ReportCards, Letters | Roster ops, SOTM, intake |
| Airtable `Fulfillment` | Production, Shipping, Order Date | Orders to ship, stuck orders |
| Airtable `Newsletters` | Status, SendDate, BodyHTML | Monthly update due |
| Stripe webhooks (already wired) | subscription.deleted, invoice.payment_failed | Cancellation, payment fail |

We will need one new Airtable surface: a small `TodayActions` table for snooze/dismiss/done state (see §7).

---

## 5. Prioritization model

Items are scored and sorted into sections, not a flat list. Order within a section is by score descending.

**Scoring factors:**

1. **Time-sensitivity (largest weight)** — Payment failed today = 100. Anniversary in 5 days = 30. Lapsed donor 8 months ago = 10.
2. **Revenue impact** — Sponsor at $100/mo at risk weighs more than $25/mo at risk.
3. **Recency of trigger** — Just happened > long overdue. Better to grab the moment than chase backlogs.
4. **Effort already in play** — Simon submitted his pick this morning → high (don't waste his momentum). A lapsed donor from 9 months ago → lower (less likely to recover).
5. **User effort to handle** — One-click items rank higher than multi-step within the same urgency band, so the morning ritual feels productive.

**Sections (top to bottom):**

1. **URGENT** (red accent) — Payment failed, active cancellation, orders stuck >2 weeks. Anything where lost revenue or angry sponsors are imminent.
2. **QUICK WINS** (gold accent) — Anniversaries, SOTM approvals, today's shipping batch, Simon's pending review. Items that take <60 seconds.
3. **RELATIONSHIPS** (cream) — Lapsed sponsors, lapsed donors, milestone outreach. Slower items but compound long-term.
4. **NUMBERS footer** (gray) — Quick stats for context. Not actionable, just orientation.

A separate flag: items get a small "since X days" indicator so the visual hierarchy makes the freshest items obvious.

---

## 6. Actions

Each item has up to three buttons. Primary is bolded; secondaries are smaller.

### Primary action vocabulary

| Verb | What happens |
|---|---|
| **Open profile** | Jumps to that donor/sponsor's profile page (see §7) — the main pattern for relationship items |
| **Approve** | One-click write to Airtable (e.g. SOTM approval) |
| **Ship now** | Jumps to fulfillment queue, filtered to that order |
| **Open** | Jumps to the relevant editor / detail page (kid editor, newsletter, etc.) |
| **See list** | Expands the row into a sub-list (e.g. "the 2 lapsed sponsors are: …"), each row clicks through to that person's profile |

No Gmail integration. Kevin composes personal emails in his own Gmail — that's his craft and pre-filled templates would water it down. The system's job is to surface *who* to write to and give him *every piece of context* in one place, then get out of the way. When he's done composing, he comes back and clicks "Mark contacted" on the profile.

### Secondary actions (every item)

- **Done (✓)** — User says "I handled this." Removes from today's view, logs the action in `TodayActions`.
- **Snooze (↓)** — Reschedule. Default options: 1 day, 3 days, 1 week, 2 weeks. Item returns to top of list at the chosen time.
- **Dismiss (✕)** — "This signal is wrong / not actionable for this entity ever." Different from done. Stops the same signal from firing on the same person for a long period (e.g. 90 days).

---

## 7. Donor profile pages

The drill-down companion to the Today view. When an item says "Sarah hit 6 months with Marvin," clicking it lands you on `/admin/donor/[donorId]` — one screen with every piece of context about Sarah so you can write something personal without flipping between Airtable, Stripe, and your inbox.

### Why this matters (and why it lives with Today)

A donor profile by itself is a database lookup. Useful but rarely visited unless you happen to remember to. Pair it with the Today view's curated list of "you should look at Sarah right now" and it becomes the natural second click: every relationship action funnels through here.

Building both at once also means the Today items can be lean — they don't need to inline gift history, drip stage, or notes, because they're one click away.

### Page sections

```
┌────────────────────────────────────────────────────────────┐
│ ← back to Today                                            │
│                                                            │
│ SARAH CONNORS                                              │
│ sarah@example.com · 555-1212                               │
│ Brooklyn, NY                                               │
│ Donor since Nov 2025 · Recurring supporter                 │
│                                                            │
│ ┌──── stats ──────────────────────────────────────────┐    │
│ │  $300 lifetime   |  $25/mo current  |  6 months in │    │
│ └─────────────────────────────────────────────────────┘    │
│                                                            │
│ SPONSORING                                                 │
│ [photo] Marvin Rwotomiya · #1 · since Nov 2025             │
│         → /1                                               │
│                                                            │
│ TIMELINE                                                   │
│   May 12   $25 sponsorship payment                         │
│   Apr 12   $25 sponsorship payment                         │
│   Mar 12   $25 sponsorship payment                         │
│   Feb 12   $25 sponsorship payment                         │
│   Jan 12   $25 sponsorship payment                         │
│   Dec 12   $25 sponsorship payment                         │
│   Nov 28   Newsletter sent · December update               │
│   Nov 24   Sponsored Marvin (started subscription)         │
│   Nov 24   Shirt order #18 · Onyx M · shipped Dec 1        │
│   Nov 18   Bought shirt · $34                              │
│                                                            │
│ DRIP STATUS                                                │
│ sponsor_onboard · stage 4 of 5 · next send Jun 12         │
│ [pause drip]   [end drip]                                  │
│                                                            │
│ LAST CONTACT                                               │
│ Apr 28 · Anniversary email (logged by Kevin)               │
│ Feb 5 · Replied to her question about the trip            │
│                                                            │
│ NOTES                                                      │
│ ┌──────────────────────────────────────────────────────┐  │
│ │ Met at the Hoboken event in Oct. Her sister works at │  │
│ │ a school in Queens — interested in partnering some   │  │
│ │ day. Cousin Alex bought shirt too (#34).             │  │
│ │                                                      │  │
│ │ [save notes]                                         │  │
│ └──────────────────────────────────────────────────────┘  │
│                                                            │
│ [Mark contacted]   [Add interaction]                       │
└────────────────────────────────────────────────────────────┘
```

### Section breakdown

**Header.** Name, email, phone, mailing address, donor-since date, recurring-supporter flag, organization (if any). All pulled from the `Donors` table.

**Stats strip.** Three or four numbers — lifetime giving, current monthly amount, months as a sponsor, retention status. Quick orientation.

**Sponsoring.** Cards for each kid this donor sponsors. Photo + name + shirt # + start date. Each clicks through to that kid's editor (`/admin/roster/<n>`) and to the public profile (`/<n>`). Most sponsors have one kid; some have multiple.

**Timeline.** Reverse-chronological unified feed of every recorded event for this donor: donations, sponsorships starting/ending, shirts ordered + shipped, newsletters sent to them, interactions Kevin logged. Pulls from `Donations`, `Sponsorships`, `Fulfillment`, `Communications`, and the new `Interactions` log (see below).

**Drip status.** Which pipeline they're in (`sponsor_onboard`, `shirt_nurture`, etc.), what stage, when the next email fires. Two actions: pause the drip (good for "I'm hand-holding this one") or end it (good for "they've converted, stop nagging them"). Both flip fields on the `Donors` table that the cron already respects.

**Last contact.** Top of the interactions list. Shows the most recent recorded interaction (system-generated or Kevin-logged) so you know how long it's been since you actually said something.

**Notes.** Free-form multiline text. Saved to a new `Notes` field on the `Donors` table (or the existing `Notes` field if it's already there — it is, on the Donors table per the schema). Kevin uses this for personal context: how he met them, their kids' names, what they care about, anniversaries, things they've mentioned.

**Action footer.**
- **Mark contacted** — logs an `Interaction` (type: outbound, channel: email/phone/text, optional note). Resolves any open Today items that were waiting on outreach to this donor.
- **Add interaction** — for inbound or undirected contact ("she replied," "I called her," "she came to the event"). Same model.

### New data — `Interactions` table

A small log Kevin can build over time without it becoming a chore.

| Field | Type | Notes |
|---|---|---|
| InteractionID | autonumber | PK |
| Donor | linked record → Donors | required |
| Sponsorship | linked record → Sponsorships | optional, when relevant |
| Direction | singleSelect | outbound / inbound |
| Channel | singleSelect | email / phone / text / event / other |
| Subject | singleLineText | one-line summary |
| Notes | multilineText | optional details |
| At | dateTime | when it happened (defaults to now) |
| LoggedBy | singleLineText | "Kevin" for now; future-proofing |
| RelatedTodayItem | singleLineText | optional ItemSignature this resolved |

Most interactions get logged with one click via "Mark contacted" — Kevin doesn't need to fill anything out. Heavier logging via "Add interaction" when he wants to attach a note.

The timeline on the profile reads from this table alongside the existing transactional sources (Donations, Sponsorships, Fulfillment).

### Sponsor vs donor

In the existing schema, every sponsor IS a donor (Sponsorships link back to Donors). We standardize on the donor as the canonical entity. The profile page is at `/admin/donor/<id>` and works for any donor whether they sponsor a kid or just gave once.

When the Today view surfaces a "sponsor" item, the link resolves the Sponsorship → Donor and lands on the donor profile.

### What lives elsewhere

- The **sponsor portal** (`/portal/...`) is the public-facing side and unchanged. Donor profile pages are admin-only.
- The **kid editor** (`/admin/roster/<n>`) is unchanged. Sponsoring cards on the donor profile link out to it.

---

## 8. State management — done / snooze / dismiss

Today actions live in a new Airtable table `TodayActions`:

| Field | Type | Purpose |
|---|---|---|
| ActionID | autonumber / formula | PK |
| ItemSignature | singleLineText | Stable hash of `(itemType, entityId, monthYear)` so the same signal across days isn't duplicated |
| ItemType | singleSelect | new_sponsor / anniversary / etc. |
| EntityRecordId | singleLineText | The Airtable record this is about (Sponsorship, Donor, Child, Order) |
| Status | singleSelect | open / done / snoozed / dismissed |
| SnoozeUntil | dateTime | When a snoozed item returns |
| HandledAt | dateTime | When done/dismissed was clicked |
| Notes | multilineText | Optional Kevin notes (later phase) |

When the Today view loads, it:
1. Computes the current set of items from signal sources.
2. Joins each computed item against `TodayActions` by ItemSignature.
3. Filters out items that are `done` or `dismissed`. Filters out `snoozed` until `SnoozeUntil` ≤ now.
4. Renders the rest, sorted by score.

This means handled items disappear, snoozed items respect the date, and dismissed items don't come back (for the same person + month window).

---

## 9. Visual structure

**Desktop:**
```
╔══════════════════════════════════════════════════════════╗
║  TODAY · FRIDAY MAY 29                       [refresh]   ║
║  Good morning, Kevin. 6 items waiting.                   ║
╠══════════════════════════════════════════════════════════╣
║  URGENT                                                  ║
║  ┌────────────────────────────────────────────────────┐  ║
║  │ ⚠  Order #134 stuck 9 days                         │  ║
║  │    [Ship now]  [Why?]              [✓] [snooze ↓] │  ║
║  └────────────────────────────────────────────────────┘  ║
║                                                          ║
║  QUICK WINS                                              ║
║  ┌────────────────────────────────────────────────────┐  ║
║  │ [photo] Sarah · 6mo with Marvin tomorrow           │  ║
║  │         [Open profile]             [✓] [snooze ↓]  │  ║
║  └────────────────────────────────────────────────────┘  ║
║  ┌────────────────────────────────────────────────────┐  ║
║  │ [photo] Approve Simon's SOTM pick (Aaron)          │  ║
║  │         [Approve]  [See kid]       [✓] [snooze ↓]  │  ║
║  └────────────────────────────────────────────────────┘  ║
║                                                          ║
║  RELATIONSHIPS                                           ║
║  ┌────────────────────────────────────────────────────┐  ║
║  │ ✦ 2 sponsors cancelled in May                      │  ║
║  │   [See list]                       [snooze ↓]     │  ║
║  └────────────────────────────────────────────────────┘  ║
║                                                          ║
║  ─────────────────────────────────────────────────────── ║
║  52 active sponsors · $1,300/mo · 47 profiles complete  ║
╚══════════════════════════════════════════════════════════╝
```

**Mobile:** single column, items full-width, big tap targets on the primary action, secondary actions in a small overflow menu (⋯).

**Empty state:** when nothing's urgent and nothing's quick-win: `Nothing waiting. Take a walk. ☕` — and surface the relationship / numbers sections only.

---

## 10. What's IN scope vs OUT (v1)

### In v1 (build first)

- Item generators for six categories: new sponsor, anniversary, lapsed sponsor, orders ready/stuck, SOTM pending, monthly update due
- The Today screen itself with the three sections + footer
- `TodayActions` table + done/snooze/dismiss persistence
- **Donor profile pages** at `/admin/donor/<id>` (the drill-down for every relationship item)
- **`Interactions` table** + "Mark contacted" / "Add interaction" logging
- Empty state
- Replace existing `/admin` home with the Today view (the current card layout moves to `/admin/dashboard` or gets deleted)

### Explicitly OUT of v1

- Any kind of Gmail integration. Kevin writes his emails himself; the system surfaces who and gives him context.
- Read-side email sync (inbox, threading, observing sends)
- Real-time push notifications / desktop alerts
- Mobile push
- Multi-user assignment ("Simon should handle this")
- Inline email composer
- Page-view tracking on `/[number]` to drive shirt-buyer no-visit items (Phase 2 — needs lightweight analytics)
- Streak / habit visualization
- A/B testing email templates

### Phase 2 (after v1 settles into use)

- Shirt-buyer behavioral nudges with real visit tracking on `/[number]`
- Newsletter open/click signals via SendGrid event webhooks
- Bulk actions: select multiple Today items, mark all as contacted at once
- Daily morning digest email at 6am summarizing what's waiting
- Search across all donors / sponsors (so Kevin can pull up a profile without going through Today)
- Donor profile filtering / sorting views ("show me all sponsors at risk")
- Light CRM features on the profile (custom tags, follow-up reminders set from the profile itself)

---

## 11. Decisions (locked)

Kevin's calls on the open questions, May 29 2026. Defaults Claude picked are noted where Kevin said "whatever you think."

1. **Daily ritual: morning.** Empty state treats finishing as a daily accomplishment ("All clear. Take a walk. ☕"). Ranking is computed fresh on each page load; no live re-rank during the day.
2. **Churn focus: both, cancellation ranked higher.** *(Claude's call — Kevin: "whatever you think.")* Active cancellation lands in URGENT; lapsed-engagement signals (no portal login in 60+ days for active sponsors, no donation in 6+ months for one-time donors) land in RELATIONSHIPS. Cancellation is rare-but-urgent; lapse is fuzzy-but-compounds.
3. **Anniversaries fire morning-of, with one day of grace.** Item shows up on the actual anniversary morning, stays through the following day so missing a day doesn't drop it.
4. **"Mark contacted" is one click and assumes email.** No channel prompts on the default action. For phone / text / event interactions, use **Add interaction** to log explicitly. Optimizes for the 90%+ case.
5. **Snooze defaults:** 3 days for relationship items, 1 week for operational items. Both adjustable via dropdown (1d / 3d / 1wk / 2wk).
6. **Donor timeline includes:** donations, sponsorships started/ended, shirt orders + shipments, newsletters sent to them, Kevin's logged interactions. Phase 2 adds: Stripe refunds/disputes, address changes, drip-email sends (currently just stage transitions are observable).
7. **Donor profile linkable from everywhere relevant.** Entry points in v1: each Today item, sponsor name on the fulfillment queue, sponsor name on the sponsors list, donor name in the dashboard. Future: from the sponsor portal admin view.

---

## 12. Success metric

The Today view is working when:

- You open it daily as a reflex, not because you forced yourself to.
- 80%+ of items get a primary action click (rather than getting snoozed or ignored).
- Anniversary emails go out within 24 hours of the milestone (not 2 weeks later).
- Stuck orders resolve within 3 days of appearing.
- You stop opening `/admin/fulfillment`, `/admin/sponsors`, `/admin/newsletter` separately because everything important is already surfaced here.

---

## 13. Recommended build sequence

1. **Build the donor profile page first.** Without this, the Today view's primary action (Open profile) has nowhere to go. Wire `/admin/donor/<id>` with header, stats, sponsoring cards, timeline (transactional only at first — donations, sponsorships, shirts, newsletters), notes, and link-out to kid editors. Add `Interactions` table + "Mark contacted" / "Add interaction" actions. Layer the interaction events into the timeline.
2. **Wire the Today view page shell.** `/admin` becomes the Today view. Old card layout → `/admin/dashboard` (keep as fallback) or delete. Empty state renders for first run.
3. **Add `TodayActions` table + state read/write.** Without this, items can't be marked done. Confirm done / snooze / dismiss persist across page loads.
4. **Generators, one at a time, in priority order:**
   a. SOTM pending approval (already have all the data)
   b. Simon edits to review (already have all the data)
   c. Orders ready / stuck (already have all the data)
   d. Anniversary (compute from SponsorshipStartDate)
   e. Cancellation (read from Sponsorships.Status + Stripe webhook log)
   f. Monthly update due (read from Newsletters)
5. **Scoring + section sort.** Once 4+ generators exist, the ranking starts to matter. Tune.
6. **Polish.** Empty state copy, mobile layout, animations on done / snooze. Once you're using it daily.

Estimated time to v1: ~2–3 evenings of focused build. The donor profile is most of it; the Today view itself is mostly composition of existing queries.
