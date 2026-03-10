// api/cashflow-overrides.js - CRUD for manual cashflow payment overrides
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ecmhhonjazfbletyvncw.supabase.co';
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

    if (!SUPABASE_KEY) return res.status(500).json({ error: 'Supabase key not configured' });

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { action } = req.body;

    // Auto-create table if it doesn't exist
    if (action === 'init') {
        try {
            const { error } = await supabase.rpc('exec_sql', {
                sql: `
                    CREATE TABLE IF NOT EXISTS cashflow_overrides (
                        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                        client_key TEXT NOT NULL,
                        client_name TEXT,
                        client_email TEXT,
                        year INTEGER NOT NULL,
                        month INTEGER NOT NULL,
                        amount NUMERIC DEFAULT 0,
                        notes TEXT,
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        updated_at TIMESTAMPTZ DEFAULT NOW(),
                        UNIQUE(client_key, year, month)
                    );
                    CREATE INDEX IF NOT EXISTS idx_cashflow_overrides_client ON cashflow_overrides(client_key);
                    CREATE INDEX IF NOT EXISTS idx_cashflow_overrides_year_month ON cashflow_overrides(year, month);
                `
            });
            if (error) {
                // Table might already exist or RPC not available — try a simple select to check
                const { error: selectErr } = await supabase.from('cashflow_overrides').select('id').limit(1);
                if (selectErr && selectErr.code === '42P01') {
                    return res.json({ ok: false, message: 'Table does not exist. Please create it in Supabase dashboard.', createSQL: `
CREATE TABLE cashflow_overrides (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_key TEXT NOT NULL,
    client_name TEXT,
    client_email TEXT,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    amount NUMERIC DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_key, year, month)
);
ALTER TABLE cashflow_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON cashflow_overrides FOR ALL USING (true) WITH CHECK (true);
                    ` });
                }
                return res.json({ ok: true, message: 'Table exists' });
            }
            return res.json({ ok: true });
        } catch (err) {
            return res.json({ ok: false, error: err.message });
        }
    }

    // Fetch all overrides
    if (action === 'fetchAll') {
        const { data, error } = await supabase
            .from('cashflow_overrides')
            .select('*')
            .order('client_key', { ascending: true });
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ overrides: data || [] });
    }

    // Upsert an override (set a manual amount for a client/year/month)
    if (action === 'upsert') {
        const { client_key, client_name, client_email, year, month, amount, notes } = req.body;
        if (!client_key || year == null || month == null) {
            return res.status(400).json({ error: 'Missing client_key, year, or month' });
        }
        const { data, error } = await supabase
            .from('cashflow_overrides')
            .upsert({
                client_key,
                client_name: client_name || null,
                client_email: client_email || null,
                year: parseInt(year),
                month: parseInt(month),
                amount: amount != null ? parseFloat(amount) : 0,
                notes: notes || null,
                updated_at: new Date().toISOString()
            }, { onConflict: 'client_key,year,month' })
            .select()
            .single();
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ ok: true, override: data });
    }

    // Delete an override (revert to API data)
    if (action === 'delete') {
        const { client_key, year, month } = req.body;
        if (!client_key || year == null || month == null) {
            return res.status(400).json({ error: 'Missing client_key, year, or month' });
        }
        const { error } = await supabase
            .from('cashflow_overrides')
            .delete()
            .eq('client_key', client_key)
            .eq('year', parseInt(year))
            .eq('month', parseInt(month));
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ ok: true });
    }

    // Delete all overrides for a client
    if (action === 'deleteClient') {
        const { client_key } = req.body;
        if (!client_key) return res.status(400).json({ error: 'Missing client_key' });
        const { error } = await supabase
            .from('cashflow_overrides')
            .delete()
            .eq('client_key', client_key);
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ ok: true });
    }

    // Bulk upsert (for setting a recurring plan)
    if (action === 'bulkUpsert') {
        const { entries } = req.body; // array of { client_key, client_name, client_email, year, month, amount, notes }
        if (!entries || !entries.length) return res.status(400).json({ error: 'No entries' });
        const rows = entries.map(e => ({
            client_key: e.client_key,
            client_name: e.client_name || null,
            client_email: e.client_email || null,
            year: parseInt(e.year),
            month: parseInt(e.month),
            amount: e.amount != null ? parseFloat(e.amount) : 0,
            notes: e.notes || null,
            updated_at: new Date().toISOString()
        }));
        const { data, error } = await supabase
            .from('cashflow_overrides')
            .upsert(rows, { onConflict: 'client_key,year,month' })
            .select();
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ ok: true, count: data.length });
    }

    return res.status(400).json({ error: 'Invalid action' });
}
