-- ============================================================
-- Fathom Notetaker Integration Tables
-- Adds tables for syncing meetings from Fathom API and
-- mapping email domains to client names for auto-matching.
-- ============================================================

-- Table: client_email_domains
-- Maps email domains (or full emails) to client names so
-- Fathom meetings can be auto-assigned to the right client.
CREATE TABLE IF NOT EXISTS client_email_domains (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  domain text NOT NULL,                     -- e.g. "acmecorp.com" or "john@acmecorp.com"
  client_name text NOT NULL,                -- must match client name in dashboard
  created_at timestamptz DEFAULT now(),
  created_by text,                          -- email of user who created mapping
  UNIQUE(domain, client_name)
);

-- Table: fathom_sync_log
-- Tracks each sync run (poll or webhook) for debugging and
-- preventing duplicate imports.
CREATE TABLE IF NOT EXISTS fathom_sync_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  fathom_recording_id text NOT NULL UNIQUE, -- Fathom's recording ID (prevents duplicates)
  client_name text,                         -- matched client (null if unmatched)
  meeting_note_id uuid,                     -- FK to meeting_notes if successfully saved
  status text NOT NULL DEFAULT 'pending',   -- pending | processed | failed | unmatched
  fathom_title text,                        -- original title from Fathom
  fathom_url text,                          -- link back to Fathom recording
  error_message text,                       -- error details if failed
  synced_at timestamptz DEFAULT now(),
  processed_at timestamptz
);

-- Add source column to meeting_notes so we can distinguish
-- manual vs Fathom-imported meetings in the UI.
ALTER TABLE meeting_notes
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';
  -- values: 'manual', 'fathom', 'fathom_webhook'

ALTER TABLE meeting_notes
  ADD COLUMN IF NOT EXISTS external_id text;
  -- Fathom recording ID for dedup

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_fathom_sync_recording
  ON fathom_sync_log(fathom_recording_id);

CREATE INDEX IF NOT EXISTS idx_client_email_domains_domain
  ON client_email_domains(domain);

CREATE INDEX IF NOT EXISTS idx_meeting_notes_external_id
  ON meeting_notes(external_id);

-- Enable RLS (Row Level Security) - permissive for now
ALTER TABLE client_email_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE fathom_sync_log ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access
-- (DROP first to make migration re-runnable; CREATE POLICY IF NOT EXISTS is not valid PostgreSQL)
DROP POLICY IF EXISTS "Authenticated users can manage email domains" ON client_email_domains;
CREATE POLICY "Authenticated users can manage email domains"
  ON client_email_domains FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can view sync log" ON fathom_sync_log;
CREATE POLICY "Authenticated users can view sync log"
  ON fathom_sync_log FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
