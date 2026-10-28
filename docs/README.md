# Documentation

## Read first

`docs/claude/` is the operating set. `CLAUDE.md` at the repo root says which to read and in what order:

- `charter.md`, `voice.md`, `core_model.md`, `funding_model.md`: who we are, how we write, how the number and the money work.
- `architecture.md`: the code map (corrected 2026-10-28).
- `project_state.md`, `known_gotchas.md`, `operations.md`: where things stand, what not to do, how to ship.
- `newsletter.md`, `gmail_setup.md`, `postgres_migration.md`: how specific systems work.
- `admin_os.md`, `today_view_design.md`, `app_build.md`, `app_model.md`, `mystery_copy.md`, `orientation_email_draft.md`: design docs. The first four predate the Postgres cutover and say "Airtable" where the code says Postgres.

## Current references outside `docs/claude/`

- `audit-2026-10.md`: the October 2026 audit, findings ranked, what changed and what did not.
- `printful.md`: the dropship runbook.
- `christmas-2026.md`: the pooled Christmas fund.
- `newsletters/`: newsletter drafts and sends.
- `deployment/VERCEL_ENV_VARS.md`: the environment variable list.
- `app-design-brief.md`, `app-store-submission.md`, `app-featuring-nomination.md`, `farmers-market-banner-research.md`.

## Historical (Airtable era, kept for the record)

Everything under `architecture/`, `development/`, `setup/`, `training/` and the rest of `deployment/` describes the pre-September-2026 stack: Airtable tables, tool families and routes that no longer exist. Each file carries a banner saying so. Treat them as history, not instructions.
