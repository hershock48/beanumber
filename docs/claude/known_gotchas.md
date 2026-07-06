# Known gotchas — what Kevin has told me to stop, and open bugs

Two sections: hard rules Kevin has set (don't violate these, they've already come up), and live bugs we know about but haven't fixed yet.

## Hard rules from Kevin

These are direct, specific instructions Kevin has given me in past conversations. If I find myself about to do any of these, I stop.

### Don't nag about revoking PATs or rotating secrets

If a token is in a working state and Kevin knows it exists, don't bring it up unsolicited. He knows. Only raise it if there's concrete evidence of a leak.

### Don't present "Option 1 / Option 2 / Option 3" menus

When Kevin asks for a recommendation, pick one, say why in one sentence, and commit. If he disagrees, he'll say so and we'll change it. A numbered options menu is me offloading the decision back onto him. Don't.

### Don't pad responses with "Great question!" / "I'll help you with that!" / "Let me know if you need anything else!"

Filler. Open with the answer. Close when the answer is done.

### Don't use "just" to minimize something

"Just run this command," "just a quick change" — diminishes the thing and reads condescending. Cut it.

### Don't use "simply"

Same reason. If it were simple Kevin wouldn't be asking.

### Don't say "obviously"

Condescending in both directions. Whatever follows is either not obvious, or is insulting.

### Don't repeat Kevin's question back to him as the opening line

"So you're asking how to…" — Kevin knows what he asked. Answer it.

### Don't do reflective-listening openers

"It sounds like you're saying…" / "I hear you." Kevin wants the next useful action, not a therapist.

### Don't apologize profusely when pushed back on

Acknowledge, fix, move. One sentence of ownership, then the fix. No ladder of apologies.

### Don't commit from inside the mount

This one is operational but it's also a Kevin directive: his exact words were "why do i have to keep doing this. figure it out." Commit from the external clone at `/sessions/clever-modest-bell/work-beanumber/`. Details in `operations.md`.

### Don't move slowly on execution tasks

When the approach is clear, ship. Don't re-discuss, don't re-ask. If the task is "continue the child page redesign," open the file and edit it — don't narrate the plan first.

### Don't "help" on things that weren't asked for

If Kevin asks for X, don't also do Y because Y looked related. Noise and drift. Finish X. Flag Y as a question if it's material.

### Don't write emails that sound like AI

Kevin's exact words: "why do these drip email campaigns literally sound like ai. They are so bad dude. Plz god put some effort into making these actually sound like a human." Specific patterns to avoid in ALL email copy:

- **Choppy three-word punchline sentences.** "You did that. And that's a big deal. And you know what. That's enough." — this is the AI rhythm Kevin hates most.
- **Em dashes for dramatic effect.** Zero em dashes in email content. Period.
- **Narrating the reader's emotions.** "That's not normal. That's extraordinary." — don't tell people what to feel.
- **Treating the reader like they have a small brain.** Write flowing, connected sentences. Assume adults. Don't break every thought into a separate line for emphasis.

Write like Kevin writes: conversational, warm, flowing sentences, natural pauses, treats people like intelligent adults who chose to be here.

### Don't proactively advertise the efficiency percentage

Kevin decided on April 18 to remove the 96.7% program efficiency stat from all marketing pages. It's a 2025 number that will shift as the org scales toward 80/20, and proactively advertising it invites people to wonder where the other 3.3% goes instead of focusing on the work. The stat stays on the financial summary report and governance page — where people go looking for it. Don't add it back to marketing copy.

### STOP SAYING "WE'LL MATCH THEM TO A KID" — restated 2026-07-06

Also cross-listed as Non-negotiable #1 in `CLAUDE.md`. If I've read that, this section shouldn't be news. It's here so the message survives even if `CLAUDE.md` gets rewritten.

**Kevin does not assign kids to buyers or sponsors. Ever.** The buyer claims the kid by visiting `/children/[N]` and hitting Hold-to-Meet. That's the entire product. Kevin doesn't touch `child_id`, `child_id_legacy`, or any sponsorship→kid link from the admin side.

Consequences for how I read the data and talk to Kevin:

- A sponsorship row with `child_id_legacy = NULL` is **NOT** a bug, **NOT** an incomplete record, and **NOT** something that needs my attention. It means the buyer hasn't claimed yet. That's the normal, correct steady state.
- I do **NOT** suggest "assigning a kid to Ronna" or "pairing this sponsor with Kid #X" or "picking a next unassigned shirt number for her." Every version of that framing is wrong.
- I do **NOT** describe a fresh sponsorship row as "waiting for kid assignment." It isn't waiting for me. It's waiting for the buyer.
- I do **NOT** ask Kevin whether he wants me to auto-assign or manually assign. Neither is an option. There is no assignment.

**Language substitutions:**
- "Assign a kid" → "claim a kid" (buyer-side verb, not admin-side).
- "Match this sponsor with a child" → not something we do; delete the sentence.
- "This sponsor doesn't have a kid yet" → "this buyer hasn't claimed yet" (or often just: no comment needed at all).

**History of this same lesson:**
- 2026-06-07: first documented. Kevin's exact words: *"WE ARE NOT MATCHING PEOPLE TO CHILDREN. WE USED TO DO THAT. WE ARE NOT MATCHING PEOPLE TO CHILDREN UNLESS THEY GO IN AND SPECIFICALLY CHOOSE A CHILD."*
- 2026-07-06: repeated on the Ronna Whitaker / Amy L Anderson email-typo thread. Kevin's exact words: *"no shit. remember. and this is me saying this way too many times now. this needs to be in the front and center of your .md or something, because we do not assign people to kids. they can claim them once they look up the number, but on my end, i dont keep track of what number she has or what numbers are going out. its up to the buyer to look up the number and claim the number if they choose."*

If I catch myself typing anything that implies admin-side pairing, I stop and rewrite the sentence. See `core_model.md` §0. **Sponsorship records get created at purchase. `Children` link blank. Done.**

### Don't make up "fixes" without reading the code first

Same 2026-06-07 session. I "fixed" Sam Banfield's missing newsletter segment by flipping her `Recurring Supporter` checkbox in Airtable. Wrong premise — the newsletter segmenter doesn't even look at that field. It queries the Sponsorships table by `Status="Active"`. Flipping the checkbox did literally nothing for her segmentation. **Always read the relevant code path before "fixing" a data-state symptom.** A wrong fix burns Kevin's trust and leaves the actual bug in place.

### Don't ship without explicit authorization

2026-06-07 session, repeating a lesson from earlier. Discussion ≠ build directive. Even if Kevin and I are deep in a back-and-forth about a fix, I do not write code or update production data until Kevin says "yes, do it" or "ship it." When in doubt, ask. When not in doubt, ask anyway.

### "Holder" must be added to Sponsorships.Status singleSelect in Airtable

Added 2026-06-08 as part of the number-holder claim flow (see `core_model.md` §0a). The `/api/sponsor/recover/send-link` endpoint and downstream code expect `Holder` to be a valid option on the `Sponsorships.Status` singleSelect. The Airtable metadata API cannot add singleSelect options — Kevin has to add it manually in the Airtable UI. Until added, Holder row creation silently 422s with INVALID_MULTIPLE_CHOICE_OPTIONS. The caller logs the failure but returns privacy-success to the user (no error surfaced), so the symptom is "claims silently never work." If a buyer claims and never sees a sponsor view, check this option first.

## Postgres migration traps (added 2026-06-22)

### Don't write to Airtable AND mutations.ts for the same row from the same code path

The Stripe webhook dual-writes through `src/lib/db/webhook-bridge.ts` — the mirror call happens AT THE EXISTING AIRTABLE WRITE SITE inside each helper. Don't add a second mirror call somewhere else for the same event. Audit shape: every Airtable write should have exactly one `mirrorToPostgres(...)` after it, no more. If you add a new Airtable write, add one mirror call alongside it.

### Donor email is stored as-given, lookups must be lowered

`donors.email` is preserved at the case the user typed. The uniqueness constraint is on `lower(email)` via `donors_email_lower_idx`. Any code that looks up a donor by email MUST do `sql\`lower(${donors.email}) = ${input.toLowerCase()}\``. Using `eq(donors.email, input)` will miss rows and then collide on insert. The mutations and the CSV migrator do this correctly; new code should too.

### Sponsorships have BOTH child_id (UUID) AND child_id_legacy (text)

During the transition window some sponsorships will have only the legacy ChildID populated. `queries.ts → getViewerSponsorshipForChild` matches on BOTH columns. When you write code that joins or lookups by kid, follow the same dual-match pattern. Once the legacy column is fully drained you can drop it, but not yet.

### Postgres `numeric` columns return JavaScript strings, not numbers

Drizzle's `numeric(10,2)` columns come back as strings via the `postgres` driver. `Number(row.monthlyAmount)` to convert. Mutations also accept the input as either number or string — they coerce.

### singleSelect statuses are text, not enums

I deliberately did NOT use Postgres enums for status fields. Adding a new enum value requires a migration. App-layer validation enforces valid values. If you see `status: text('status')` in `schema.ts`, that's intentional. Don't "fix" it.

### CSV migration is idempotent — don't write a one-shot migrator

`scripts/migrate-from-csv.ts` checks `id_mapping` (and natural-key fallbacks for sponsorships/subscriptions) before inserting. Safe to re-run. If you write any future migration script, follow the same pattern. Photos are uploaded with `upsert: true` so re-runs overwrite rather than duplicate.

### Don't bypass mutations.ts to write to Postgres directly

Every write goes through `mutations.ts` so it auto-audits. If you find yourself reaching for `db.insert(...)` from a route file, that's a smell — add a typed helper to `mutations.ts` instead. The one exception is admin scripts (one-off backfills); those are short-lived enough to call Drizzle directly.

### Drizzle `db.execute()` requires the sql tag, not a raw string

`db.execute(\`SELECT ...\`)` fails at runtime. `db.execute(sql\`SELECT ...\`)` is correct. Use `sql.identifier(name)` for table/column names and parameter binding for values. (We hit this in the CSV migrator; it's fixed now.)

### Don't commit CSVs to git

`/airtable-export/` and `*.csv` are in `.gitignore`. Exports contain PII (donor names, emails, addresses). Confirm `git status --short` shows no CSVs before pushing.

## Open bugs (known, not yet fixed)

### Cart+monthly checkout silently drops the recurring half — CRITICAL

**Symptom:** Buyers who go through `/checkout` (the cart flow) and tick "+monthly" pay the shirt $25, but no Stripe subscription gets created, no Airtable Sponsorship gets created, and no error alerts reach Kevin. As of 2026-06-07 we know of 4 such buyers in the last week: Jordan Young, Brittany Osborn, Mary Sigler, Jean M Kleppick. Kevin manually created Sponsorship rows for all 4 in Airtable but their Stripe subscription state is still unverified.

**Root cause:** `/src/app/api/create-cart-checkout/route.ts` creates the Stripe Checkout Session in `mode: 'payment'` (one-time). The webhook (`/src/app/api/webhooks/stripe/route.ts` around line 1802) is supposed to retroactively call `stripe.subscriptions.create()` for each `+monthly` cart item using the saved payment method. That call appears to be failing or not running for the recent buyers, with no alert email reaching kevin@beanumber.org.

**Fix:** Switch cart+monthly to `mode: 'subscription'` so Stripe creates the sub natively as part of checkout. Eliminates the retroactive-create path entirely. Then auto-create the Sponsorship row on `checkout.session.completed` with **empty `Children` link** (per `core_model.md` §0). Tracked but not yet shipped.

**Separately:** The webhook's alert-email send path (`sendEmail` to kevin@beanumber.org when deferred sub create fails) appears broken. None of the 4 missing subscriptions triggered an alert. Needs investigation.

### Sponsorship records aren't created at purchase time

Related to the cart bug above but broader. Under current code, the webhook deliberately skips Sponsorship creation for cart+monthly buyers, citing "we can't link to a child we haven't matched yet." That premise is wrong per `core_model.md` §0 — we don't match, ever. The Sponsorship should be created the moment payment clears, with `Children` left blank.

**Fix:** Same as above. Auto-create on `checkout.session.completed` (and `customer.subscription.created` as belt-and-suspenders).

### Newsletter "May 2026 Recap" had non-sponsor variant delivered to actual sponsors

Reported by Sam Lynn (sbanfield2015@gmail.com) and Amanda Sobel Woods on 2026-06-07. Send was 2026-05-30 17:15 UTC; their Sponsorship records existed by then. Segmenter (`findAllSponsorsForNewsletter` in `src/lib/airtable.ts:977`) uses `OR(AuthStatus="Active", Status="Active")` against the Sponsorships table, which should have matched them. Root cause undetermined as of 2026-06-07 — possible: (a) timing race with rollups, (b) case sensitivity in the email dedup against the non-sponsor list, (c) something else. **Do not "fix" the segmenter without first instrumenting a send and confirming the actual exclusion path for a known-good sponsor.**

### Amanda Sobel Woods sponsorship was linked to wrong cycle record

Fixed manually 2026-06-07. Her sponsorship (`BAN-2026-793`) was pointing at cycle record #64 (which maps to Aaron #12 via cycle math) because she had no `Children` link populated at all and someone (or the webhook) auto-grabbed an arbitrary kid. She bought shirt #10 (James). Relinked to #10. **Root cause:** Sponsorships were getting created with arbitrary `Children` links instead of being created blank. Compounds the no-matching rule violation.

### Stripe webhook 400 signature failure at 20:02:15 on 2026-04-15

A single 400 fired on the webhook endpoint at that timestamp. Signature verification failed. Most likely cause: a duplicate webhook endpoint in the Stripe dashboard pointing at `www.beanumber.org/api/webhooks/stripe` with a different signing secret than the one in Vercel env. When Stripe fires both endpoints, the one with the stale secret returns 400.

**Fix:** Kevin goes to Stripe Developers → Webhooks, finds the duplicate endpoint, deletes it. Keep one endpoint per mode (test, live), each with its own secret in Vercel env.

Until Kevin does this, expect sporadic 400s in Stripe's event log that don't correspond to real problems. Don't chase them.

### Shirt product copy overclaims $25 math and tax posture

Some product copy on `/shirts` frames the $25/month in ways that may overstate what it covers, or implies tax deductibility of the shirt itself (a shirt is a tangible good; only the portion above fair market value is deductible, and we haven't computed that cleanly). Flagged, not fixed. Needs a lawyer's eye and a rewrite.

**Fix when revisiting:** rewrite copy against the math in `voice.md` (direct, specific, confident — name the line items and their cost). Route any tax-deductibility language through Kevin + counsel.

### ChildID → ShirtNumber migration is deferred

~20 files use `ChildID` as a join key between Sponsorships and Children. The Ugandan team only uses shirt numbers. Migration requires coordinated code + data changes; Kevin and I agreed to defer mid-stream rather than juggle it alongside the child intake rollout.

**Fix when revisiting:** grep the repo for `ChildID`, plan the refactor before touching records, run a dry-run against a copy of the Airtable base, then flip. Don't start this without explicit greenlight.

### Donation Source singleSelect — resolved 2026-05-13, normalizer kept as safety net

**Status: resolved for current code paths.** All labels the code actually writes are valid options in Airtable's `Donation Source` singleSelect: `Website`, `Manual Entry`, `Event`, `Other`, `Portal Repeat`, `Sponsorship`, `Shirt Order`, `Shirt + Monthly`. The webhook&rsquo;s `VALID_SOURCES` set mirrors that list.

The normalizer in `upsertDonation` stays in place as a safety net for any future label the code might pass before the corresponding Airtable option is added (e.g., `Founder's Series`, `Gift Shirt`, `Gift Sponsorship`). It routes unknown values to `Website` and prefixes the real label onto `Donation Note` as `[Real Label]`.

In the Postgres world (`donations.donation_source` is `text`, not an enum), the singleSelect constraint doesn&rsquo;t apply — but we keep writing the canonical labels to stay consistent with the Airtable shadow data and the `webhook-bridge` mirror code. See `airtable_schema.md` Trap 1 for the resolved version of this story.

### Airtable metadata API is blocked by sandbox proxy

Returns 403 with `X-Proxy-Error: blocked-by-allowlist`. This affects:

- Adding new singleSelect options.
- Creating new fields.
- Creating new tables.
- Renaming fields.

All schema changes must happen in the Airtable UI, manually, by Kevin. Data reads/writes against existing schema work normally.

### Vercel runtime log MCP truncates messages

The `get_runtime_logs` MCP tool returns only the first log line per request, and that line is itself cut off mid-sentence. You cannot pull a full stack trace from this tool. Work around by filtering on status code + path, cross-referencing with code, and inferring from surviving keywords.

### Virtiofs mount cannot unlink files

The Cowork workspace at `/sessions/clever-modest-bell/mnt/beanumber/` is a virtiofs mount that rejects `unlink()` on any file regardless of owner. This means `rm`, `os.remove`, `Path.unlink()` all fail with "Operation not permitted" inside the mount. Practical consequences:

- `git commit` from inside the mount leaves `.git/index.lock` behind.
- Any tool that tries to delete a temp file in the mount errors.
- `git clean`, `git restore` with file deletion, `npm install` side effects — all fragile.

**Workaround:** use the external clone at `/sessions/clever-modest-bell/work-beanumber/` for git operations, and write temp files to `/sessions/clever-modest-bell/` (sandbox root, not the mount) for anything that needs to be deleted.

### package-lock.json can pick up stray changes in the external clone

Running `npm install` in the external clone (e.g. to test a build) can modify `package-lock.json`. If I then `git add` without checking, those changes get pulled into a commit unrelated to the real change. I did this once; the lockfile cleanup in commit `2307241` was incidental, not the point of the commit. Review `git status` + `git diff` before every commit.

### Email provider is Gmail-first, SendGrid-fallback

`src/lib/email.ts` tries Gmail OAuth2 first, falls back to SendGrid. In production, Gmail is active. If Gmail credentials expire or break, email will silently fall through to SendGrid (if its API key is set) or fail entirely. The Gmail refresh token is the most fragile piece — if Kevin changes his Google password or revokes OAuth access, all outbound email stops until the token is refreshed. Don't assume SendGrid is active unless you've confirmed Gmail is down.

### Legacy email templates in email.ts — REWRITTEN (May 2026)

The five template functions in `src/lib/email.ts` (`sendSponsorWelcomeEmail`, `sendDonationReceiptEmail`, `sendRecurringDonationThankYouEmail`, `sendUpdateNotificationEmail`, `sendUpdateRequestConfirmationEmail`) were previously called out here as violating voice.md — banned phrases, wrong tone, Helvetica/dark-header styling.

All five were rewritten by an earlier session and now match voice.md: "Hey ${firstName}," opening, Georgia serif on cream, gold/sand palette, signed "Kevin," no banned phrases. Verified by grep against the full banned-phrase list — zero hits.

Going forward, when writing or modifying email templates here: stay in the `wrapTransactionalEmail` wrapper (already styled correctly), open "Hey ${firstName}," sign "Kevin," avoid em dashes in body copy (rare even in dev comms, never in user-facing email).

### Cowork workspace layout is user-facing

Anything I write to `/sessions/clever-modest-bell/mnt/beanumber/` is visible to Kevin immediately. Don't scatter scratch files here. Temp work goes in `/sessions/clever-modest-bell/` (sandbox root) or `/sessions/clever-modest-bell/work-beanumber/` (the clone). Only commit-worthy files land in the mount.

## Rules of thumb when you're unsure

- If a change touches money, the webhook, or Airtable writes: audit twice, ship once. Check the schema, check the field names, check that the test donation still completes end-to-end.
- If a change touches user-facing copy: re-read `voice.md`. The banned-phrase list is not a suggestion.
- If a change is load-bearing (payment flow, schema, auth): the commit message body explains *why*. The diff shows the *what*.
- If Kevin pushes back and you don't immediately agree: still stop. His pushback is fast and almost always correct. Fix the root cause; don't negotiate.
