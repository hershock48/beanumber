CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" text DEFAULT 'viewer' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_name" text NOT NULL,
	"record_id" uuid NOT NULL,
	"action" text NOT NULL,
	"changed_fields" jsonb,
	"actor_id" uuid,
	"actor_type" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"airtable_id" text,
	"batch_name" text,
	"start_shirt_number" integer NOT NULL,
	"end_shirt_number" integer NOT NULL,
	"roster_snapshot" text,
	"status" text DEFAULT 'Planned',
	"opened_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "child_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"airtable_id" text,
	"update_id" text,
	"sponsor_code" text,
	"child_id" uuid,
	"child_id_legacy" text,
	"update_type" text,
	"type" text,
	"title" text,
	"content" text,
	"summary" text,
	"update_details" text,
	"sponsor_narrative" text,
	"update_date" date,
	"status" text,
	"visible_to_sponsor" boolean DEFAULT true,
	"photo_urls" jsonb DEFAULT '[]'::jsonb,
	"physical_wellbeing" text,
	"emotional_wellbeing" text,
	"school_engagement" text,
	"physical_notes" text,
	"emotional_notes" text,
	"engagement_notes" text,
	"positive_highlight" text,
	"challenge" text,
	"attendance_percent" numeric(5, 2),
	"english_grade" numeric(5, 2),
	"math_grade" numeric(5, 2),
	"science_grade" numeric(5, 2),
	"social_studies_grade" numeric(5, 2),
	"teacher_comment" text,
	"drive_folder_id" text,
	"photo_1_file_id" text,
	"photo_2_file_id" text,
	"photo_3_file_id" text,
	"handwritten_note_file_id" text,
	"report_card_file_id" text,
	"submitted_at" timestamp with time zone,
	"submitted_by" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"correction_notes" text,
	"source_type" text,
	"period" text,
	"academic_term" text,
	"requested_by_sponsor" boolean DEFAULT false,
	"requested_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"author" text,
	"last_modified" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "children" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"airtable_id" text,
	"child_id" text NOT NULL,
	"shirt_number" integer,
	"archived_shirt_number" integer,
	"first_name" text,
	"last_initial" text,
	"display_name" text,
	"date_of_birth" date,
	"gender" text,
	"profile_photo_url" text,
	"status" text DEFAULT 'Active',
	"enrollment_date" date,
	"grade_class" text,
	"school_location" text,
	"notes" text,
	"home_village" text,
	"family_context" text,
	"loves" text,
	"child_quote" text,
	"teacher_name" text,
	"teacher_quote" text,
	"name_meaning" text,
	"shirt_assigned_at" timestamp with time zone,
	"shirt_buyer_email" text,
	"shirt_buyer_name" text,
	"reserved_for_auction" boolean DEFAULT false,
	"expected_field_period" text,
	"expected_academic_term" text,
	"last_field_update_date" date,
	"last_academic_update_date" date,
	"departure_requested_at" timestamp with time zone,
	"departure_requested_note" text,
	"departed_at" timestamp with time zone,
	"departure_note" text,
	"pending_draft" jsonb,
	"student_of_month" boolean DEFAULT false,
	"student_of_month_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"airtable_id" text,
	"subject" text,
	"send_date" date,
	"status" text,
	"recipient_email" text,
	"email_type" text,
	"related_donation_id" uuid,
	"related_donor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "donation_children" (
	"donation_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "donations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"airtable_id" text,
	"stripe_payment_intent_id" text,
	"stripe_checkout_session_id" text,
	"donation_date" date,
	"payment_status" text,
	"donation_amount" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'usd',
	"recurring_donation" boolean DEFAULT false,
	"donor_id" uuid,
	"donor_email_at_donation" text,
	"stripe_customer_id" text,
	"donation_note" text,
	"donation_source" text DEFAULT 'Website',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "donors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"airtable_id" text,
	"name" text,
	"organization_name" text,
	"email" text NOT NULL,
	"phone_number" text,
	"mailing_address" text,
	"stripe_customer_id" text,
	"total_lifetime_giving" numeric(10, 2) DEFAULT '0',
	"first_donation_date" date,
	"most_recent_donation" date,
	"donor_status" text DEFAULT 'New',
	"recurring_supporter" boolean DEFAULT false,
	"communication_opt_in" boolean DEFAULT false,
	"how_they_heard" text,
	"notes" text,
	"drip_pipeline" text,
	"drip_stage" integer,
	"drip_next_send" date,
	"drip_child_name" text,
	"drip_shirt_number" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fulfillments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"airtable_id" text,
	"order_number" integer,
	"design" text,
	"shirt_color" text,
	"size" text,
	"vinyl_front" text,
	"vinyl_back" text,
	"buyer_name" text,
	"buyer_email" text,
	"ship_name" text,
	"ship_street_1" text,
	"ship_street_2" text,
	"ship_city" text,
	"ship_state" text,
	"ship_zip" text,
	"production" text,
	"shipping" text,
	"tracking" text,
	"child_name" text,
	"order_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "id_mapping" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_name" text NOT NULL,
	"airtable_id" text NOT NULL,
	"postgres_id" uuid NOT NULL,
	"migrated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"airtable_id" text,
	"title" text NOT NULL,
	"subject" text,
	"body_html" text,
	"hero_photo_url" text,
	"status" text DEFAULT 'Draft',
	"send_date" timestamp with time zone,
	"published_at" timestamp with time zone,
	"recipient_count" integer,
	"sent_count" integer,
	"failed_count" integer,
	"send_notes" text,
	"author" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"airtable_id" text,
	"platform" text,
	"content_type" text,
	"caption" text,
	"hashtags" text,
	"scheduled_at" timestamp with time zone,
	"status" text DEFAULT 'Pending',
	"published_at" timestamp with time zone,
	"media_drive_id" text,
	"media_url" text,
	"instagram_post_id" text,
	"facebook_post_id" text,
	"error" text,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"related_child_update_id" uuid,
	"review_needed" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "sponsorships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"airtable_id" text,
	"sponsor_code" text NOT NULL,
	"sponsor_email" text NOT NULL,
	"sponsor_name" text,
	"child_id_legacy" text,
	"child_id" uuid,
	"child_display_name" text,
	"child_age" text,
	"child_location" text,
	"status" text DEFAULT 'New' NOT NULL,
	"auth_status" text,
	"visible_to_sponsor" boolean DEFAULT true,
	"sponsorship_start_date" date,
	"monthly_amount" numeric(10, 2) DEFAULT '25.00',
	"stripe_subscription_id" text,
	"child_revealed_at" timestamp with time zone,
	"requested_by_sponsor" boolean DEFAULT false,
	"requested_at" timestamp with time zone,
	"last_request_at" timestamp with time zone,
	"next_request_eligible_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"previous_child_ids" text,
	"last_reassigned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"airtable_id" text,
	"stripe_subscription_id" text NOT NULL,
	"donor_id" uuid,
	"status" text,
	"start_date" date,
	"current_period_end" date,
	"amount" numeric(10, 2),
	"frequency" text DEFAULT 'monthly',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "child_updates" ADD CONSTRAINT "child_updates_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_related_donation_id_donations_id_fk" FOREIGN KEY ("related_donation_id") REFERENCES "public"."donations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_related_donor_id_donors_id_fk" FOREIGN KEY ("related_donor_id") REFERENCES "public"."donors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donation_children" ADD CONSTRAINT "donation_children_donation_id_donations_id_fk" FOREIGN KEY ("donation_id") REFERENCES "public"."donations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donation_children" ADD CONSTRAINT "donation_children_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_donor_id_donors_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_posts" ADD CONSTRAINT "scheduled_posts_related_child_update_id_child_updates_id_fk" FOREIGN KEY ("related_child_update_id") REFERENCES "public"."child_updates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsorships" ADD CONSTRAINT "sponsorships_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_donor_id_donors_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_email_idx" ON "admin_users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "audit_log_table_record_idx" ON "audit_log" USING btree ("table_name","record_id");--> statement-breakpoint
CREATE INDEX "audit_log_occurred_at_idx" ON "audit_log" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "batches_start_shirt_idx" ON "batches" USING btree ("start_shirt_number");--> statement-breakpoint
CREATE INDEX "batches_status_idx" ON "batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "batches_airtable_idx" ON "batches" USING btree ("airtable_id");--> statement-breakpoint
CREATE INDEX "child_updates_child_idx" ON "child_updates" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "child_updates_child_legacy_idx" ON "child_updates" USING btree ("child_id_legacy");--> statement-breakpoint
CREATE INDEX "child_updates_published_at_idx" ON "child_updates" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "child_updates_visible_idx" ON "child_updates" USING btree ("visible_to_sponsor");--> statement-breakpoint
CREATE INDEX "child_updates_airtable_idx" ON "child_updates" USING btree ("airtable_id");--> statement-breakpoint
CREATE UNIQUE INDEX "children_child_id_idx" ON "children" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "children_shirt_number_idx" ON "children" USING btree ("shirt_number");--> statement-breakpoint
CREATE INDEX "children_status_idx" ON "children" USING btree ("status");--> statement-breakpoint
CREATE INDEX "children_departed_at_idx" ON "children" USING btree ("departed_at");--> statement-breakpoint
CREATE INDEX "children_airtable_idx" ON "children" USING btree ("airtable_id");--> statement-breakpoint
CREATE INDEX "communications_recipient_idx" ON "communications" USING btree (lower("recipient_email"));--> statement-breakpoint
CREATE INDEX "communications_send_date_idx" ON "communications" USING btree ("send_date");--> statement-breakpoint
CREATE INDEX "communications_related_donation_idx" ON "communications" USING btree ("related_donation_id");--> statement-breakpoint
CREATE INDEX "communications_related_donor_idx" ON "communications" USING btree ("related_donor_id");--> statement-breakpoint
CREATE INDEX "communications_airtable_idx" ON "communications" USING btree ("airtable_id");--> statement-breakpoint
CREATE UNIQUE INDEX "donation_children_pk" ON "donation_children" USING btree ("donation_id","child_id");--> statement-breakpoint
CREATE UNIQUE INDEX "donations_payment_intent_idx" ON "donations" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "donations_checkout_session_idx" ON "donations" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
CREATE INDEX "donations_donor_idx" ON "donations" USING btree ("donor_id");--> statement-breakpoint
CREATE INDEX "donations_donation_date_idx" ON "donations" USING btree ("donation_date");--> statement-breakpoint
CREATE INDEX "donations_airtable_idx" ON "donations" USING btree ("airtable_id");--> statement-breakpoint
CREATE UNIQUE INDEX "donors_email_lower_idx" ON "donors" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "donors_stripe_customer_idx" ON "donors" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "donors_airtable_idx" ON "donors" USING btree ("airtable_id");--> statement-breakpoint
CREATE INDEX "donors_drip_next_send_idx" ON "donors" USING btree ("drip_next_send");--> statement-breakpoint
CREATE INDEX "fulfillments_order_number_idx" ON "fulfillments" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "fulfillments_buyer_email_idx" ON "fulfillments" USING btree (lower("buyer_email"));--> statement-breakpoint
CREATE INDEX "fulfillments_production_idx" ON "fulfillments" USING btree ("production");--> statement-breakpoint
CREATE INDEX "fulfillments_shipping_idx" ON "fulfillments" USING btree ("shipping");--> statement-breakpoint
CREATE INDEX "fulfillments_airtable_idx" ON "fulfillments" USING btree ("airtable_id");--> statement-breakpoint
CREATE UNIQUE INDEX "id_mapping_lookup_idx" ON "id_mapping" USING btree ("table_name","airtable_id");--> statement-breakpoint
CREATE INDEX "id_mapping_reverse_idx" ON "id_mapping" USING btree ("table_name","postgres_id");--> statement-breakpoint
CREATE INDEX "newsletters_status_idx" ON "newsletters" USING btree ("status");--> statement-breakpoint
CREATE INDEX "newsletters_published_at_idx" ON "newsletters" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "newsletters_airtable_idx" ON "newsletters" USING btree ("airtable_id");--> statement-breakpoint
CREATE INDEX "scheduled_posts_status_idx" ON "scheduled_posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "scheduled_posts_scheduled_at_idx" ON "scheduled_posts" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "scheduled_posts_airtable_idx" ON "scheduled_posts" USING btree ("airtable_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsorships_sponsor_code_idx" ON "sponsorships" USING btree ("sponsor_code");--> statement-breakpoint
CREATE INDEX "sponsorships_sponsor_email_lower_idx" ON "sponsorships" USING btree (lower("sponsor_email"));--> statement-breakpoint
CREATE INDEX "sponsorships_stripe_sub_idx" ON "sponsorships" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "sponsorships_child_id_idx" ON "sponsorships" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "sponsorships_child_id_legacy_idx" ON "sponsorships" USING btree ("child_id_legacy");--> statement-breakpoint
CREATE INDEX "sponsorships_status_idx" ON "sponsorships" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sponsorships_airtable_idx" ON "sponsorships" USING btree ("airtable_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_stripe_sub_idx" ON "subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "subscriptions_donor_idx" ON "subscriptions" USING btree ("donor_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscriptions_airtable_idx" ON "subscriptions" USING btree ("airtable_id");