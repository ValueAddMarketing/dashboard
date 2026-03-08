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
        return {
            id: m.id,
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
            amount: m._plan_price != null ? m._plan_price : (m.amount_subtotal ? m.amount_subtotal / 100 : (m.final_amount ? m.final_amount / 100 : null)),
            currency: m.currency || 'usd',
            interval,
            productName: m._plan_name || m.plan?.plan_name || m.product?.name || m.product_name || '',
            created: m.created_at ? (typeof m.created_at === 'number' ? new Date(m.created_at * 1000).toISOString().split('T')[0] : String(m.created_at).split('T')[0]) : null
        };
    };

    // ========== FETCH ALL SUBSCRIPTIONS ==========
    if (action === 'fetchAll') {
        const results = { stripe: [], whop: [], fanbasis: [], errors: [] };

        // --- Stripe ---
        if (STRIPE_SECRET_KEY) {
            try {
                let hasMore = true;
                let startingAfter = null;
                const allSubs = [];

                while (hasMore) {
                    const params = new URLSearchParams({
                        limit: '100',
                        status: 'all',
                        'expand[]': 'data.customer'
                    });
                    if (startingAfter) params.append('starting_after', startingAfter);

                    const resp = await fetch(`https://api.stripe.com/v1/subscriptions?${params}`, {
                        headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` }
                    });
                    const data = await resp.json();

                    if (data.error) {
                        results.errors.push({ source: 'stripe', message: data.error.message });
                        break;
                    }

                    for (const sub of (data.data || [])) {
                        const customer = sub.customer;
                        const customerName = typeof customer === 'object' ? (customer.name || customer.email || customer.id) : customer;
                        const customerEmail = typeof customer === 'object' ? (customer.email || '') : '';

                        allSubs.push({
                            id: sub.id,
                            source: 'stripe',
                            customerName: customerName || '',
                            customerEmail: customerEmail || '',
                            status: sub.status,
                            currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString().split('T')[0] : null,
                            currentPeriodStart: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString().split('T')[0] : null,
                            cancelAtPeriodEnd: sub.cancel_at_period_end,
                            canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString().split('T')[0] : null,
                            endedAt: sub.ended_at ? new Date(sub.ended_at * 1000).toISOString().split('T')[0] : null,
                            cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString().split('T')[0] : null,
                            amount: sub.items?.data?.[0]?.price?.unit_amount ? sub.items.data[0].price.unit_amount / 100 : null,
                            currency: sub.items?.data?.[0]?.price?.currency || 'usd',
                            interval: sub.items?.data?.[0]?.price?.recurring?.interval || null,
                            productName: sub.items?.data?.[0]?.price?.product?.name || sub.items?.data?.[0]?.price?.nickname || '',
                            created: new Date(sub.created * 1000).toISOString().split('T')[0]
                        });
                    }

                    hasMore = data.has_more;
                    if (hasMore && data.data.length > 0) {
                        startingAfter = data.data[data.data.length - 1].id;
                    }
                }

                results.stripe = allSubs;
            } catch (err) {
                results.errors.push({ source: 'stripe', message: err.message });
            }
        } else {
            results.errors.push({ source: 'stripe', message: 'STRIPE_SECRET_KEY not configured' });
        }

        // --- Whop ---
        if (WHOP_API_KEY) {
            try {
                // Fetch payments to build plan_id → price lookup (plans endpoint not available in v5)
                const planPrices = {};
                const planNames = {};
                const planIntervals = {};
                let payPage = 1;
                let payHasMore = true;
                // Fetch up to 5 pages (250 payments) to cover all plan_ids
                while (payHasMore && payPage <= 5) {
                    const payResp = await fetch(`https://api.whop.com/api/v5/company/payments?per=50&page=${payPage}`, {
                        headers: { 'Authorization': `Bearer ${WHOP_API_KEY}` }
                    });
                    if (!payResp.ok) break;
                    const payData = await payResp.json();
                    const payments = payData.data || [];
                    for (const p of payments) {
                        // Only use subscription payments with a subtotal > 0
                        // Whop v5 subtotal is already in dollars (not cents)
                        if (p.plan_id && p.subtotal > 0 && !planPrices[p.plan_id]) {
                            planPrices[p.plan_id] = p.subtotal;
                        }
                        // Also capture user info for name resolution
                        if (p.plan_id && p.product_id && !planNames[p.plan_id]) {
                            planNames[p.plan_id] = ''; // will be filled from products if needed
                        }
                    }
                    const totalPages = payData.pagination?.total_pages || 1;
                    if (payPage >= totalPages || payments.length < 50) { payHasMore = false; }
                    else { payPage++; }
                }

                // Fetch products for names
                const productNames = {};
                let prodPage = 1;
                let prodHasMore = true;
                while (prodHasMore) {
                    const prodResp = await fetch(`https://api.whop.com/api/v5/company/products?per=50&page=${prodPage}`, {
                        headers: { 'Authorization': `Bearer ${WHOP_API_KEY}` }
                    });
                    if (!prodResp.ok) break;
                    const prodData = await prodResp.json();
                    const products = prodData.data || [];
                    for (const p of products) {
                        productNames[p.id] = p.name || p.title || '';
                    }
                    if (products.length < 50 || prodPage >= (prodData.pagination?.total_pages || prodPage)) { prodHasMore = false; }
                    else { prodPage++; }
                }

                // Fetch all memberships (page-based pagination for v5)
                const rawMemberships = [];
                let page = 1;
                let hasMore = true;

                while (hasMore) {
                    const resp = await fetch(`https://api.whop.com/api/v5/company/memberships?per=50&page=${page}`, {
                        headers: { 'Authorization': `Bearer ${WHOP_API_KEY}` }
                    });

                    if (!resp.ok) {
                        const errText = await resp.text();
                        results.errors.push({ source: 'whop', message: `v5 page ${page}: ${errText.substring(0,200)}` });
                        break;
                    }

                    const data = await resp.json();
                    const memberships = data.data || [];
                    if (memberships.length === 0) { hasMore = false; break; }

                    for (const m of memberships) rawMemberships.push(m);

                    const totalPages = data.pagination?.total_pages || 1;
                    if (page >= totalPages) { hasMore = false; }
                    else { page++; }
                }

                // Collect unique user_ids and fetch user details
                const userIds = [...new Set(rawMemberships.map(m => m.user_id).filter(Boolean))];
                const userMap = {};

                // Fetch users in parallel batches of 10
                for (let i = 0; i < userIds.length; i += 10) {
                    const batch = userIds.slice(i, i + 10);
                    const userResults = await Promise.all(batch.map(uid =>
                        fetch(`https://api.whop.com/api/v5/company/users/${uid}`, {
                            headers: { 'Authorization': `Bearer ${WHOP_API_KEY}` }
                        }).then(r => r.ok ? r.json() : null).catch(() => null)
                    ));
                    for (const u of userResults) {
                        if (u && u.id) userMap[u.id] = u;
                    }
                }

                results._whopDebug = {
                    totalMemberships: rawMemberships.length,
                    uniqueUsers: userIds.length,
                    usersResolved: Object.keys(userMap).length,
                    sampleUser: Object.values(userMap)[0] ? { username: Object.values(userMap)[0].username, email: Object.values(userMap)[0].email } : null,
                };

                // Map memberships with user data injected
                const allMemberships = [];
                for (const m of rawMemberships) {
                    if (m.user_id && userMap[m.user_id]) {
                        m.user = userMap[m.user_id];
                    }
                    if (m.plan_id && planPrices[m.plan_id] != null) m._plan_price = planPrices[m.plan_id];
                    if (m.product_id && productNames[m.product_id]) m._plan_name = productNames[m.product_id];
                    allMemberships.push(mapWhopMembership(m));
                }

                results.whop = allMemberships;
            } catch (err) {
                results.errors.push({ source: 'whop', message: err.message });
            }
        } else {
            results.errors.push({ source: 'whop', message: 'WHOP_API_KEY not configured' });
        }

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
