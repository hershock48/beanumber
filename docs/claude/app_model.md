# App Model — future direction

**Status: not built. Design captured 2026-07-06.**

This document captures the direction Be A Number is heading toward once we outgrow the pure web model. It's not a build spec and it's not committed — it's the shared understanding from Kevin's conversation on 2026-07-06, so we don't have to re-derive it every time we come back to the question.

If we ever start building against this, the doc gets promoted to a full spec with real DB schemas, endpoint contracts, and phased deliverables. Until then, this is the north star.

---

## Why an app (eventually)

The reveal moment is BAN's most distinctive experience. Everything the site does today — the shirt-first purchase, the number-to-name reveal, the ongoing kid relationship, the letters, the drip pipeline — is designed to create parasocial retention. The web version works, but it has ceilings:

- Email deliverability risk on every magic-link step.
- No push notifications strong enough to compete with app-native push (kid wrote back, kid has an update, kid earned SOTM).
- Cross-device continuity broken by cookies.
- Identity mismatch when someone uses a different email at signup vs. checkout.
- No home-screen icon → no habit-forming brand presence.

Fahlo (myfahlo.com — animal tracking bracelets) is the closest proven-model comparable. Same shape as BAN: physical product → proprietary reveal → ongoing story → parasocial retention. They forced everyone through an app from day one. Their model works. That's the north star.

Kevin's judgment: the web takes us to 500-ish sponsors comfortably. Above that, the ceiling starts hurting. The app is inevitable, but the timing is a function of sponsor count, not calendar date. Staged path: PWA + push first, then native when data justifies it.

## The core primitive: the number is a bearer instrument

Everything downstream falls out of this one insight.

The shirt with a number on it is a physical bearer instrument for a sponsorship. Whoever ends up holding the shirt AND scans the QR becomes the sponsor of record for that kid. The buyer paid, but the sponsor of record is whoever activated it.

This maps to how gift cards work in retail. The gift card is worth $50 regardless of who paid for it. Whoever redeems it gets the $50. You don't have to know at purchase time who the recipient will be. The physical object carries the value; the redemption event assigns it.

That framing solves the gift-giving problem by treating gifts as the default case instead of the exception. Everything else in this doc follows from it.

## Account model — buyer accounts and sponsor accounts

Once the number is a bearer instrument, the "who" question splits in two:

- **Buyer account** — the person whose card is on file. They have a purchase history, subscriptions, billing info. They may or may not be a sponsor themselves. They can buy for anyone.
- **Sponsor account** — the person who activated a sponsorship by scanning a QR. They have the relationship: reveal moment, kid's page, letters, updates, correspondence, personal photo updates.

Same person if it's a personal purchase (Lucy buys for Lucy, Lucy scans, Lucy is both buyer and sponsor). Different people if it's a gift (Lucy buys, Maya scans, Lucy is the buyer, Maya is the sponsor).

Same infrastructure — just two roles the same person or two different people can occupy. In the app, both roles get their own home base:

- **Buyer home**: purchase history, subscriptions I'm paying for, "sponsorships I'm funding" (with the recipient's opt-in), billing management. Small surface, mostly settings-shaped.
- **Sponsor home**: the current /me — kids, correspondence, updates, campus feed. The rich retention surface.

Nothing forces you to be one or the other. Lucy can be a sponsor AND a buyer AND funder-of-Maya's-sponsorship all at once.

## Purchase → fulfillment → activation

Three stages, three roles.

### 1. Purchase (buyer)

Buyer places order on the website (later the app). Order captures:

- Payment method (buyer's card)
- Shirt config (size, color)
- Whether monthly subscription is included
- Buyer's account (or a fresh account created at checkout)

Order is created in "unbound" state. No shirt-number is assigned yet at the DB level. The physical shirts sit on the shelf with pre-printed numbers, agnostic to which order will claim them.

### 2. Fulfillment (Kevin)

Kevin's fulfillment tool (small internal admin page, phone-friendly) shows unshipped orders. For each:

- Kevin pulls a shirt off the shelf matching the buyer's size/color.
- Kevin scans the shirt's QR (or types its number) into the fulfillment page.
- Server writes the binding: this shirt's number is now bound to this order (subscription id + buyer info).
- Shirt is marked as shipped.

For retail shirts: no online order to bind to. Shirts on retail shelves are just unbound. When a retail buyer scans, no binding exists and they hit the walk-up flow.

### 3. Activation (scanner)

Recipient scans the QR. Flow:

1. Camera opens URL → routes to app (installs app first if not present, via App Store).
2. App reads QR token → server call: "is this shirt bound to a pending order?"
3. Server checks:
   - **Yes, bound**: identify the pending subscription. Prompt the scanner to sign in (Apple/Google) or create an account. Attach the subscription to the new sponsor account. Reveal fires. Full sponsor experience.
   - **No, unbound (retail)**: walk-up flow. Scanner creates account. Reveal fires (they get the kid). At end, prompted to add monthly for $25/mo. Their choice.

The scanner IS the sponsor. Whoever scans first activates it. If Lucy scans, Lucy is the sponsor and Lucy's Stripe customer becomes the payer of record. If Maya scans (because Lucy gave it as a gift), Maya is the sponsor and Lucy is still the payer (per the original binding).

Once activated, the binding is consumed — the shirt can't be re-activated by someone else.

## Billing model

Buyer pays. Sponsor sponsors. Same person by default; separate by design when the shirt is gifted.

**When buyer and sponsor are the same person** (personal purchase, scanner is buyer):
- Lucy paid. Lucy scanned. Lucy is the sponsor and the payer. Simple.

**When buyer and sponsor differ** (gift):
- Lucy paid. Maya scanned. Maya is the sponsor of record. Lucy's card is on file for the subscription.
- Lucy sees in her buyer home: "You're covering Maya's sponsorship of [Kid Name]."
- Maya sees in her sponsor home: the full sponsor experience for that kid.
- Lucy can cancel her subscription anytime, which drops Maya to Holder status.
- Lucy can transfer billing to Maya via a "make this self-funded" flow — Maya adds her own card, Lucy's charges for that shirt stop, subscription continues under Maya's card.

**Corporate / bulk case:**
- Company X buys 100 shirts + 100 monthly at a fundraiser. Their card is billed for 100 subscriptions total.
- Recipients each scan and become individual sponsors. Same product, same infrastructure — the difference is just "the buyer bought a lot."
- Company X sees "You're funding 100 sponsorships" in their buyer home.
- Their annual giving statement is one line: 100 × 12 × $25 = $30,000.
- Any recipient can convert to self-funded to relieve Company X of that individual subscription line.

## Retail vs. online — one QR, two paths

Both use the same physical shirt with the same QR encoding just the shirt number. The difference is the fulfillment binding.

**Online path:**
1. Order → Kevin binds shirt #48 to Lucy's order at fulfillment → mails it → recipient scans → binding activates → sponsor created with pre-attached subscription.

**Retail path:**
1. Shirt sits on a retail partner's shelf → no binding → buyer buys the physical shirt → scans → no binding found → walk-up flow → creates account, meets kid, offered monthly conversion.

Neither path requires a special "retail QR" or "gift QR." The QR is inert until the DB decides what it means. That's the whole point of "bearer instrument" — the meaning is assigned at fulfillment (for online) or left blank (for retail), and the activation event resolves it.

Retail shirts naturally start as walk-up buyers. If they convert to monthly at reveal, they become full sponsors. If not, they're Holders with the kid page access their tier allows.

## Preventing subscription abuse

The bearer-instrument model creates a theoretical abuse vector: Lucy buys 100 shirts + monthly, hands them all out, cancels her subscription the next day. Now 100 people have monthly-status sponsorships with no funding.

Mitigations:

- **First-month-locked-in**: the first month is always paid at purchase (non-refundable except for standard fraud disputes). Prevents 24-hour cancel-and-refund abuse.
- **Failed-charge → holder demotion**: if the buyer's card fails or is canceled, the recipient's sponsor status drops to Holder within a grace period (e.g., 14 days). Automatic downgrade.
- **Buyer's card = source of truth**: the sponsorship stays "monthly" only as long as the buyer's card is charging successfully OR the sponsor has taken over billing.

None of this needs to be built up front. It's just a set of guardrails to keep in mind when we build the billing layer.

## Migration from the current web model

The current web model won't just get thrown out. It stays as:

- Marketing site (homepage, /founder, /shirts, /impact) — public, indexable, drives new buyers.
- Fallback experience for people who don't want the app or can't install it.
- Content-management surface for admin (roster, review queue, campus updates, SOTM, sponsor notes queue). Kevin's admin tools don't need to move.

The kid page (/children/[N]) probably becomes the app-preferred surface. Web version stays as a viewable-but-limited version for cold visitors. Reveal moment moves to the app. Everyone directed to install after purchase.

Migration itself is a phased path:

1. **PWA layer** — make the current site installable to home screen with push notifications. Same codebase, adds manifest + service worker. Test push adoption on current 21+ sponsors. Roughly 2-3 days of dev.
2. **Fulfillment binding** — add the pending_shipments table and fulfillment page. Web-only initially. Roughly 1-2 days.
3. **Force the install path** — change shipping card copy from "beanumber.org/[N]" to "install Be A Number to meet your kid." Web reveal degrades to a fallback path.
4. **Native app (React Native)** — one codebase for iOS + Android. MVP is reveal + kid page + notes composer + push. Roughly 2-3 months focused dev.
5. **Sunset direct-web reveal** — after native app has traction, redirect all new buyers to install. Web reveal becomes cold-visitor-only.

## Push notifications — the retention play

The specific thing an app gives you that email can't: push notifications that feel like an iMessage instead of an inbox item.

Notifications worth sending:

- **[Kid] wrote you back.** The reply engine you already built. Currently a teaser email; would become a push.
- **[Kid] has a new update.** A photo, a milestone, a personal moment.
- **[Kid] is Student of the Month.** SOTM highlight, once per month per grade.
- **Your monthly newsletter is out.** Same cadence as email today, but pushed.
- **Kevin at the campus sent you something.** Correspondence engine reply from the ground.

Each push drives a return visit to the app. Return visits compound retention. That's the whole loop.

## Open questions — Kevin's decisions

Things that are NOT decided yet, that we'll need to work through when it's time to build:

1. **What happens when the buyer cancels the subscription for a gifted sponsorship?** Default drops recipient to Holder. Alternative: recipient gets a "your patron's card ended, want to keep this going with your own card?" nudge before demotion. Kevin's call which is default.

2. **Do buyer accounts get a public identity in the app?** E.g. can Maya see "This subscription is funded by Lucy Smith"? Or is that private? Probably private by default, opt-in for corporate buyers who want recognition.

3. **How does the reveal moment translate to a native app?** The web version has the Hold-to-Meet + split-flap board + confetti. Native app can be more polished (haptics, sound design, richer animations). Design decision when it's time to build.

4. **What's the retail partner relationship look like?** Does Kevin sell wholesale to specific retail partners who agree to point buyers at the app? Consignment? Does the app know which retail partner a shirt came from (partner branding + attribution)?

5. **Does the app support the correspondence engine's send-a-note flow with photo attachments?** Adds real complexity (moderation, translation of image content, storage). MVP could ship text-only and add photos in a later phase.

6. **What's the shape of the "buyer home" surface?** Does Lucy see her subscriptions? Purchase history? Recipient information? Gift management tools? Basically a settings-shaped surface with some warmth to it, but it's not the retention surface — that's the sponsor home.

7. **How do we handle the "physical shirt lost / never scanned" case?** Buyer paid, shirt got lost in mail. Their subscription is charging but nobody's using it. Support flow for reassignment (assign a new shirt to the same order, void the lost binding). Ops-heavy but rare.

8. **When does the app move from PWA to native?** Depends on push notification adoption metrics from the PWA phase. Kevin's judgment call based on the retention lift.

## Reading order when we come back to this

1. This file (you're here).
2. `CLAUDE.md` for the current non-negotiables (especially #4 — shirt-first, holder-vs-sponsor).
3. `docs/claude/project_state.md` for where the current web product actually is.
4. `docs/claude/architecture.md` for the current codebase shape.
5. `src/app/api/sponsor/claim-match/route.ts` and `src/app/api/webhooks/stripe/route.ts` for how the current identity + subscription attachment work today. The app model is a clean-slate redesign of both.

## One-line summary

**The shirt is a bearer instrument. The buyer pays, the scanner sponsors, the QR carries the binding. Everything else follows from that.**
