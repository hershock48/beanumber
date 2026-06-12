# BAN core model — READ ME BEFORE TOUCHING ANYTHING SHIRT- OR SPONSOR-RELATED

> Kevin has corrected me on this multiple times. Open this file first when anything touches shirts, sponsorships, the cycle, or the roster. The model is not standard child sponsorship.

---

## The four load-bearing facts

### 0a. Vocabulary: Owners, Sponsors, Holders

Three terms that get conflated. The distinction matters because two of them are real categories in the system and one is a behavior, not a category.

- **Owner** — anyone with a Sponsorship row tied to a specific number. The row's `Children` link tells the system which kid that number currently maps to. Owners come from two paths: (a) cart+monthly buyers (auto-created at checkout, Status=Active); (b) shirt-only buyers / gift recipients / found-shirt wearers (created when they CLAIM the number via `/api/sponsor/recover/send-link`, Status=Holder).
- **Sponsor** — an Owner who pays $25/mo. Their Sponsorship row has Status=Active, MonthlyAmount=25, and a `sub_…` populated. Every Sponsor is an Owner.
- **Holder** — an Owner who does not pay monthly. Status=Holder, MonthlyAmount=0, no Stripe sub. The shirt is theirs, the number is theirs, the kid is theirs in the relationship sense, but they're not on the recurring billing side.

A Holder can become a Sponsor (status flip + sub created — same row, history preserved). A Sponsor who cancels recurring becomes a Holder (status flip, no row deletion). The pick history, kid relationship, and chooser state all survive both transitions.

"Looking up a number" is a behavior, NOT a category. Kevin can browse every kid page in the roster without ever being recorded as the owner of any of them. Ownership is only created by purchase (auto-Active) or by claim (Holder). Browsing leaves no trace.

### How owners claim their number

A first-time visitor with a shirt whose number was assigned but who has no Sponsorship row yet does this:
1. Visits `/[their number]`. Sees the kid. Sees a "Is this your number? Claim it or sign in" CTA.
2. Enters their email. The `/api/sponsor/recover/send-link` endpoint figures out which case applies:
   - **Existing Sponsorship for this email + child** → send magic-link recovery (sign-in).
   - **No Sponsorship for this child at all** → create Holder row, send magic link.
   - **Sponsorship exists for this child from a DIFFERENT email** → privacy-success response, log for admin review (someone else already owns the number).
3. They click the magic link. The callback drops the `sponsor_session` cookie. They're now signed in as the owner.
4. From this moment, every visit to /[their number] is authenticated. They see the kid newsletter, the sponsor-only updates (if any), and — if their kid ever departs — they get the chooser + split-flap reveal.

### Why this matters operationally

- **Multi-shirt orders work right.** Chad buys 4 shirts and gives 3 away. Chad claims his own number. Each buddy claims theirs. The system tracks 4 separate Owners, not "Chad owns all 4." Payment record is independent from ownership.
- **No fulfillment-step bookkeeping by Kevin.** Ownership crystallizes when the wearer comes to the site and types their email, not when Kevin marks a shirt number in `/admin/fulfillment`.
- **Departures fan out to all owners.** When a kid departs and you click "Stage candidate cards" in admin, the system stages the chooser on every Sponsorship linked to that kid — Active sponsors AND Holders. AND it fires an auto-login email to each one with a one-tap link straight into their chooser. Departures become re-engagement moments, not dead ends.

### 0b. Every sponsorship traces back to a Number.

**The Number is the user's identity in the system.** Buying a Shirt creates a Number. Claiming that Number (email + magic link + cookie) makes it the user's account. Every sponsorship the user ever holds — their original kid and any kids they add later through discovery — attaches to that Number via the same `SponsorEmail`. `/[N]` is the dashboard. The YourKidsStrip is the persistent family of relationships.

This rule replaced the earlier "user-driven discovery sponsorship is a permitted parallel path" framing (June 12, 2026). That framing produced orphan Sponsorship rows for cold-direct sponsors who never claimed a Number, and it made the page architecture wobble — `/sponsorship` → `/campus` → gated `/campus` → "what is this page even for." The new rule is simpler: no Number, no sponsorship. The Shirt is the gateway and the Number is the identity, period.

#### The path

1. Buy a Shirt at `/shirts`. The Shirt ships with a Number printed on the back.
2. Enter the Number on the homepage. Claim it (email + magic link). The cookie is the session, the Number is the identity, `/[N]` is the dashboard.
3. From `/[N]`, scroll to "Other kids at the campus" to discover more kids. Tap a face → `/meet/[recordId]`.
4. The kid's `/meet/[recordId]` page shows a "Sponsor [name]" button **only if the viewer is signed in**. The new sponsorship attaches to the same `SponsorEmail`, lands as a new Sponsorship row with the `Children` link set, and shows up in the YourKidsStrip on the next render.
5. Repeat for every kid the user wants to be in relationship with.

#### What's banned

- Pre-matching buyers to children at the moment of Shirt purchase. The buyer does not choose a kid at checkout, Kevin does not assign one, the system does not create a per-buyer kid pairing. The buyer doesn't know what Number they'll get until the Shirt ships. Kevin doesn't know either — it's whatever's next in the open batch. The "kid" associated with the Number is whatever cycle math returns at display time.
- Sponsorship without a Number. The `/meet/[recordId]` Sponsor button is gated on the `sponsor_session` cookie. Cold visitors hitting that page see a "Get a Shirt to meet your kid" CTA → `/shirts`, with a secondary "Already have a Number?" link → `/`. The `/api/create-sponsor-checkout` endpoint enforces this server-side too: requests without a session (or without the §2 one-tap context handed across from a fresh shirt purchase) are rejected with `{ error, redirect: '/shirts' }` and 401. No orphan Sponsorships, ever.
- A public "browse all the kids" directory. `/campus` is sign-in gated and removed from the public nav (June 12, 2026) because a public roster a buyer can scout before purchase undermines the number-reveal mechanic and reads as a conventional sponsorship-org directory we deliberately aren't. Per-kid `/meet/[recordId]` pages remain public and individually shareable; the collection is what we hide.

#### What's allowed: discovery from inside the dashboard

A signed-in sponsor explores from their `/[N]` page (or directly from `/campus`, the signed-in browse surface). They discover a kid whose story moves them. They tap "Sponsor [name]" on `/meet/[recordId]`. A new Sponsorship row is created with `Children` link set to that kid and `SponsorEmail` tied to their Number. It shows up in the YourKidsStrip.

**Mary's path** (the canonical example, still works under the new rule): Mary bought a Shirt, got #N, entered #N on the homepage, met the cycle-assigned kid, sponsored that kid (the `/[N]` Sponsor button). She later explored "Other kids at the campus," found someone else who moved her, clicked through to `/meet/[id]`, and added a second sponsorship via `MeetSponsorButton` — *while signed in*. Two Sponsorship rows, both kid-linked, both attached to her Number.

The old §0b mentioned a "cold visitor path" where a no-Shirt visitor browsed `/sponsorship` and sponsored directly. **That path is no longer supported.** A cold visitor on `/meet/[id]` gets routed to `/shirts` to get a Number first.

#### The data summary

- Shirt purchased without monthly opt-in → no Sponsorship row created (Holder created later if the buyer claims).
- Shirt + monthly purchased together → Sponsorship row created at checkout, Status=Active, `Children` link blank (the kid is determined by cycle math at display time).
- Sponsorship row created via `MeetSponsorButton` on `/meet/[id]` (signed-in only) or via the `/[N]` Sponsor button → `Children` link set to the kid the user explicitly walked into, `SponsorEmail` tied to the signed-in user's Number.

The kid card displayed on `/[number]` is derived from cycle math against the Shirt Number, NOT from the Sponsorship's `Children` link. The `Children` link tells us which specific kids the sponsor chose to be related to; cycle math tells us which kid each Number maps to on the wall.

**Code consequences:**
- The shirt-checkout path creates a Sponsorship at purchase with empty `Children`. Don't gate that creation on "we don't know the kid yet" — there is no kid to know; cycle math handles it at display time.
- The `/meet/[id]` Sponsor button and `/api/create-sponsor-checkout` endpoint both require a signed-in user. UI gate + API gate (defense in depth).
- The §2 one-tap conversion path (fresh Shirt buyer, has `existingCustomerId` + `buyerEmail`) is permitted without a `sponsor_session` cookie — that buyer is in the process of becoming a signed-in user and the API recognizes the handoff.

### 1. Pool funding, not per-kid budgets

All sponsorship dollars go into one pool that funds the entire campus (and eventually multiple partner campuses). A specific sponsor is *assigned to* a specific kid as a relationship and a face — not as that kid's funder. The kid the sponsor sees is who they get letters from, who they sponsor on paper, who their photos belong to. The money is fungible across the whole roster.

**Practical implications for the code:**
- "How many sponsors does kid X have" is not a useful metric. Don't put per-kid sponsor counts in admin UI. Don't gate features on it. Don't build dashboards that surface it as a primary stat. It's not how Kevin runs the org.
- It's fine for **multiple sponsors to be assigned to the same kid**. The pool model means this isn't a collision — it's the default. (This is why the reassignment chooser doesn't filter out kids who already have a sponsor.)
- "Average $/kid" math is misleading and Kevin doesn't want to see it.

### 2. Numbers cycle through kids — every kid is the face of many shirt numbers

There are X kids in the roster. Shirts are sold with numbers higher than X. **The numbers cycle.** If the roster has 50 kids and we sell 150 shirts, each kid is the face of 3 shirts.

**A kid does not have "a" shirt number.** A kid has a *position* in the roster. From that position, the cycle math determines every shirt number they're the face of across every batch.

The legacy `ShirtNumber` field on Children is a historical artifact — it was the kid's "primary" number under the old assumption that each kid had one. Under the batch model below, that field is just one of many numbers a kid covers, and not even necessarily the "main" one.

### 3. Partner orgs join the same roster, not a parallel one

When a new partner org joins (Simon's YDO is the first; others may follow), their kids get appended to the same flat roster. There is one cycle, one set of shirts, one pool. A buyer of shirt #X doesn't know or care which org their assigned kid is from.

---

## The batch model

The cycle is not a single global function. It runs inside **batches**.

### What a batch is

A batch is a defined block of shirt numbers tied to a *locked snapshot* of the roster at the moment the batch is opened.

| Field | Meaning |
|---|---|
| `StartShirtNumber` | First shirt # in this batch (inclusive) |
| `EndShirtNumber` | Last shirt # in this batch (inclusive) |
| `RosterSnapshot` | The ordered list of kid record IDs as of batch open. Locked. |
| `Status` | Planned / Active / Closed |

### The cycle math (inside a batch)

```
shirt #N → batch B where B.start ≤ N ≤ B.end
       → position p = (N - B.start) mod B.snapshot.length
       → kid = B.snapshot[p]
```

That's it. No "era 1 / era 2" special cases. The math is the same for every batch.

### The lock rule (the critical invariant)

**A batch's roster snapshot is captured at the batch's open moment. Kids added mid-batch wait for the next batch.**

Example Kevin walked through:
- Batch 2a: 50 kids on roster. We open the batch covering shirts #151–200.
- During Batch 2a, Simon adds 3 new kids. They land in the Children table (queue), but **they do not enter Batch 2a's snapshot**.
- When Batch 2a closes at #200, Kevin opens Batch 3: 53 kids (original 50 + Simon's 3), shirts #201–253.

This lock is what makes the per-shirt-#→kid mapping permanent for any shirt that's been sold. The kid you're assigned to when you buy shirt #X never changes after the batch is opened.

### Closing and opening batches

- **Batches open manually.** Kevin decides "we're printing another N shirts" and opens a new batch in `/admin/batches`. He picks how many cycles (and therefore how many shirts) the batch covers.
- **Batches close manually** (or implicitly when the next batch opens at end+1). The auto-suggestion in the admin should be "next batch starts at (last batch's end + 1)."
- Snapshots are immutable once captured. There is no "edit a batch" — there's only "open a new one" and "fix the previous one with explicit migration if something's wrong."

### Historical batches (frozen)

The old `/children/[number]/page.tsx` cycle code is being replaced. But the assignments it computed for already-sold shirts must be preserved. We translate the old hardcoded math into seeded Batches table rows:

| Batch | Range | Snapshot | Cycle math (verified) |
|---|---|---|---|
| Batch 1 | #1–53 | Kids in canonical position 1–53 | `(N-1) mod 53` |
| Batch 2 | #54–150 | Kids in canonical position 2–53 (52 kids; #1 / Naume excluded) | `(N-54) mod 52` |

(Batch 2 covers ~1.87 cycles of a 52-kid snapshot. That's fine — `mod` handles partial cycles cleanly.)

Anything sold after #150 going forward gets new batches defined explicitly with their own snapshots.

---

## Per-kid number footprint

To answer Kevin's question "what shirt numbers is kid X the face of":

```
for each batch B in Batches:
  for each position p in B.snapshot:
    if B.snapshot[p] == kid X:
      for k in 0..floor((B.end - B.start) / B.snapshot.length):
        shirt_number = B.start + p + (k * B.snapshot.length)
        if shirt_number <= B.end:
          emit(shirt_number)
```

This gives every shirt number across every batch that resolves to kid X. The admin roster card surfaces this as "Numbers: #38, #99, #151, …" — that's the answer to "what numbers does Emmanuel have."

---

## How kid additions and departures flow

### Adding a kid (Simon-side or Kevin-side)

1. Simon (or Kevin) creates a Children record via the existing `+ Add new kid` tile on `/admin/roster`.
2. Kid joins the roster but **has no shirt number yet**. They sit in the queue.
3. When Kevin next opens a batch in `/admin/batches`, the new kid's record ID is included in the snapshot — at the END of the snapshot order (oldest kids first; new kids last). That ordering determines which shirt #s they cover.
4. From batch open onward, that kid is the face of their position in the snapshot.

### Departing a kid

1. Simon nominates / Kevin approves departure via the existing flow.
2. The kid stays in any historical batches they're in. Past shirts sold pointing at them keep pointing at them.
3. The kid is **excluded** from future batch snapshots. Departed kids don't get added to new batches.
4. Active sponsorships on the departed kid go through the existing reassignment chooser (3-card pick) to land on a new kid in the active roster.

### Reassignment

Already built. Doesn't change under the batch model — sponsorships are locked to specific kid records via the Sponsorship.Children link, so once a sponsor is reassigned to a new kid, they stay with that kid regardless of any batch math.

---

## Things I should not do

- **Don't show per-kid sponsor counts in admin UI** as a primary surface. Pool model means it's not the question Kevin asks.
- **Don't reach for the hardcoded `canonicalShirtNumber(n)` function for new code.** Use the cycle resolver that reads from Batches.
- **Don't write to a kid's `ShirtNumber` field as if it's "their" number.** It's legacy / cosmetic. The source of truth is their position in the batch snapshots.
- **Don't propose merging the cycle math into a single global function.** Each batch is independent.
- **Don't try to "extend" Batch 2 by adding kids to its snapshot.** Snapshots are locked. Open a new batch.

---

## Open work tracked here

- Build the `Batches` Airtable table.
- Seed it with Batch 1 (#1–53) and Batch 2 (#54–150) from the legacy math.
- New cycle resolver in `src/lib/cycle.ts` that reads from Batches and replaces `canonicalShirtNumber()`.
- Rewire `/children/[number]/page.tsx` to use the new resolver.
- Admin surface at `/admin/batches` — list batches, open new ones, show per-kid number footprint.
- Show each kid's footprint on the roster card and editor (replaces the single ShirtNumber display).
