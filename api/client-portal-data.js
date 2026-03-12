import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ecmhhonjazfbletyvncw.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjbWhob25qYXpmYmxldHl2bmN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5NDMwMjYsImV4cCI6MjA4MTUxOTAyNn0.3LZ8dAOX_ZpoUNkgY_jSeC10SaCknfPfBaZsDRjFt7c';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Generate a random 8-char alphanumeric code
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { action, access_code, client_name, client_names } = req.body;

    // ── Auth: Verify access code ──
    if (action === 'verify') {
      if (!access_code) return res.status(400).json({ error: 'Access code required' });

      const { data, error } = await supabase
        .from('client_portal_access')
        .select('*')
        .eq('access_code', access_code.trim())
        .eq('is_active', true)
        .single();

      if (error || !data) return res.status(401).json({ error: 'Invalid access code' });

      // Update last login
      await supabase.from('client_portal_access').update({ last_login: new Date().toISOString() }).eq('id', data.id);

      return res.status(200).json({ client_name: data.client_name, email: data.email });
    }

    // ── Fetch client data ──
    if (action === 'getData') {
      if (!access_code || !client_name) return res.status(400).json({ error: 'Missing params' });

      // Re-verify access
      const { data: auth } = await supabase
        .from('client_portal_access')
        .select('client_name')
        .eq('access_code', access_code.trim())
        .eq('is_active', true)
        .single();

      if (!auth || auth.client_name !== client_name) return res.status(401).json({ error: 'Unauthorized' });

      // Fetch meeting notes for this client (last 90 days)
      const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
      const { data: meetings } = await supabase
        .from('meeting_notes')
        .select('id, client_name, meeting_date, meeting_type, summary, ad_performance_notes, client_sentiment, risk_level, action_items, key_points, next_steps')
        .eq('client_name', client_name)
        .gte('meeting_date', ninetyDaysAgo)
        .order('meeting_date', { ascending: false })
        .limit(20);

      // Fetch important notes
      const { data: notes } = await supabase
        .from('client_notes')
        .select('id, note_text, created_at, is_important, source')
        .eq('client_name', client_name)
        .order('created_at', { ascending: false })
        .limit(20);

      // Fetch activity log
      const { data: activity } = await supabase
        .from('activity_log')
        .select('id, action, details, created_at, user_email')
        .eq('client_name', client_name)
        .order('created_at', { ascending: false })
        .limit(15);

      return res.status(200).json({
        meetings: meetings || [],
        notes: notes || [],
        activity: activity || [],
      });
    }

    // ── Bulk-generate portal access for all clients ──
    if (action === 'bulkGenerate') {
      if (!client_names || !Array.isArray(client_names) || client_names.length === 0) {
        return res.status(400).json({ error: 'client_names array required' });
      }

      // Get existing portal entries
      const { data: existing } = await supabase
        .from('client_portal_access')
        .select('client_name, access_code, is_active');

      const existingMap = {};
      (existing || []).forEach(e => { existingMap[e.client_name.toLowerCase().trim()] = e; });

      const created = [];
      const skipped = [];
      const toInsert = [];

      for (const name of client_names) {
        const trimmed = name.trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (existingMap[key]) {
          skipped.push({ client_name: trimmed, access_code: existingMap[key].access_code, status: 'already_exists' });
        } else {
          const code = generateCode();
          toInsert.push({ client_name: trimmed, access_code: code, is_active: true });
          created.push({ client_name: trimmed, access_code: code, status: 'created' });
        }
      }

      if (toInsert.length > 0) {
        const { error: insertErr } = await supabase
          .from('client_portal_access')
          .insert(toInsert);
        if (insertErr) return res.status(500).json({ error: 'Insert failed: ' + insertErr.message });
      }

      return res.status(200).json({ created: created.length, skipped: skipped.length, results: [...created, ...skipped] });
    }

    // ── List all portal links ──
    if (action === 'listPortals') {
      const { data, error } = await supabase
        .from('client_portal_access')
        .select('id, client_name, access_code, email, is_active, last_login, created_at')
        .order('client_name', { ascending: true });

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ portals: data || [] });
    }

    // ── Toggle portal active status ──
    if (action === 'togglePortal') {
      if (!access_code) return res.status(400).json({ error: 'access_code required' });
      const { data: current } = await supabase
        .from('client_portal_access')
        .select('id, is_active')
        .eq('access_code', access_code)
        .single();
      if (!current) return res.status(404).json({ error: 'Not found' });
      const { error: upErr } = await supabase
        .from('client_portal_access')
        .update({ is_active: !current.is_active })
        .eq('id', current.id);
      if (upErr) return res.status(500).json({ error: upErr.message });
      return res.status(200).json({ success: true, is_active: !current.is_active });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('client-portal-data error:', err);
    return res.status(500).json({ error: err.message });
  }
}
