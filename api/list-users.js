// api/list-users.js — Lists all registered Supabase Auth users
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ecmhhonjazfbletyvncw.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjbWhob25qYXpmYmxldHl2bmN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5NDMwMjYsImV4cCI6MjA4MTUxOTAyNn0.3LZ8dAOX_ZpoUNkgY_jSeC10SaCknfPfBaZsDRjFt7c';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (error) return res.status(500).json({ error: error.message });

    const users = (data?.users || []).map(u => ({
      id: u.id,
      email: u.email,
      full_name: u.user_metadata?.full_name || u.user_metadata?.name || '',
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      email_confirmed_at: u.email_confirmed_at,
    }));

    return res.status(200).json({ users });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
