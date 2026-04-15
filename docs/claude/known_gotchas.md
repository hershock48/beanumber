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

## Open bugs (known, not yet fixed)

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

### Donation Source singleSelect is missing options

Options in Airtable: `Website`, `Manual Entry`, `Event`, `Other`. The code wants to set `Sponsorship`, `Shirt`, `Shirt + Monthly`. The normalizer in `upsertDonation` currently routes invalid values to `Website` and prefixes the real label onto `Donation Note` as `[Sponsorship]`, `[Shirt]`, etc. This is a workaround, not a fix.

**Fix when revisiting:** Kevin opens Airtable, edits the Donation Source field, adds `Sponsorship`, `Shirt`, `Shirt + Monthly`. Then we remove the normalizer from `upsertDonation`. Airtable's metadata API is blocked by the sandbox proxy, so I cannot do this from code.

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

### SendGrid template IDs are environment-bound

The template IDs in `env.ts` are for one SendGrid account. If keys get rotated or the account changes, the IDs have to be reissued and re-set in Vercel env. Don't hardcode template IDs in route handlers.

### Cowork workspace layout is user-facing

Anything I write to `/sessions/clever-modest-bell/mnt/beanumber/` is visible to Kevin immediately. Don't scatter scratch files here. Temp work goes in `/sessions/clever-modest-bell/` (sandbox root) or `/sessions/clever-modest-bell/work-beanumber/` (the clone). Only commit-worthy files land in the mount.

## Rules of thumb when you're unsure

- If a change touches money, the webhook, or Airtable writes: audit twice, ship once. Check the schema, check the field names, check that the test donation still completes end-to-end.
- If a change touches user-facing copy: re-read `voice.md`. The banned-phrase list is not a suggestion.
- If a change is load-bearing (payment flow, schema, auth): the commit message body explains *why*. The diff shows the *what*.
- If Kevin pushes back and you don't immediately agree: still stop. His pushback is fast and almost always correct. Fix the root cause; don't negotiate.
