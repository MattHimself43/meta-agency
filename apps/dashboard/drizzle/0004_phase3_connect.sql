CREATE TABLE "client_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"date" date NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"value_ttd_cents" bigint,
	"note" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "creative_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"source_asset_id" uuid,
	"provider" text DEFAULT 'higgsfield' NOT NULL,
	"model" text NOT NULL,
	"format" text NOT NULL,
	"prompt" text NOT NULL,
	"request_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"output_asset_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"polls" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"meta_lead_id" text NOT NULL,
	"form_id" text,
	"form_name" text,
	"ad_name" text,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_time" timestamp with time zone,
	"status" text DEFAULT 'new' NOT NULL,
	"note" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"provider" text DEFAULT 'wipay' NOT NULL,
	"environment" text NOT NULL,
	"order_id" text NOT NULL,
	"total_sent" text NOT NULL,
	"currency" "currency" DEFAULT 'TTD' NOT NULL,
	"checkout_url" text,
	"transaction_id" text,
	"status" text DEFAULT 'created' NOT NULL,
	"response" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "team_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" DEFAULT 'account_manager' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invited_by" uuid,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
ALTER TABLE "creatives" ADD COLUMN "winner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "creatives" ADD COLUMN "winner_note" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "pay_token_hash" text;--> statement-breakpoint
ALTER TABLE "client_sales" ADD CONSTRAINT "client_sales_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_generations" ADD CONSTRAINT "creative_generations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_generations" ADD CONSTRAINT "creative_generations_source_asset_id_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_leads" ADD CONSTRAINT "meta_leads_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_sales_client_idx" ON "client_sales" USING btree ("client_id","date");--> statement-breakpoint
CREATE INDEX "creative_generations_client_idx" ON "creative_generations" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_leads_meta_id_key" ON "meta_leads" USING btree ("meta_lead_id");--> statement-breakpoint
CREATE INDEX "meta_leads_client_idx" ON "meta_leads" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_order_key" ON "payment_attempts" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payment_attempts_invoice_idx" ON "payment_attempts" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_invites_email_key" ON "team_invites" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_pay_token_hash_key" ON "invoices" USING btree ("pay_token_hash");--> statement-breakpoint
ALTER TABLE "client_sales" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "creative_generations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "meta_leads" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payment_attempts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "team_invites" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.client_sales, public.creative_generations, public.meta_leads, public.payment_attempts, public.team_invites FROM anon;
  END IF;
END $$;
--> statement-breakpoint
CREATE POLICY client_sales_staff_all ON public.client_sales FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
--> statement-breakpoint
CREATE POLICY creative_generations_staff_all ON public.creative_generations FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
--> statement-breakpoint
CREATE POLICY meta_leads_staff_all ON public.meta_leads FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
--> statement-breakpoint
CREATE POLICY payment_attempts_owner_all ON public.payment_attempts FOR ALL TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());
--> statement-breakpoint
CREATE POLICY team_invites_owner_all ON public.team_invites FOR ALL TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());
--> statement-breakpoint
CREATE TRIGGER client_sales_touch BEFORE UPDATE ON public.client_sales FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER creative_generations_touch BEFORE UPDATE ON public.creative_generations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER meta_leads_touch BEFORE UPDATE ON public.meta_leads FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER payment_attempts_touch BEFORE UPDATE ON public.payment_attempts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER team_invites_touch BEFORE UPDATE ON public.team_invites FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
