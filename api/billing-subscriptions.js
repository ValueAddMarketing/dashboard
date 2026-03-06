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
        amount: m.amount_subtotal ? m.amount_subtotal / 100 : (m.final_amount ? m.final_amount / 100 : null),
        currency: m.currency || 'usd',
        interval: m.plan?.renewal_period || m.renewal_period || null,
        productName: m.plan?.plan_name || m.product?.name || m.product_name || '',
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
                const allMemberships = [];
                let cursor = null;
                let hasMore = true;

                while (hasMore) {
                    const params = new URLSearchParams({ per: '50' });
                    if (cursor) params.append('cursor', cursor);

                    const resp = await fetch(`https://api.whop.com/api/v5/company/memberships?${params}`, {
                        headers: { 'Authorization': `Bearer ${WHOP_API_KEY}` }
                    });

                    // If v5 fails, try v2
                    if (!resp.ok) {
                        const errText = await resp.text();
                        // Try v2 as fallback
                        const resp2 = await fetch(`https://api.whop.com/api/v2/company/memberships?per=50&page=1`, {
                            headers: { 'Authorization': `Bearer ${WHOP_API_KEY}` }
                        });
                        if (!resp2.ok) {
                            const err2 = await resp2.text();
                            // Try the newer /memberships endpoint
                            const resp3 = await fetch(`https://api.whop.com/company/memberships?per=50`, {
                                headers: { 'Authorization': `Bearer ${WHOP_API_KEY}` }
                            });
                            if (!resp3.ok) {
                                const err3 = await resp3.text();
                                results.errors.push({ source: 'whop', message: `v5: ${errText.substring(0,200)} | v2: ${err2.substring(0,200)} | base: ${err3.substring(0,200)}` });
                                break;
                            }
                            const data3 = await resp3.json();
                            const memberships3 = data3.data || data3.memberships || data3 || [];
                            if (Array.isArray(memberships3)) {
                                for (const m of memberships3) {
                                    allMemberships.push(mapWhopMembership(m));
                                }
                            }
                            hasMore = false;
                            break;
                        }
                        const data2 = await resp2.json();
                        const memberships2 = data2.data || data2.memberships || [];
                        for (const m of memberships2) {
                            allMemberships.push(mapWhopMembership(m));
                        }
                        hasMore = false;
                        break;
                    }

                    const data = await resp.json();
                    const memberships = data.data || data.memberships || [];
                    if (memberships.length === 0) { hasMore = false; break; }

                    for (const m of memberships) {
                        allMemberships.push(mapWhopMembership(m));
                    }

                    cursor = data.pagination?.next_cursor || data.next_cursor;
                    if (!cursor) hasMore = false;
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
