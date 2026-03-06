-- Run this in Supabase SQL Editor to set up GHL OAuth tables

-- 1. Add ghl_token column to existing table (if not already done)
ALTER TABLE client_ghl_locations ADD COLUMN IF NOT EXISTS ghl_token text;

-- 2. Create OAuth tokens table for storing agency-level tokens
CREATE TABLE IF NOT EXISTS ghl_oauth_tokens (
    id serial primary key,
    company_id text unique not null,
    access_token text not null,
    refresh_token text not null,
    expires_at timestamp with time zone not null,
    user_type text default 'Company',
    location_id text,
    updated_at timestamp with time zone default now()
);

-- 3. Enable RLS with open access (same as other tables)
ALTER TABLE ghl_oauth_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON ghl_oauth_tokens FOR ALL USING (true) WITH CHECK (true);

-- 4. Ensure client_ghl_locations also has open RLS
ALTER TABLE client_ghl_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access" ON client_ghl_locations;
CREATE POLICY "Allow all access" ON client_ghl_locations FOR ALL USING (true) WITH CHECK (true);
