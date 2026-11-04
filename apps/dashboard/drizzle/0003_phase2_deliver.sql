CREATE TABLE "budget_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_plan_id" uuid NOT NULL,
	"old_budget_usd_cents" bigint NOT NULL,
	"new_budget_usd_cents" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"approval_id" uuid,
	"requested_by" text DEFAULT 'user' NOT NULL,
	"applied_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "stored_files" (
	"path" text PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"data" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_plans" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "campaign_plans" ADD COLUMN "launched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_plans" ADD COLUMN "launched_by" uuid;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "intake" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "brand_colours" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "page_url" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "instagram_handle" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "reminders_sent" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_changes" ADD CONSTRAINT "budget_changes_campaign_plan_id_campaign_plans_id_fk" FOREIGN KEY ("campaign_plan_id") REFERENCES "public"."campaign_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_changes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "stored_files" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.budget_changes, public.stored_files FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON public.stored_files FROM authenticated; END IF;
END $$;
--> statement-breakpoint
CREATE POLICY budget_changes_owner_all ON public.budget_changes FOR ALL TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());
--> statement-breakpoint
CREATE TRIGGER budget_changes_touch BEFORE UPDATE ON public.budget_changes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
