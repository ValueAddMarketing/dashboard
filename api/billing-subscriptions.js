export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    const WHOP_API_KEY = process.env.WHOP_API_KEY;

    const { action } = req.body;

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
                let page = 1;
                const allMemberships = [];
                let hasMore = true;

                while (hasMore) {
                    const resp = await fetch(`https://api.whop.com/api/v2/company/memberships?per=${100}&page=${page}`, {
                        headers: { 'Authorization': `Bearer ${WHOP_API_KEY}` }
                    });
                    const data = await resp.json();

                    if (data.error) {
                        results.errors.push({ source: 'whop', message: data.error || JSON.stringify(data) });
                        break;
                    }

                    const memberships = data.data || data.memberships || [];
                    if (memberships.length === 0) {
                        hasMore = false;
                        break;
                    }

                    for (const m of memberships) {
                        allMemberships.push({
                            id: m.id,
                            source: 'whop',
                            customerName: m.user?.username || m.user?.email || m.discord?.username || '',
                            customerEmail: m.user?.email || '',
                            status: m.status || m.valid ? 'active' : 'inactive',
                            currentPeriodEnd: m.renewal_period_end || m.expires_at || null,
                            currentPeriodStart: m.renewal_period_start || m.created_at || null,
                            cancelAtPeriodEnd: m.cancel_at_period_end || false,
                            amount: m.amount_subtotal ? m.amount_subtotal / 100 : null,
                            currency: m.currency || 'usd',
                            interval: m.plan?.renewal_period || null,
                            productName: m.plan?.plan_name || m.product?.name || '',
                            created: m.created_at ? m.created_at.split('T')[0] : null
                        });
                    }

                    const pagination = data.pagination;
                    if (pagination && pagination.current_page < pagination.total_page) {
                        page++;
                    } else {
                        hasMore = false;
                    }
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

    return res.status(400).json({ error: 'Invalid action. Use "fetchAll" or "saveMappings".' });
}
