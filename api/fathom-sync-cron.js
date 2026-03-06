import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ecmhhonjazfbletyvncw.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjbWhob25qYXpmYmxldHl2bmN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5NDMwMjYsImV4cCI6MjA4MTUxOTAyNn0.3LZ8dAOX_ZpoUNkgY_jSeC10SaCknfPfBaZsDRjFt7c';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default async function handler(req, res) {
  // Allow GET (Vercel cron) and POST
  try {
    // Call the ingest-fathom edge function with a 2-hour lookback
    const createdAfter = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase.functions.invoke('ingest-fathom', {
      body: { created_after: createdAfter }
    });

    if (error) {
      console.error('Fathom auto-sync error:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log('Fathom auto-sync result:', data);
    return res.status(200).json({ success: true, result: data, synced_at: new Date().toISOString() });
  } catch (err) {
    console.error('Fathom auto-sync error:', err);
    return res.status(500).json({ error: err.message });
  }
}
