CREATE TABLE "saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page" text DEFAULT 'leads' NOT NULL,
	"name" text NOT NULL,
	"query" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "call_brief_id" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "source" text DEFAULT 'book_page' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "signals" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "facts" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "sequence_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "sequence_stopped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "sequence_stop_reason" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "last_contacted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "step_order" smallint;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "classification" text;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."sequences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.saved_views FROM anon; END IF;
END $$;
--> statement-breakpoint
CREATE POLICY saved_views_staff_all ON public.saved_views FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
--> statement-breakpoint
CREATE TRIGGER saved_views_touch BEFORE UPDATE ON public.saved_views FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
