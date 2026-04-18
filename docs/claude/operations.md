# Operations — how I actually ship

Git, Vercel, logs, env vars, test procedures. Read this before running any git command or trying to view runtime logs, because both have gotchas that will waste Kevin's time if you don't know them.

## The git workflow (this is the important one)

### The problem

The Cowork sandbox mounts Kevin's beanumber folder at `/sessions/clever-modest-bell/mnt/beanumber` via virtiofs. This mount does not allow `unlink()` on any file, regardless of owner or permissions. I verified this — `touch test.tmp && rm test.tmp` returns "Operation not permitted."

This means `git commit` from inside the mount leaves `.git/index.lock` and `.git/HEAD.lock` behind, because git creates those locks as part of the commit and then can't remove them. Kevin has to manually `rm -f ~/beanumber/.git/index.lock ~/beanumber/.git/HEAD.lock` before he can run any git command on his Mac. He has rightly told me to stop making him do this.

### The fix: commit from an external clone

There is a parallel clone at `/sessions/clever-modest-bell/work-beanumber/`. It's outside the mount, so `unlink` works, so git commits do not leave locks behind.

- **Remote:** `https://github.com/hershock48/beanumber.git` (PAT embedded in the remote URL for push auth — don't commit the PAT anywhere else).
- **Branch:** always `main`. No feature branches.

### Standard ship procedure

1. Make your edits in `/sessions/clever-modest-bell/mnt/beanumber/` (the mount). This is what Kevin sees, what his IDE is watching, what Vercel watches if he pushes locally.
2. Copy the changed files into the clone:
   ```bash
   cp /sessions/clever-modest-bell/mnt/beanumber/path/to/file \
      /sessions/clever-modest-bell/work-beanumber/path/to/file
   ```
   Or for a whole directory, use `cp -r`. Only copy files you changed — don't blindly sync the whole tree or you'll pick up node_modules and .next.
3. From inside the clone, stage and commit:
   ```bash
   cd /sessions/clever-modest-bell/work-beanumber
   git add path/to/file
   git commit -m "feat(scope): message"
   ```
4. Push to `main`:
   ```bash
   git push origin main
   ```
5. Tell Kevin what landed and where. Include the commit SHA. He can then `git pull` on his Mac when he wants.

### What not to do

- **Do not run `git commit` from inside `/sessions/clever-modest-bell/mnt/beanumber/`.** It will leave locks for Kevin to clean up. He has told me to stop doing this.
- **Do not try `rm -f .git/*.lock` from the sandbox.** The mount rejects unlinks. You cannot fix the lock situation from inside the sandbox; you can only avoid creating locks in the first place.
- **Do not force-push to `main`.** This is the only branch. Losing a commit is losing production history.
- **Do not commit `node_modules/` or `.next/`.** Both are gitignored; if you see one staged, you copied too much.
- **Do not commit the PAT.** It's in the clone's remote URL, not in tracked files. Keep it that way.

### Commit message style

Conventional Commits: `feat(scope):`, `fix(scope):`, `refactor(scope):`, `chore(scope):`, `docs(scope):`. The body explains *why* when the change is load-bearing (webhook, schema, payment flow). One-liners are fine for obvious fixes.

Recent examples that landed well:

- `fix(webhook): stop writing nonexistent Donation fields`
- `feat(children): structured intake fields + homepage badge cleanup`
- `feat(shirts): promote monthly sponsorship toggle to a real opt-in card`

## Vercel

### Projects

Team `kevins-projects-ec116b76` has two projects:

- `beanumber` (`prj_IwSgQIaCFpVrkmjydT1HcLvufYeO`) — **this is production.** Serves `www.beanumber.org`. Auto-deploys on push to `main`.
- `beanumber-live` (`prj_vuBv3enBM2LxEBYFMqaupqcRbcAn`) — not currently production. Historical artifact. Don't promote or redirect traffic to it.

Don't mix them up. The live site is `beanumber`, period.

### Deployments

Push to `main` → Vercel auto-builds `beanumber` → new deployment replaces production. Time to live is usually 60–120 seconds for a typical diff.

Preview deploys happen automatically on PRs, but we don't use a PR workflow. Push straight to `main`.

### Reading logs

Use the Vercel MCP:

- `list_deployments(project_id_or_name="beanumber")` — find the deployment you want.
- `get_deployment_build_logs(deployment_id_or_url=...)` — build-time output.
- `get_runtime_logs(project_id_or_name="beanumber", ...)` — request-time logs.

**Gotcha:** `get_runtime_logs` truncates message text. You often see only the first line of a log entry, and that line is itself cut off mid-sentence. You cannot pull a full stack trace from this tool. Workarounds:

- Filter by status code (e.g. `status_code="500"`) to find the right request.
- Filter by path (e.g. `path="/api/webhooks/stripe"`) to narrow.
- Cross-reference with the code and a known keyword from the truncated output. If you see `"[Webhook] Received event: c..."`, you know it got past signature verification and into the dispatcher.
- For a webhook failure, audit the code paths that match the truncated keyword rather than waiting for a full trace.

### Environment variables

Env vars are configured in the Vercel dashboard per-project. The local `.env.local` in the mount is for Kevin's dev server, not production. If a new var is needed, tell Kevin the exact key name and value (or how to generate it), and let him add it in Vercel. Don't claim it's set until he confirms.

Validated env loading lives in `src/lib/env.ts`. Any new var must be added there with a schema; otherwise it imports to `undefined` at runtime and things break silently in prod.

## Stripe

### Test mode vs live mode

Both live under the same dashboard (account `hershock48`). Each mode has its own API keys, its own webhook signing secrets, and its own dashboard view. Do not conflate.

- **Test mode** = where Kevin runs $5 validation donations. Uses `sk_test_...` and `pk_test_...`. Test cards like `4242 4242 4242 4242`.
- **Live mode** = real money. Uses `sk_live_...` and `pk_live_...`.

Vercel prod should be pointed at whichever keys correspond to the mode we're operating in. Currently we're in pre-launch and Kevin is running test-mode donations against the prod site.

### Webhook endpoints

Stripe → `www.beanumber.org/api/webhooks/stripe`. One endpoint per mode. The signing secret (`STRIPE_WEBHOOK_SECRET` in Vercel env) must match the endpoint's secret in the Stripe dashboard.

**Known open bug:** A 400 signature-verification failure fired at 20:02:15 on April 15, suggesting there's a stale duplicate endpoint in the Stripe dashboard pointing at the same URL with the wrong secret. Kevin needs to check Stripe Developers → Webhooks, find the duplicate, and delete it. Until then, we'll see sporadic 400s that don't reflect real problems.

### Test procedure for a $5 donation (the sandbox validation)

1. Go to `www.beanumber.org/donate` in a browser.
2. Enter $5, real-looking name, real-looking email, and test card `4242 4242 4242 4242`, any future expiry, any CVC, real-looking billing address.
3. Submit. Expect redirect to Stripe Checkout, then success redirect back.
4. Within 30 seconds, verify:
   - A new record appears in the Donations table (status Succeeded, amount $5).
   - A new Donor record if the email was new (or updated if existing).
   - A thank-you email arrives at the address used.
   - Admin notification email arrives at kevin@beanumber.org.
5. If any of the above is missing, pull runtime logs for `/api/webhooks/stripe` at the timestamp of the test, filter to 400/500, cross-reference with Airtable schema.

## Logs from the app itself

Use `src/lib/logger.ts` (`log.info`, `log.warn`, `log.error`). Do not `console.log` — it shows up in Vercel runtime logs but is harder to grep and isn't structured.

Every log line from the webhook should start with `[Webhook]` so it's findable. Same pattern for `[Cron]`, `[Email]`, etc.

## Secrets

- **GitHub PAT** — embedded in the remote URL of the external clone. Don't commit, don't paste into chat, don't echo. If it leaks, Kevin rotates and we re-embed.
- **Stripe secret keys** — in Vercel env only. Never in code, never in `.env.example`, never in docs.
- **Airtable PAT** — in Vercel env (`AIRTABLE_PAT` or similar — check `src/lib/env.ts`).
- **SendGrid API key** — in Vercel env.

Kevin has explicitly told me not to nag him about PAT rotation. Don't bring it up unless there's a concrete reason to think one has leaked.

## When something breaks in production

1. Check Stripe dashboard (Payments, Events, Webhook attempts) — the ground truth of money flow.
2. Check Airtable — was the record created? If yes, what's wrong with it? If no, why not?
3. Pull Vercel runtime logs for the route at the timestamp. Filter status codes.
4. If the stack trace is truncated by the log MCP, audit the code path using whatever keyword survived the truncation.
5. If you find the root cause, fix it in the mount, copy to the clone, commit with a `fix(scope):` message that says why, push.
6. Watch the next test transaction end-to-end before declaring it fixed.
7. Update `project_state.md` if the fix moves something in or out of "in flight" or "deferred."

## When the fix requires Kevin's hands

- Stripe dashboard changes (adding/removing webhook endpoints, rotating keys, swapping test/live).
- Airtable schema changes (new fields, new singleSelect options, new tables).
- Vercel env var changes.
- Domain / DNS changes.

In all four cases, tell Kevin in one sentence what he needs to click, and where. Don't pretend you can do it yourself. Don't present three options.
