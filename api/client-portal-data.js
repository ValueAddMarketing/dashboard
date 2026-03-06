import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ecmhhonjazfbletyvncw.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { action, access_code, client_name } = req.body;

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

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('client-portal-data error:', err);
    return res.status(500).json({ error: err.message });
  }
}
