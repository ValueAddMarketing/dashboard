-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant usage
GRANT USAGE ON SCHEMA cron TO postgres;

-- Schedule Fathom auto-sync every hour at :00
-- Uses pg_net to call the ingest-fathom edge function with 2-hour lookback
SELECT cron.schedule(
  'fathom-auto-sync',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ecmhhonjazfbletyvncw.supabase.co/functions/v1/ingest-fathom',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjbWhob25qYXpmYmxldHl2bmN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5NDMwMjYsImV4cCI6MjA4MTUxOTAyNn0.3LZ8dAOX_ZpoUNkgY_jSeC10SaCknfPfBaZsDRjFt7c"}'::jsonb,
    body := jsonb_build_object('created_after', to_char(now() - interval '2 hours', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
  );
  $$
);
