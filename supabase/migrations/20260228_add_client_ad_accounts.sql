-- Migration: Add client_ad_accounts table for Meta ads integration
-- Maps client names to their Meta ad account IDs

CREATE TABLE client_ad_accounts (
  id SERIAL PRIMARY KEY,
  client_name TEXT UNIQUE NOT NULL,
  meta_ad_account_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE client_ad_accounts ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read/write mappings
CREATE POLICY "Authenticated users can read ad account mappings"
  ON client_ad_accounts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert ad account mappings"
  ON client_ad_accounts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update ad account mappings"
  ON client_ad_accounts FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete ad account mappings"
  ON client_ad_accounts FOR DELETE
  TO authenticated
  USING (true);
