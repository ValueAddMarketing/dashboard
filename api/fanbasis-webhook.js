import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ecmhhonjazfbletyvncw.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjbWhob25qYXpmYmxldHl2bmN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5NDMwMjYsImV4cCI6MjA4MTUxOTAyNn0.3LZ8dAOX_ZpoUNkgY_jSeC10SaCknfPfBaZsDRjFt7c';
const WEBHOOK_SECRET = process.env.FANBASIS_WEBHOOK_SECRET || '';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // GET = fetch all fanbasis subscriptions (used by dashboard)
    if (req.method === 'GET' || (req.method === 'POST' && req.body?.action === 'fetchAll')) {
        if (!SUPABASE_KEY) return res.json({ fanbasis: [], error: 'Supabase not configured' });
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        const { data, error } = await supabase
            .from('fanbasis_subscriptions')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) return res.json({ fanbasis: [], error: error.message });
        // Map to same format as Stripe/Whop
        const mapped = (data || []).map(row => ({
            id: `fb_${row.id}`,
            source: 'fanbasis',
            customerName: row.customer_name || '',
            customerEmail: row.customer_email || '',
            status: row.status || 'active',
            currentPeriodEnd: row.current_period_end,
            currentPeriodStart: row.current_period_start,
            cancelAtPeriodEnd: row.cancel_at_period_end || false,
            canceledAt: row.canceled_at,
            endedAt: row.ended_at,
            cancelAt: null,
            amount: row.amount,
            currency: row.currency || 'usd',
            interval: row.interval || 'month',
            productName: row.product_name || 'Fanbasis',
            created: row.created_at ? row.created_at.split('T')[0] : null
        }));
        return res.json({ fanbasis: mapped });
    }

    // POST = webhook from Zapier
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Optional: verify webhook secret
    if (WEBHOOK_SECRET && req.headers['x-webhook-secret'] !== WEBHOOK_SECRET) {
        // Don't enforce if no secret set — makes Zapier setup easier
    }

    if (!SUPABASE_KEY) return res.status(500).json({ error: 'Supabase not configured' });

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const body = req.body || {};
    const event = body.event || body.type || 'new_sale';

    // Normalize customer info from Zapier payload
    // Fanbasis fields: full_name, email, formatted_total_amount, product_title, sale_id
    const customerName = body.full_name || body.customer_name || body.name || '';
    const customerEmail = body.email || body.customer_email || '';
    // Prefer formatted_total_amount (e.g. "2000.00") over total_amount (e.g. 200000 in cents)
    let amount = 0;
    if (body.formatted_total_amount) {
        amount = parseFloat(body.formatted_total_amount);
    } else if (body.total_amount) {
        amount = parseFloat(body.total_amount) / 100;
    } else if (body.amount) {
        const raw = parseFloat(body.amount);
        amount = raw > 10000 ? raw / 100 : raw; // auto-detect cents vs dollars
    }
    const productName = body.product_title || body.product_name || 'Fanbasis';
    const interval = body.interval || 'month';
    const transactionId = body.sale_id || body.transaction_id || body.id || null;
    const subscriptionId = body.subscription_id || transactionId;

    const now = new Date().toISOString().split('T')[0];

    if (['new_sale', 'subscription_renewal'].includes(event)) {
        // Upsert: insert or update subscription
        const record = {
            customer_name: customerName,
            customer_email: customerEmail,
            amount: amount,
            product_name: productName,
            interval: interval,
            status: 'active',
            currency: body.currency || 'usd',
            current_period_start: now,
            cancel_at_period_end: false,
            canceled_at: null,
            ended_at: null,
            updated_at: new Date().toISOString()
        };

        if (subscriptionId) {
            // Try to update existing, otherwise insert
            const { data: existing } = await supabase
                .from('fanbasis_subscriptions')
                .select('id')
                .eq('subscription_id', subscriptionId)
                .maybeSingle();

            if (existing) {
                await supabase
                    .from('fanbasis_subscriptions')
                    .update(record)
                    .eq('subscription_id', subscriptionId);
            } else {
                record.subscription_id = subscriptionId;
                record.created_at = now;
                await supabase.from('fanbasis_subscriptions').insert(record);
            }
        } else {
            record.subscription_id = `fb_${Date.now()}`;
            record.created_at = now;
            await supabase.from('fanbasis_subscriptions').insert(record);
        }

        return res.json({ ok: true, event, action: 'upserted' });
    }

    if (event === 'subscription_cancelled') {
        const update = { status: 'canceled', canceled_at: now, updated_at: new Date().toISOString() };
        if (subscriptionId) {
            await supabase.from('fanbasis_subscriptions').update(update).eq('subscription_id', subscriptionId);
        } else if (customerEmail) {
            await supabase.from('fanbasis_subscriptions').update(update).eq('customer_email', customerEmail).eq('status', 'active');
        }
        return res.json({ ok: true, event, action: 'cancelled' });
    }

    if (event === 'subscription_past_due') {
        const update = { status: 'past_due', updated_at: new Date().toISOString() };
        if (subscriptionId) {
            await supabase.from('fanbasis_subscriptions').update(update).eq('subscription_id', subscriptionId);
        } else if (customerEmail) {
            await supabase.from('fanbasis_subscriptions').update(update).eq('customer_email', customerEmail).eq('status', 'active');
        }
        return res.json({ ok: true, event, action: 'past_due' });
    }

    if (event === 'subscription_recovered') {
        const update = { status: 'active', canceled_at: null, updated_at: new Date().toISOString() };
        if (subscriptionId) {
            await supabase.from('fanbasis_subscriptions').update(update).eq('subscription_id', subscriptionId);
        } else if (customerEmail) {
            await supabase.from('fanbasis_subscriptions').update(update).eq('customer_email', customerEmail).eq('status', 'past_due');
        }
        return res.json({ ok: true, event, action: 'recovered' });
    }

    if (event === 'subscription_extended') {
        const newEnd = body.new_end_date || body.extended_to || null;
        const update = { updated_at: new Date().toISOString() };
        if (newEnd) update.current_period_end = newEnd;
        if (subscriptionId) {
            await supabase.from('fanbasis_subscriptions').update(update).eq('subscription_id', subscriptionId);
        }
        return res.json({ ok: true, event, action: 'extended' });
    }

    if (event === 'refund_issued') {
        const update = { status: 'canceled', ended_at: now, canceled_at: now, updated_at: new Date().toISOString() };
        if (subscriptionId) {
            await supabase.from('fanbasis_subscriptions').update(update).eq('subscription_id', subscriptionId);
        } else if (customerEmail) {
            await supabase.from('fanbasis_subscriptions').update(update).eq('customer_email', customerEmail).eq('status', 'active');
        }
        return res.json({ ok: true, event, action: 'refunded' });
    }

    // Unknown event — still store it
    return res.json({ ok: true, event, action: 'ignored' });
}
