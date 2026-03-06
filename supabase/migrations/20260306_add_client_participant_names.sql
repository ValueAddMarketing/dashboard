-- Table to store participant name -> client mappings (learned from manual assignments)
CREATE TABLE IF NOT EXISTS client_participant_names (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  participant_name text NOT NULL,
  client_name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(participant_name, client_name)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_client_participant_names_name ON client_participant_names (participant_name);

-- Enable RLS
ALTER TABLE client_participant_names ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read/write
CREATE POLICY "Allow all access to client_participant_names" ON client_participant_names
  FOR ALL USING (true) WITH CHECK (true);
