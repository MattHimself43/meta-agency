-- AgencyOS security layer
-- * Row Level Security on every public table.
-- * Staff access requires a signed-in user whose profile role is owner/account_manager
--   AND whose session is two-factor verified (JWT aal = 'aal2').
-- * Billing, settings, integrations, AI cost and payments are owner-only.
-- * The anon role (public internet) gets nothing: the client portal, /book and share links
--   go through server routes that check hashed tokens and use the server connection.
-- * audit_log is append-only (UPDATE/DELETE/TRUNCATE raise an error).
--
-- Note: the Next.js server talks to Postgres via DATABASE_URL (postgres role), which bypasses RLS.
-- Authorisation for those calls is enforced in lib/auth (requireStaff / requireOwner).
-- RLS protects the Supabase Data API (anon key in the browser) from ever reading agency data.

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.app_role() RETURNS public.user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()), 'none'::public.user_role)
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.is_mfa_verified() RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.is_staff() RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT public.app_role() IN ('owner', 'account_manager') AND public.is_mfa_verified()
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.is_owner() RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT public.app_role() = 'owner' AND public.is_mfa_verified()
$$;
--> statement-breakpoint

-- updated_at maintenance on every table that has the column
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;
--> statement-breakpoint
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.column_name = 'updated_at'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t.table_name || '_touch', t.table_name);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()',
                   t.table_name || '_touch', t.table_name);
  END LOOP;
END $$;
--> statement-breakpoint

-- Append-only audit log
CREATE OR REPLACE FUNCTION public.audit_log_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (% blocked)', TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_immutable();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON public.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.audit_log_immutable();
--> statement-breakpoint

-- Enable RLS everywhere and strip anon
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '\_\_%' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t.tablename);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint

-- Staff tables: owner + account manager (2FA verified) get full CRUD
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'niches','message_templates','packages','leads','clients','activities','bookings',
    'sequences','sequence_steps','messages','audits','call_briefs','proposals',
    'onboarding_steps','agreements','assets','campaign_plans','creatives','performance_daily',
    'recommendations','reports','approvals','routines','routine_runs','alerts','time_entries'
  ] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff())',
                   t || '_staff_all', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Owner-only tables (billing, settings, cost, integrations metadata)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['settings','invoices','invoice_lines','payments','expenses','ai_usage'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner())',
                   t || '_owner_all', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Profiles: everyone reads their own row; owner manages all
CREATE POLICY profiles_self_read ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
--> statement-breakpoint
CREATE POLICY profiles_owner_all ON public.profiles FOR ALL TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());
--> statement-breakpoint

-- Audit log: owner reads; staff may append; nobody updates/deletes
CREATE POLICY audit_log_owner_read ON public.audit_log FOR SELECT TO authenticated USING (public.is_owner());
--> statement-breakpoint
CREATE POLICY audit_log_staff_insert ON public.audit_log FOR INSERT TO authenticated WITH CHECK (public.is_staff());
--> statement-breakpoint

-- Server-only tables: no Data API access at all (no policies => deny), and revoke grants.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.integrations, public.jobs, public.rate_limits FROM authenticated;
  END IF;
END $$;
--> statement-breakpoint

-- New Supabase auth users get a profile with no access. Promote the owner with
--   npm run seed -- --owner you@example.com   (or SQL in README).
CREATE OR REPLACE FUNCTION public.handle_new_auth_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role) VALUES (NEW.id, coalesce(NEW.email, ''), 'none')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
--> statement-breakpoint
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
--> statement-breakpoint

-- Singleton settings row
INSERT INTO public.settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
