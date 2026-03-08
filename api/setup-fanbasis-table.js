import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ecmhhonjazfbletyvncw.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (!SUPABASE_KEY) return res.status(500).json({ error: 'No SUPABASE_SERVICE_ROLE_KEY' });

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Create the table using Supabase SQL
    const { error } = await supabase.rpc('exec_sql', {
        query: `
            CREATE TABLE IF NOT EXISTS fanbasis_subscriptions (
                id BIGSERIAL PRIMARY KEY,
                subscription_id TEXT UNIQUE,
                customer_name TEXT,
                customer_email TEXT,
                amount NUMERIC(10,2),
                product_name TEXT DEFAULT 'Fanbasis',
                interval TEXT DEFAULT 'month',
                status TEXT DEFAULT 'active',
                currency TEXT DEFAULT 'usd',
                current_period_start DATE,
                current_period_end DATE,
                cancel_at_period_end BOOLEAN DEFAULT false,
                canceled_at DATE,
                ended_at DATE,
                created_at DATE DEFAULT CURRENT_DATE,
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );

            ALTER TABLE fanbasis_subscriptions ENABLE ROW LEVEL SECURITY;

            CREATE POLICY IF NOT EXISTS "Allow service role full access" ON fanbasis_subscriptions
                FOR ALL USING (true) WITH CHECK (true);
        `
    });

    if (error) {
        // If exec_sql doesn't exist, provide manual SQL
        return res.json({
            error: error.message,
            manual_sql: `Run this SQL in Supabase Dashboard > SQL Editor:

CREATE TABLE IF NOT EXISTS fanbasis_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    subscription_id TEXT UNIQUE,
    customer_name TEXT,
    customer_email TEXT,
    amount NUMERIC(10,2),
    product_name TEXT DEFAULT 'Fanbasis',
    interval TEXT DEFAULT 'month',
    status TEXT DEFAULT 'active',
    currency TEXT DEFAULT 'usd',
    current_period_start DATE,
    current_period_end DATE,
    cancel_at_period_end BOOLEAN DEFAULT false,
    canceled_at DATE,
    ended_at DATE,
    created_at DATE DEFAULT CURRENT_DATE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fanbasis_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access" ON fanbasis_subscriptions
    FOR ALL USING (true) WITH CHECK (true);`
        });
    }

    return res.json({ ok: true, message: 'fanbasis_subscriptions table created' });
}
