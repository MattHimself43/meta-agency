-- Vercel HOBBY plan: run the AgencyOS dispatcher every 15 minutes from Supabase.
-- (On Vercel Pro use the "crons" entry in vercel.json instead — see README. Don't run both.
--  Running both is safe — routines are claimed atomically — but wasteful.)
--
-- Run once in Supabase → SQL Editor, after replacing the two placeholder values.
-- The URL and secret are stored in Supabase Vault, not in the job text.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('https://app.YOURDOMAIN.com/api/cron/dispatch', 'agencyos_dispatch_url');
select vault.create_secret('PASTE-THE-SAME-CRON_SECRET-AS-VERCEL', 'agencyos_cron_secret');

-- pg_cron uses UTC, but */15 is the same in every timezone. Routine times (AST) are handled by the app.
select cron.schedule(
  'agencyos-dispatch',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'agencyos_dispatch_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'agencyos_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Check it:      select * from cron.job_run_details order by start_time desc limit 10;
--                select * from net._http_response order by created desc limit 10;
-- Remove it:     select cron.unschedule('agencyos-dispatch');
-- Rotate secret: select vault.update_secret((select id from vault.secrets where name = 'agencyos_cron_secret'), 'NEW-SECRET');
