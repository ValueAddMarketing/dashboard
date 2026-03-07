export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    const WHOP_API_KEY = process.env.WHOP_API_KEY;

    const { action } = req.body;

    const formatWhopDate = (val) => {
        if (!val) return null;
        if (typeof val === 'number') return new Date(val * 1000).toISOString().split('T')[0];
        return String(val).split('T')[0];
    };

    const mapWhopMembership = (m) => ({
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
        interval: m._plan_interval || m.plan?.renewal_period || m.renewal_period || null,
        productName: m._plan_name || m.plan?.plan_name || m.product?.name || m.product_name || '',
        created: m.created_at ? (typeof m.created_at === 'number' ? new Date(m.created_at * 1000).toISOString().split('T')[0] : String(m.created_at).split('T')[0]) : null
    });

    // ========== FETCH ALL SUBSCRIPTIONS ==========
    if (action === 'fetchAll') {
        const results = { stripe: [], whop: [], errors: [] };

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
                // First, fetch all plans to get pricing info
                const planPrices = {};
                const planNames = {};
                const planIntervals = {};
                let planPage = 1;
                let planHasMore = true;
                while (planHasMore) {
                    const planResp = await fetch(`https://api.whop.com/api/v5/company/plans?per=50&page=${planPage}`, {
                        headers: { 'Authorization': `Bearer ${WHOP_API_KEY}` }
                    });
                    if (!planResp.ok) break;
                    const planData = await planResp.json();
                    const plans = planData.data || [];
                    for (const p of plans) {
                        // Price fields: initial_price, renewal_price, base_currency_price, or price
                        const price = p.renewal_price ?? p.initial_price ?? p.base_currency_price ?? p.price ?? null;
                        if (price != null) planPrices[p.id] = typeof price === 'number' ? price : parseFloat(price) || 0;
                        planNames[p.id] = p.plan_name || p.name || p.internal_name || '';
                        planIntervals[p.id] = p.renewal_period || p.billing_period || p.interval || null;
                    }
                    if (plans.length < 50 || planPage >= (planData.pagination?.total_pages || planPage)) { planHasMore = false; }
                    else { planPage++; }
                }

                // Now fetch all memberships (page-based pagination for v5)
                const allMemberships = [];
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

                    for (const m of memberships) {
                        // Inject plan pricing into the membership before mapping
                        const planId = m.plan_id;
                        if (planId && planPrices[planId] != null) {
                            m._plan_price = planPrices[planId];
                        }
                        if (planId && planNames[planId]) {
                            m._plan_name = planNames[planId];
                        }
                        if (planId && planIntervals[planId]) {
                            m._plan_interval = planIntervals[planId];
                        }
                        allMemberships.push(mapWhopMembership(m));
                    }

                    const totalPages = data.pagination?.total_pages || 1;
                    if (page >= totalPages) { hasMore = false; }
                    else { page++; }
                }

                results.whop = allMemberships;
            } catch (err) {
                results.errors.push({ source: 'whop', message: err.message });
            }
        } else {
            results.errors.push({ source: 'whop', message: 'WHOP_API_KEY not configured' });
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
        const [plans_v5, plans_v2, products_v5, singlePlan] = await Promise.all([
            tryFetch('https://api.whop.com/api/v5/company/plans?per=3'),
            tryFetch('https://api.whop.com/api/v2/company/plans?per=3'),
            tryFetch('https://api.whop.com/api/v5/company/products?per=3'),
            tryFetch('https://api.whop.com/api/v5/company/plans/plan_Bo2pCwEPNibzX'),
        ]);
        return res.json({ plans_v5, plans_v2, products_v5, singlePlan });
    }

    return res.status(400).json({ error: 'Invalid action. Use "fetchAll" or "saveMappings".' });
}
