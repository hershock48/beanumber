# Newsletter — how it works, how to author one, what NOT to do

> Read this before authoring or sending a newsletter, or changing any of the send / display code. Updated May 2026 when the model changed from "long email to sponsors" to "public newsfeed on every kid page + short notification email."

---

## What changed in May 2026 (the new model)

The newsletter used to be one long email shipped to every sponsor. That model had two problems: shirt buyers got nothing, and the body lived only in inboxes — which meant if someone wanted to look back at last month's update, they had to dig through Gmail.

The new model:

- **The newsletter body lives on every kid's `/[number]` page**, publicly visible to anyone.
- **The newsletter body also lives at `/news`** — a dedicated campus feed without kid framing. Same content, different surface.
- **The email is a short notification** — teaser + hero photo + a link. **Three variants** based on the recipient's relationship to BAN:
  - **Sponsors** get a direct link to *their* kid's page (the body sits below the kid's bio).
  - **Shirt buyers** (paid via Stripe but haven't sponsored monthly) get "type the number on the back of your shirt at beanumber.org" — the brand model intact, lands on the kid their shirt belongs to.
  - **Legacy donors** (gave through Donorbox or another path; no Stripe Donation on file) get pointed at `/news` — the dedicated campus feed. No "type any number" slot-machine ask, no fake-kid pairing. Soft CTA to meet the kids if they want.
- **Report cards + letters stay sponsor-only.** Those are individual to the kid + their sponsor and don't belong on the public feed.

Pool funding rule applies here too: a newsletter is a campus update, not a per-kid update. It runs once a month, ships to everyone, lives forever on `/news` and on every kid page.

---

## What happens when you click "Send to all"

One operation, four effects, in this order:

1. Newsletter Status flips `Draft → Sending`. PublishedAt gets stamped with `now`.
2. Sponsor loop fires `sendNewsletterNotificationEmail` to every Active Sponsorship's SponsorEmail (deduped by email — sponsors with multiple kids get one email listing all their kid links).
3. Non-sponsor loop runs through every Donor with an email who isn't a sponsor and hasn't unsubscribed. For each, it checks: do they have any Stripe-source Donation in Airtable (`Stripe Payment Intent ID` starts with `pi_` OR `Stripe Checkout Session ID` starts with `cs_`)?
   - **Yes** → `sendNewsletterNotificationEmailForNonSponsor` (shirt buyer variant — "type your shirt number").
   - **No** → `sendNewsletterNotificationEmailForLegacyDonor` (legacy variant — points at `/news`).
4. Newsletter Status flips to `Sent`. From that moment, `getRecentCampusNewsletters` picks it up and renders it on `/news` and every `/children/[N]` page.

There is **no separate "publish to feed" step**. The Sent state IS the publish event for both surfaces.

---

## Authoring a newsletter

### File: Airtable `Newsletters` table

Fields you fill in:

| Field | Purpose |
|---|---|
| `Title` | Internal label only. Never seen by readers. |
| `Subject` | Email subject line. Also the headline on the kid page. |
| `Author` | "Kevin" usually. Internal. |
| `Teaser` | 1–3 sentences. Renders as the italic blockquote in the notification email. Pull the strongest moment from the body, not the first paragraph. Leave blank to auto-extract. |
| `HeroPhoto` | One image, ~1200px wide, JPG/PNG. Renders at the top of the page card AND in the email. |
| `BodyHTML` | The full newsletter body. See authoring rules below. |
| `Status` | Draft → Sending → Sent (managed by the send code). Don't manually flip to Sent unless you know what you're doing. |
| `SendDate` | Only matters if you want the cron to auto-send. Otherwise leave blank and use the admin "Send to all" button. |

### BodyHTML authoring — the only rules you need

Author plain HTML. **No inline `style="..."` attributes.** Global CSS in `src/app/globals.css` (`.ban-newsletter-body` rules) handles the visual styling automatically. The admin Preview tab renders with the exact same CSS as the live page, so what you see in preview is what readers see.

**Tags that work and look right:**
- `<p>...</p>` — paragraphs. Auto-spaced. Required (HTML collapses whitespace).
- `<h2>...</h2>` — section headers. Lora serif, 24px, near-black, top margin.
- `<h3>...</h3>` — sub-section header. Smaller Lora serif.
- `<hr>` — divider line in BAN sand color.
- `<a href="https://...">...</a>` — gold links, near-black on hover.
- `<em>...</em>` — italics.
- `<strong>...</strong>` — bold.
- `<blockquote>...</blockquote>` — gold-bordered pull-quote.
- `<ul>` / `<ol>` / `<li>` — lists. Auto-spaced.
- `<img src="...">` — images. Max-width 100% automatically.

**Tags / patterns to NOT use:**
- `style="..."` attributes. Never. The global CSS handles it.
- `<h1>` — the page already has an h1 (the kid's name). Use `<h2>` for top sections.
- `{{sponsorFirstName}}` or any merge tag. **The body renders publicly on every kid page**, so any merge tag will leak through unsubstituted as literal text. Write to a mixed audience.
- `<font>`, `<center>`, or any other HTML4 era tag.

### Voice rules — the audience is mixed

The body ships to sponsors AND shirt buyers via email, AND sits publicly on every kid page where any visitor might read it. Don't assume the reader is a sponsor.

**Bad** (assumes sponsor):
> Hey {{sponsorFirstName}}, your monthly $25 is keeping the lights on...

**Good** (works for everyone in the BAN community):
> If you're reading this — sponsor, shirt buyer, or someone who landed on a kid's page — here's what shirts and sponsorships have been buying this month.

**Bad** (assumes sponsor):
> What your monthly sponsorship is paying for right now is...

**Good** (pool model framing, works for anyone):
> What every shirt and every $25 month is paying for right now is...

**Fine** (third-person about sponsors works):
> Sponsors here kept their subscriptions going through the term.

All other voice rules from `voice.md` still apply: direct, specific, personal, confident, faith-rooted not faith-forward, community-led not savior-driven. No "generous," "impact" as a verb, "empowerment," "just $25."

---

## Recipient lists — where they come from

### Sponsor list
Sourced from `findAllSponsorsForNewsletter()` in `src/lib/airtable.ts`. Filter: `Status = Active OR AuthStatus = Active` on the Sponsorships table. Deduped by lowercased email. A sponsor with multiple Active sponsorships gets one email with all their kid links.

**Ghost-sponsorship caution.** A Sponsorship row with `Status = Active` but no `StripeSubscriptionID` and no real Stripe payment behind it will be counted as a sponsor and produce a stray email + a stray kid link. Audit these by listing Sponsorships with no Stripe sub and verifying against the Donations table. The Stripe sync's claim-by-email path now backfills correctly, so this should be rare going forward.

### Non-sponsor list
Sourced from `fetchEmailableDonors()` in `src/lib/tools/email/send-campus-newsletter.ts`. Filter: `Email Address NOT BLANK AND NOT(Communication Opt-In = FALSE)`. **Opt-out model**, not opt-in — blank Opt-In = include. CAN-SPAM's existing-customer-relationship rule covers all Donors (they all paid for something), and Gmail bulk-sender policy is satisfied by the unsubscribe link in every email. Only people who actively clicked unsubscribe get suppressed.

Then we subtract the sponsor email set so emailable sponsors don't get the non-sponsor variant on top of the sponsor variant.

**If non-sponsor count looks wrong**, run `/admin/stripe-sync` → "Sync every customer now" first. That walks every Stripe charge and backfills any shirt buyer who's missing from the Donors table. The Stripe webhook *should* keep this current, but the stale signature-failure endpoint in the Stripe dashboard drops a chunk of events, so a periodic backfill keeps the list honest.

---

## Test send vs real send

Two ways to dry-run before pulling the trigger.

### "Send test to my inbox" button
Fires one preview of each variant (sponsor + non-sponsor) to kevin@beanumber.org. Subjects are prefixed `[TEST · sponsor view]` and `[TEST · non-sponsor view]` so they're easy to spot. Returns the **real** recipient counts (sponsors + non-sponsors) up front so you know what scale you're about to commit to. The Newsletter record's Status stays `Draft` — this is a preview, not the send.

### "Counts only" / dryRun
Same recipient calculation, no emails sent at all. Useful when you want to verify the audience size without touching your inbox.

### "Send to all"
The real send. Hits the confirm dialog first ("This will email every active sponsor + every shirt buyer / past donor who has not unsubscribed. Are you sure?"). After confirming, the loop runs serially with 50ms breathers between sends. Status flips to Sent at the end, and the body goes live on every kid page immediately.

---

## What lives where in the codebase

- `src/lib/tools/email/send-campus-newsletter.ts` — the orchestrator. Loads the newsletter, builds recipient lists, runs the shirt-buyer-vs-legacy detection, fires the three email loops, updates Status.
- `src/lib/newsletter-feed.ts` — `getRecentCampusNewsletters()` + `CampusNewsletterEntry` type. Shared by both `/children/[N]` and `/news`. Edit here when changing the feed fetch logic.
- `src/lib/email.ts` — Three email variants live here:
  - `sendNewsletterNotificationEmail` — sponsor variant (direct kid link).
  - `sendNewsletterNotificationEmailForNonSponsor` — shirt buyer variant ("type your shirt number").
  - `sendNewsletterNotificationEmailForLegacyDonor` — legacy donor variant (points at `/news`).
- `src/app/api/admin/newsletter/send/route.ts` — POST endpoint the admin UI calls.
- `src/app/admin/newsletter/page.tsx` — the editor + Send buttons. Surfaces the three-way breakdown in test/dry-run output.
- `src/app/children/[number]/CampusNewsfeed.tsx` — the public feed component. Reused by both `/children/[N]` and `/news`. Most recent newsletter renders in full; older ones collapse into compact cards with `<details>` expanders.
- `src/app/children/[number]/RelationshipCard.tsx` — the card that sits above the feed on kid pages. Sponsor variant is a quiet acknowledgment; non-sponsor variant is a $25/mo conversion ask.
- `src/app/news/page.tsx` — dedicated campus newsfeed page. Reuses `CampusNewsfeed`. Bottom CTAs link to the homepage carousel + sponsorship.
- `src/app/globals.css` — `.ban-newsletter-body` rules. Edit these if you want global styling changes to all newsletters past and future.

---

## Cadence

Roughly one per month. The teaser email is short enough that monthly doesn't feel like spam, and the newsletter is the only campus-wide content cadence in the org — so missing a month leaves people wondering.

If a month gets skipped, don't backdate. Send the next one with whatever content is current.

---

## Things that have gone wrong before

- **Merge tags in the body broke the public render.** `{{sponsorFirstName}}` only substitutes inside the email send loop. The same body renders on every kid page as static HTML, so the merge tag leaks as literal text. Don't use them. (Fixed May 2026.)
- **Inline `style="..."` on every `<h2>` was a maintenance burden.** Forgot to add global CSS at first. Now `.ban-newsletter-body` handles all styling. Don't add inline styles in the BodyHTML field. (Fixed May 2026.)
- **Non-sponsor count was always 0** because the opt-in filter required an explicitly-checked box. Switched to opt-out. (Fixed May 2026.)
- **Ghost sponsorships double-listed sponsors** in the dedup, leading to emails with two kid links when the person only sponsored one kid. Cleaned up via the audit at the end of May 2026, and the Stripe sync now claims by email when the Donor link is empty so the pattern doesn't reproduce.
