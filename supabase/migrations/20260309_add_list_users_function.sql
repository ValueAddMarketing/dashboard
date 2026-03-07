-- Create a function to list auth users (accessible only to authenticated users)
CREATE OR REPLACE FUNCTION public.list_auth_users()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT
    u.id,
    u.email::text,
    COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')::text as full_name,
    u.created_at,
    u.last_sign_in_at,
    u.email_confirmed_at
  FROM auth.users u
  ORDER BY u.created_at DESC;
$$;

-- Only authenticated users can call this function
REVOKE ALL ON FUNCTION public.list_auth_users() FROM anon;
GRANT EXECUTE ON FUNCTION public.list_auth_users() TO authenticated;
