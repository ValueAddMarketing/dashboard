import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    const WHOP_API_KEY = process.env.WHOP_API_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ecmhhonjazfbletyvncw.supabase.co';
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjbWhob25qYXpmYmxldHl2bmN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5NDMwMjYsImV4cCI6MjA4MTUxOTAyNn0.3LZ8dAOX_ZpoUNkgY_jSeC10SaCknfPfBaZsDRjFt7c';

    const { action } = req.body;

    const formatWhopDate = (val) => {
        if (!val) return null;
        if (typeof val === 'number') return new Date(val * 1000).toISOString().split('T')[0];
        return String(val).split('T')[0];
    };

    const mapWhopMembership = (m) => {
        // Derive billing interval from renewal period timestamps
        let interval = m.plan?.renewal_period || m.renewal_period || null;
        if (!interval && m.renewal_period_start && m.renewal_period_end) {
            const start = typeof m.renewal_period_start === 'number' ? m.renewal_period_start : Date.parse(m.renewal_period_start) / 1000;
            const end = typeof m.renewal_period_end === 'number' ? m.renewal_period_end : Date.parse(m.renewal_period_end) / 1000;
            const days = (end - start) / 86400;
            if (days >= 350) interval = 'year';
            else if (days >= 25) interval = 'month';
            else if (days >= 6) interval = 'week';
        }
        const payments = m._payments || [];
        const paidPayments = payments.filter(p => p.status === 'paid' || p.status === 'succeeded');
        const totalPaid = paidPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const perPeriod = m._plan_price != null ? m._plan_price : (paidPayments.length > 0 ? paidPayments[0].amount : (m.amount_subtotal ? m.amount_subtotal / 100 : (m.final_amount ? m.final_amount / 100 : null)));
        return {
            id: m.id,
            userId: m.user_id || '',
            source: 'whop',
            customerName: m.user?.username || m.user?.email || m.discord?.username || m.email || '',
            customerEmail: m.user?.email || m.email || '',
            status: m.status || (m.valid ? 'active' : 'inactive'),
            currentPeriodEnd: formatWhopDate(m.renewal_period_end || m.expires_at || m.next_renewal_date),
            currentPeriodStart: formatWhopDate(m.renewal_period_start || m.created_at),
            cancelAtPeriodEnd: m.cancel_at_period_end || false,
            canceledAt: formatWhopDate(m.canceled_at || m.cancelled_at),
            endedAt: formatWhopDate(m.ended_at || m.expired_at),
            cancelAt: formatWhopDate(m.cancel_at),
            amount: perPeriod,
            totalPaid,
            paymentCount: paidPayments.length,
            payments,
            currency: m.currency || 'usd',
            interval,
            productName: m._plan_name || m.plan?.plan_name || m.product?.name || m.product_name || '',
            created: m.created_at ? (typeof m.created_at === 'number' ? new Date(m.created_at * 1000).toISOString().split('T')[0] : String(m.created_at).split('T')[0]) : null
        };
    };

    // ========== FETCH ALL SUBSCRIPTIONS ==========
    if (action === 'fetchAll') {
        const results = { stripe: [], whop: [], fanbasis: [], errors: [] };

        // --- Run Stripe + Whop in parallel ---
        const stripePromise = (async () => {
            if (!STRIPE_SECRET_KEY) { results.errors.push({ source: 'stripe', message: 'STRIPE_SECRET_KEY not configured' }); return; }
            try {
                let hasMore = true, startingAfter = null;
                const allSubs = [];
                while (hasMore) {
                    const params = new URLSearchParams({ limit: '100', status: 'all', 'expand[]': 'data.customer' });
                    if (startingAfter) params.append('starting_after', startingAfter);
                    const resp = await fetch(`https://api.stripe.com/v1/subscriptions?${params}`, { headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` } });
                    const data = await resp.json();
                    if (data.error) { results.errors.push({ source: 'stripe', message: data.error.message }); break; }
                    for (const sub of (data.data || [])) {
                        const customer = sub.customer;
                        const cn = typeof customer === 'object' ? (customer.name || customer.email || customer.id) : customer;
                        const ce = typeof customer === 'object' ? (customer.email || '') : '';
                        allSubs.push({ id: sub.id, source: 'stripe', customerName: cn || '', customerEmail: ce || '', status: sub.status, currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString().split('T')[0] : null, currentPeriodStart: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString().split('T')[0] : null, cancelAtPeriodEnd: sub.cancel_at_period_end, canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString().split('T')[0] : null, endedAt: sub.ended_at ? new Date(sub.ended_at * 1000).toISOString().split('T')[0] : null, cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString().split('T')[0] : null, amount: sub.items?.data?.[0]?.price?.unit_amount ? sub.items.data[0].price.unit_amount / 100 : null, currency: sub.items?.data?.[0]?.price?.currency || 'usd', interval: sub.items?.data?.[0]?.price?.recurring?.interval || null, productName: sub.items?.data?.[0]?.price?.product?.name || sub.items?.data?.[0]?.price?.nickname || '', created: new Date(sub.created * 1000).toISOString().split('T')[0] });
                    }
                    hasMore = data.has_more;
                    if (hasMore && data.data.length > 0) startingAfter = data.data[data.data.length - 1].id;
                }
                results.stripe = allSubs;
            } catch (err) { results.errors.push({ source: 'stripe', message: err.message }); }
        })();

        const whopPromise = (async () => {
        if (WHOP_API_KEY) {
            try {
                const whopHeaders = { 'Authorization': `Bearer ${WHOP_API_KEY}` };

                const fetchAllPages = async (endpoint) => {
                    const all = [];
                    let pg = 1, more = true;
                    while (more) {
                        const r = await fetch(`https://api.whop.com/api/v5/company/${endpoint}${endpoint.includes('?') ? '&' : '?'}per=50&page=${pg}`, { headers: whopHeaders });
                        if (!r.ok) break;
                        const d = await r.json();
                        const items = d.data || [];
                        if (!items.length) break;
                        all.push(...items);
                        const tp = d.pagination?.total_pages || 1;
                        if (pg >= tp || items.length < 50) more = false;
                        else pg++;
                    }
                    return all;
                };

                // Fetch all three in parallel
                const [allPayments, allProducts, rawMemberships] = await Promise.all([
                    fetchAllPages('payments'),
                    fetchAllPages('products'),
                    fetchAllPages('memberships'),
                ]);

                // Build lookups
                const planPrices = {};
                const paymentsByMembership = {};
                for (const p of allPayments) {
                    if (p.plan_id && p.subtotal > 0 && !planPrices[p.plan_id]) planPrices[p.plan_id] = p.subtotal;
                    const mid = p.membership_id;
                    if (mid) {
                        if (!paymentsByMembership[mid]) paymentsByMembership[mid] = [];
                        paymentsByMembership[mid].push({ id: p.id, amount: p.final_amount || p.subtotal || 0, status: p.status, created: p.created_at ? String(p.created_at).split('T')[0] : null });
                    }
                }
                const productNames = {};
                for (const p of allProducts) productNames[p.id] = p.name || p.title || '';

                // Map memberships
                const allMemberships = [];
                for (const m of rawMemberships) {
                    if (m.plan_id && planPrices[m.plan_id] != null) m._plan_price = planPrices[m.plan_id];
                    if (m.product_id && productNames[m.product_id]) m._plan_name = productNames[m.product_id];
                    m._payments = paymentsByMembership[m.id] || [];
                    allMemberships.push(mapWhopMembership(m));
                }

                results.whop = allMemberships;
            } catch (err) {
                results.errors.push({ source: 'whop', message: err.message });
            }
        } else {
            results.errors.push({ source: 'whop', message: 'WHOP_API_KEY not configured' });
        }
        })();

        await Promise.all([stripePromise, whopPromise]);

        // --- Fanbasis (from Supabase) ---
        if (SUPABASE_KEY) {
            try {
                const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
                const { data, error } = await supabase
                    .from('fanbasis_subscriptions')
                    .select('*');
                if (error) {
                    results.errors.push({ source: 'fanbasis', message: error.message });
                } else {
                    results.fanbasis = (data || []).map(row => ({
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
                }
            } catch (err) {
                results.errors.push({ source: 'fanbasis', message: err.message });
            }
        }

        return res.json(results);
    }

    // ========== SAVE MANUAL MAPPINGS ==========
    if (action === 'saveMappings') {
        // Mappings are stored client-side in localStorage for now
        // Could be moved to Supabase later
        return res.json({ ok: true });
    }

    // ========== DEBUG RAW WHOP DATA ==========
    if (action === 'debugWhop') {
        if (!WHOP_API_KEY) return res.json({ error: 'No WHOP_API_KEY' });
        const headers = { 'Authorization': `Bearer ${WHOP_API_KEY}` };
        const tryFetch = async (url) => {
            try {
                const r = await fetch(url, { headers });
                const text = await r.text();
                try { return { status: r.status, data: JSON.parse(text) }; } catch { return { status: r.status, text: text.substring(0, 500) }; }
            } catch (e) { return { error: e.message }; }
        };
        const [productPlans, payments, invoices, pricesEndpoint] = await Promise.all([
            tryFetch('https://api.whop.com/api/v5/company/products/prod_16YCAds3BF2ea/plans?per=3'),
            tryFetch('https://api.whop.com/api/v5/company/payments?per=3'),
            tryFetch('https://api.whop.com/api/v5/company/invoices?per=3'),
            tryFetch('https://api.whop.com/api/v5/company/prices?per=3'),
        ]);
        return res.json({ productPlans, payments, invoices, pricesEndpoint });
    }

    return res.status(400).json({ error: 'Invalid action. Use "fetchAll" or "saveMappings".' });
}
