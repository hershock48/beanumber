# Be A Number

The site and app behind beanumber.org. Every shirt sold carries a number; the number resolves to a real child at the YDO campus in Omoro District, Northern Uganda; the buyer meets the child by entering the number, and can stay as a $25/month sponsor.

Start with `CLAUDE.md`, then `docs/claude/charter.md`, `docs/claude/voice.md`, `docs/claude/core_model.md` and `docs/claude/architecture.md`. The non-negotiables in `CLAUDE.md` decide what counts as a bug.

## Layout

- `src/`: the Next.js 16 site (App Router, Tailwind v4, Drizzle over Postgres on Supabase).
- `mobile/`: the Expo app. Separate package, talks to `/api/mobile/v1/*`.
- `drizzle/`: hand-written, idempotent SQL migrations that Kevin applies in the Supabase SQL editor. Do not run `drizzle-kit generate` or `migrate` (see `drizzle.config.ts`).
- `tests/`: `node:test` files. `npm test` runs them through an in-process TypeScript loader, no build step.
- `docs/claude/`: the operating docs. `docs/audit-2026-10.md` is the latest full audit.

## Run it

```bash
npm install
npm run dev
```

`.env.local` needs `DATABASE_URL` at minimum; the full variable list is in `docs/deployment/VERCEL_ENV_VARS.md`. Nothing is required at import, so a missing variable fails the one request that needs it.

## Before you push

```bash
npx tsc --noEmit
npm run lint
npm test
```

All three are clean on `main`. Production deploys from `main` on Vercel; work lands through short-lived branches and pull requests.
