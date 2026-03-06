-- Client portal access tokens for client-facing dashboard
CREATE TABLE IF NOT EXISTS client_portal_access (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name text NOT NULL,
  access_code text NOT NULL UNIQUE,
  email text,
  is_active boolean DEFAULT true,
  last_login timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_portal_access_code ON client_portal_access (access_code);
CREATE INDEX IF NOT EXISTS idx_client_portal_access_client ON client_portal_access (client_name);

ALTER TABLE client_portal_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to client_portal_access" ON client_portal_access
  FOR ALL USING (true) WITH CHECK (true);
