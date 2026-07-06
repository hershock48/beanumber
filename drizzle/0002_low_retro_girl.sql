-- Migration 0002 — SOTM history archive.
--
-- Adds sotm_history table only. Drizzle-kit's diff picked up a bunch
-- of pre-existing drift (columns added ad-hoc in earlier commits
-- without accompanying migrations, the settings table created by
-- hand, etc.) that already exists in production. Applying those
-- statements would fail with "already exists" errors. Schema.ts
-- remains the source of truth; the drifted bits are already live.
-- This file is intentionally narrowed to what changed in THIS commit.
--
-- Follow-up (not urgent): reconcile drizzle's meta snapshot with the
-- live prod schema so future generate diffs stop re-suggesting these
-- already-live changes.

CREATE TABLE "sotm_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"grade_code" text NOT NULL,
	"month" text NOT NULL,
	"reason" text NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sotm_history" ADD CONSTRAINT "sotm_history_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "sotm_history_grade_month_idx" ON "sotm_history" USING btree ("grade_code","month");
--> statement-breakpoint
CREATE INDEX "sotm_history_child_idx" ON "sotm_history" USING btree ("child_id");
