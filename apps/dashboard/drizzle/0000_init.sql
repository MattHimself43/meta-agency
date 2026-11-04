CREATE TYPE "public"."activity_type" AS ENUM('message_draft', 'message_sent', 'reply', 'call', 'note', 'file', 'stage_change');--> statement-breakpoint
CREATE TYPE "public"."alert_severity" AS ENUM('info', 'warning', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected', 'auto_approved', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('booked', 'cancelled', 'completed', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'approved', 'built_paused', 'live', 'paused');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('whatsapp', 'email', 'dm', 'phone', 'portal', 'other');--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('onboarding', 'active', 'paused', 'churned');--> statement-breakpoint
CREATE TYPE "public"."creative_format" AS ENUM('1:1', '4:5', '9:16');--> statement-breakpoint
CREATE TYPE "public"."creative_status" AS ENUM('draft', 'starred', 'client_review', 'approved', 'rejected', 'live', 'fatigued');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('USD', 'TTD');--> statement-breakpoint
CREATE TYPE "public"."doc_status" AS ENUM('draft', 'approved', 'sent', 'archived');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('connected', 'expired', 'not_set_up', 'disabled', 'error');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'approved', 'sent', 'paid', 'overdue', 'void');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."lead_stage" AS ENUM('new', 'contacted', 'replied', 'call_booked', 'proposal_sent', 'won', 'lost', 'nurture');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('draft', 'approved', 'sent', 'replied', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."recommendation_status" AS ENUM('open', 'approved', 'rejected', 'applied', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."recommendation_type" AS ENUM('pause_ad', 'shift_budget', 'new_creative', 'raise_budget', 'lower_budget');--> statement-breakpoint
CREATE TYPE "public"."report_type" AS ENUM('weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'succeeded', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."step_status" AS ENUM('pending', 'in_progress', 'done', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'account_manager', 'none');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"client_id" uuid,
	"type" "activity_type" NOT NULL,
	"channel" "channel",
	"body" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "activities_subject" CHECK ("activities"."lead_id" is not null or "activities"."client_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"version" text DEFAULT 'v1' NOT NULL,
	"pdf_path" text,
	"signed_pdf_path" text,
	"signature_name" text,
	"signature_image_path" text,
	"signed_at" timestamp with time zone,
	"signed_ip" "inet",
	"signed_user_agent" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" text NOT NULL,
	"prompt_key" text NOT NULL,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd_micros" bigint DEFAULT 0 NOT NULL,
	"input_snapshot" jsonb,
	"output" jsonb,
	"ok" boolean DEFAULT true NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"severity" "alert_severity" DEFAULT 'warning' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"dedupe_key" text,
	"resolved_at" timestamp with time zone,
	"emailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_type" text NOT NULL,
	"subject_table" text,
	"subject_id" uuid,
	"title" text NOT NULL,
	"summary" text,
	"preview" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"risk_level" "risk_level" DEFAULT 'medium' NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"requested_by" text DEFAULT 'system' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"dedupe_key" text,
	"expires_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"type" text NOT NULL,
	"mime_type" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"uploaded_via" text DEFAULT 'dashboard' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_table" text,
	"entity_id" text,
	"approval_id" uuid,
	"approved_by" uuid,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" "inet"
);
--> statement-breakpoint
CREATE TABLE "audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pdf_path" text,
	"share_token_hash" text,
	"status" "doc_status" DEFAULT 'draft' NOT NULL,
	"ai_run_id" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"business_name" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "booking_status" DEFAULT 'booked' NOT NULL,
	"notes" text,
	"external_event_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "call_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pdf_path" text,
	"share_token_hash" text,
	"status" "doc_status" DEFAULT 'draft' NOT NULL,
	"ai_run_id" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "campaign_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"template" text NOT NULL,
	"objective" text NOT NULL,
	"audiences" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"locations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"placements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"budget_type" text DEFAULT 'daily' NOT NULL,
	"budget_usd_cents" bigint DEFAULT 0 NOT NULL,
	"schedule" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"special_ad_category" text,
	"special_ad_category_confirmed" boolean DEFAULT false NOT NULL,
	"ads" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"meta_campaign_id" text,
	"meta_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"niche_id" uuid,
	"name" text NOT NULL,
	"contact_name" text,
	"whatsapp" text,
	"email" text,
	"package_id" uuid,
	"start_date" date,
	"contract_end" date,
	"status" "client_status" DEFAULT 'onboarding' NOT NULL,
	"portal_token_hash" text,
	"portal_token_rotated_at" timestamp with time zone,
	"meta_business_id" text,
	"ad_account_id" text,
	"page_id" text,
	"pixel_id" text,
	"monthly_budget_usd_cents" bigint,
	"kpi_targets" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"health_score" smallint,
	"setup_fee_waived" boolean DEFAULT false NOT NULL,
	"last_contact_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "creatives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"campaign_plan_id" uuid,
	"format" "creative_format" DEFAULT '1:1' NOT NULL,
	"hook" text,
	"primary_text" text,
	"headline" text,
	"cta" text,
	"media_path" text,
	"status" "creative_status" DEFAULT 'draft' NOT NULL,
	"honesty_check" jsonb,
	"honesty_override_reason" text,
	"client_comment" text,
	"meta_ad_id" text,
	"ai_run_id" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"amount_cents" bigint NOT NULL,
	"currency" "currency" DEFAULT 'TTD' NOT NULL,
	"receipt_path" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"status" "integration_status" DEFAULT 'not_set_up' NOT NULL,
	"encrypted_token" text,
	"token_expires_at" timestamp with time zone,
	"account_label" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(10, 2) DEFAULT '1' NOT NULL,
	"unit_cents" bigint NOT NULL,
	"amount_cents" bigint NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"number" text,
	"kind" text DEFAULT 'monthly' NOT NULL,
	"period_key" text NOT NULL,
	"currency" "currency" DEFAULT 'TTD' NOT NULL,
	"issue_date" date,
	"due_date" date,
	"subtotal_cents" bigint DEFAULT 0 NOT NULL,
	"vat_cents" bigint DEFAULT 0 NOT NULL,
	"total_cents" bigint DEFAULT 0 NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"agency_snapshot" jsonb,
	"client_snapshot" jsonb,
	"pdf_path" text,
	"payment_link" text,
	"sent_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"max_attempts" smallint DEFAULT 2 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"result" jsonb,
	"error" text,
	"dedupe_key" text,
	"routine_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_name" text NOT NULL,
	"niche_id" uuid,
	"area" text,
	"contact_name" text,
	"phone" text,
	"phone_normalized" text,
	"whatsapp" text,
	"email" text,
	"facebook_url" text,
	"instagram_url" text,
	"website" text,
	"maps_url" text,
	"source" text,
	"source_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"runs_meta_ads" boolean,
	"ad_count" integer,
	"ad_notes" text,
	"ad_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fit_score" smallint,
	"fit_score_override" smallint,
	"score_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stage" "lead_stage" DEFAULT 'new' NOT NULL,
	"next_action" text,
	"next_action_due" timestamp with time zone,
	"do_not_contact" boolean DEFAULT false NOT NULL,
	"lost_reason" text,
	"estimated_value_cents" bigint,
	"estimated_value_currency" "currency" DEFAULT 'TTD' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "leads_fit_score_range" CHECK ("leads"."fit_score" is null or ("leads"."fit_score" between 1 and 10)),
	CONSTRAINT "leads_fit_score_override_range" CHECK ("leads"."fit_score_override" is null or ("leads"."fit_score_override" between 1 and 10))
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"niche_id" uuid,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"channel" "channel" NOT NULL,
	"purpose" text NOT NULL,
	"body" text NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"client_id" uuid,
	"channel" "channel" NOT NULL,
	"purpose" text NOT NULL,
	"sequence_step_id" uuid,
	"template_id" uuid,
	"variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"chosen_variant" smallint,
	"body" text,
	"subject" text,
	"status" "message_status" DEFAULT 'draft' NOT NULL,
	"due_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"dedupe_key" text,
	"ai_run_id" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "niches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"scoring_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kpi_targets" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"intake_schema" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"campaign_templates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "onboarding_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"step_key" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"owner_only" boolean DEFAULT false NOT NULL,
	"status" "step_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"recommended" boolean DEFAULT false NOT NULL,
	"setup_fee_cents" bigint NOT NULL,
	"monthly_fee_cents" bigint NOT NULL,
	"currency" "currency" DEFAULT 'TTD' NOT NULL,
	"includes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recommended_spend" text,
	"terms" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" "currency" DEFAULT 'TTD' NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider_payload" jsonb,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "performance_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"campaign_plan_id" uuid,
	"campaign_name" text,
	"ad_set_name" text,
	"ad_name" text,
	"meta_campaign_id" text,
	"meta_ad_set_id" text,
	"meta_ad_id" text,
	"date" date NOT NULL,
	"spend_usd_cents" bigint DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"reach" integer DEFAULT 0 NOT NULL,
	"frequency" numeric(8, 3),
	"clicks" integer DEFAULT 0 NOT NULL,
	"ctr" numeric(8, 4),
	"leads" integer DEFAULT 0 NOT NULL,
	"whatsapp_conversations" integer DEFAULT 0 NOT NULL,
	"cost_per_result_usd_cents" bigint,
	"source" text DEFAULT 'csv' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"role" "user_role" DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pdf_path" text,
	"share_token_hash" text,
	"status" "doc_status" DEFAULT 'draft' NOT NULL,
	"ai_run_id" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"campaign_plan_id" uuid,
	"type" "recommendation_type" NOT NULL,
	"reasoning" text NOT NULL,
	"expected_impact" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "recommendation_status" DEFAULT 'open' NOT NULL,
	"dedupe_key" text,
	"ai_run_id" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"type" "report_type" NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pdf_path" text,
	"share_token_hash" text,
	"status" "doc_status" DEFAULT 'draft' NOT NULL,
	"ai_run_id" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "routine_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"routine_id" uuid NOT NULL,
	"scheduled_for" timestamp with time zone,
	"trigger" text DEFAULT 'schedule' NOT NULL,
	"attempt" smallint DEFAULT 1 NOT NULL,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"output" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"digest_line" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "routines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"cron" text NOT NULL,
	"timezone" text DEFAULT 'America/Port_of_Spain' NOT NULL,
	"every_n_weeks" smallint DEFAULT 1 NOT NULL,
	"anchor_date" date,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_scheduled_for" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_status" "run_status",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "sequence_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence_id" uuid NOT NULL,
	"step_order" smallint NOT NULL,
	"day_offset" smallint NOT NULL,
	"channel" "channel" NOT NULL,
	"purpose" text NOT NULL,
	"template_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"niche_id" uuid,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"agency_name" text DEFAULT '[Agency name]' NOT NULL,
	"logo_path" text,
	"owner_name" text DEFAULT 'Matthias' NOT NULL,
	"owner_email" text,
	"owner_whatsapp" text,
	"address_lines" jsonb DEFAULT '["[Street address]", "[Town]", "Trinidad and Tobago"]'::jsonb NOT NULL,
	"registration_number" text DEFAULT '[Registration no. pending]' NOT NULL,
	"vat_number" text,
	"bank_details" jsonb DEFAULT '{"bank":"[Bank]","accountName":"[Account name]","accountNumber":"[Account number]","branch":"[Branch]","accountType":"[Chequing/Savings]"}'::jsonb NOT NULL,
	"invoice_prefix" text DEFAULT 'INV-' NOT NULL,
	"next_invoice_number" integer DEFAULT 1 NOT NULL,
	"vat_enabled" boolean DEFAULT false NOT NULL,
	"vat_rate_bps" integer DEFAULT 1250 NOT NULL,
	"invoice_due_days" integer DEFAULT 7 NOT NULL,
	"exchange_rate" numeric(10, 4) DEFAULT '6.8000' NOT NULL,
	"timezone" text DEFAULT 'America/Port_of_Spain' NOT NULL,
	"send_limits" jsonb DEFAULT '{"whatsapp":10,"email":20,"dm":10}'::jsonb NOT NULL,
	"auto_approve_rules" jsonb DEFAULT '{"followup_day3":false,"followup_day7":false}'::jsonb NOT NULL,
	"budget_change_limit_cents" integer DEFAULT 2000 NOT NULL,
	"founding_offer_enabled" boolean DEFAULT true NOT NULL,
	"founding_offer_slots" integer DEFAULT 3 NOT NULL,
	"availability" jsonb DEFAULT '{"1":[{"start":"10:00","end":"16:00"}],"2":[{"start":"10:00","end":"16:00"}],"3":[{"start":"10:00","end":"16:00"}],"4":[{"start":"10:00","end":"16:00"}],"5":[{"start":"10:00","end":"14:00"}]}'::jsonb NOT NULL,
	"digest_email" text,
	"feature_flags" jsonb DEFAULT '{"meta_api":false,"gmail":false,"google_calendar":false,"higgsfield":false,"wipay":false,"team_seats":false}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "settings_singleton" CHECK ("settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"minutes" integer NOT NULL,
	"category" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_briefs" ADD CONSTRAINT "call_briefs_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_plans" ADD CONSTRAINT "campaign_plans_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_niche_id_niches_id_fk" FOREIGN KEY ("niche_id") REFERENCES "public"."niches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creatives" ADD CONSTRAINT "creatives_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creatives" ADD CONSTRAINT "creatives_campaign_plan_id_campaign_plans_id_fk" FOREIGN KEY ("campaign_plan_id") REFERENCES "public"."campaign_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_routine_run_id_routine_runs_id_fk" FOREIGN KEY ("routine_run_id") REFERENCES "public"."routine_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_niche_id_niches_id_fk" FOREIGN KEY ("niche_id") REFERENCES "public"."niches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_niche_id_niches_id_fk" FOREIGN KEY ("niche_id") REFERENCES "public"."niches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sequence_step_id_sequence_steps_id_fk" FOREIGN KEY ("sequence_step_id") REFERENCES "public"."sequence_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_template_id_message_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_steps" ADD CONSTRAINT "onboarding_steps_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_daily" ADD CONSTRAINT "performance_daily_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_daily" ADD CONSTRAINT "performance_daily_campaign_plan_id_campaign_plans_id_fk" FOREIGN KEY ("campaign_plan_id") REFERENCES "public"."campaign_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_campaign_plan_id_campaign_plans_id_fk" FOREIGN KEY ("campaign_plan_id") REFERENCES "public"."campaign_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_runs" ADD CONSTRAINT "routine_runs_routine_id_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_steps" ADD CONSTRAINT "sequence_steps_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_steps" ADD CONSTRAINT "sequence_steps_template_id_message_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_niche_id_niches_id_fk" FOREIGN KEY ("niche_id") REFERENCES "public"."niches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_lead_idx" ON "activities" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "activities_client_idx" ON "activities" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "ai_usage_created_idx" ON "ai_usage" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_dedupe_key" ON "alerts" USING btree ("dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "approvals_dedupe_key" ON "approvals" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "approvals_status_idx" ON "approvals" USING btree ("status","risk_level","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_table","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_slot_key" ON "bookings" USING btree ("starts_at") WHERE status = 'booked';--> statement-breakpoint
CREATE UNIQUE INDEX "clients_portal_token_hash_key" ON "clients" USING btree ("portal_token_hash");--> statement-breakpoint
CREATE INDEX "clients_status_idx" ON "clients" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_provider_key" ON "integrations" USING btree ("provider");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_client_period_key" ON "invoices" USING btree ("client_id","period_key");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_dedupe_key" ON "jobs" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "jobs_queue_idx" ON "jobs" USING btree ("status","run_after");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_phone_normalized_key" ON "leads" USING btree ("phone_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_facebook_url_key" ON "leads" USING btree ("facebook_url");--> statement-breakpoint
CREATE INDEX "leads_stage_idx" ON "leads" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "leads_niche_idx" ON "leads" USING btree ("niche_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_dedupe_key" ON "messages" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "messages_status_due_idx" ON "messages" USING btree ("status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "niches_slug_key" ON "niches" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_steps_client_step_key" ON "onboarding_steps" USING btree ("client_id","step_key");--> statement-breakpoint
CREATE UNIQUE INDEX "packages_slug_key" ON "packages" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_method_reference_key" ON "payments" USING btree ("method","reference");--> statement-breakpoint
CREATE UNIQUE INDEX "performance_daily_row_key" ON "performance_daily" USING btree ("client_id","date","campaign_name","ad_set_name","ad_name");--> statement-breakpoint
CREATE INDEX "performance_daily_client_date_idx" ON "performance_daily" USING btree ("client_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "recommendations_dedupe_key" ON "recommendations" USING btree ("dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_client_period_key" ON "reports" USING btree ("client_id","type","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "routine_runs_occurrence_key" ON "routine_runs" USING btree ("routine_id","scheduled_for","attempt");--> statement-breakpoint
CREATE INDEX "routine_runs_routine_idx" ON "routine_runs" USING btree ("routine_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "routines_key_key" ON "routines" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "sequence_steps_order_key" ON "sequence_steps" USING btree ("sequence_id","step_order");