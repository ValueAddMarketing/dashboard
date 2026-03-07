// api/billing-errors.js - Fetches actual payment history from Stripe + Whop
// Returns invoices/charges so we can see HOW MANY times a client was billed and for how much

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    const WHOP_API_KEY = process.env.WHOP_API_KEY;
    const { action } = req.body;

    // ── Fetch all Stripe invoices (actual payment records) ──
    if (action === 'fetchInvoices') {
        const results = { stripe: [], whop: [], errors: [] };

        // --- Stripe Invoices ---
        if (STRIPE_SECRET_KEY) {
            try {
                let hasMore = true;
                let startingAfter = null;
                const allInvoices = [];

                while (hasMore) {
                    const params = new URLSearchParams({
                        limit: '100',
                        'expand[]': 'data.customer',
                    });
                    if (startingAfter) params.append('starting_after', startingAfter);

                    const resp = await fetch(`https://api.stripe.com/v1/invoices?${params}`, {
                        headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` }
                    });
                    const data = await resp.json();

                    if (data.error) {
                        results.errors.push({ source: 'stripe', message: data.error.message });
                        break;
                    }

                    for (const inv of (data.data || [])) {
                        const customer = inv.customer;
                        const customerName = typeof customer === 'object' ? (customer.name || customer.email || customer.id) : customer;
                        const customerEmail = typeof customer === 'object' ? (customer.email || '') : '';
                        const customerId = typeof customer === 'object' ? customer.id : customer;

                        allInvoices.push({
                            id: inv.id,
                            source: 'stripe',
                            customerId,
                            customerName: customerName || '',
                            customerEmail: customerEmail || '',
                            subscriptionId: inv.subscription || null,
                            status: inv.status,
                            paid: inv.paid,
                            amountDue: inv.amount_due ? inv.amount_due / 100 : 0,
                            amountPaid: inv.amount_paid ? inv.amount_paid / 100 : 0,
                            amountRemaining: inv.amount_remaining ? inv.amount_remaining / 100 : 0,
                            currency: inv.currency || 'usd',
                            created: inv.created ? new Date(inv.created * 1000).toISOString().split('T')[0] : null,
                            periodStart: inv.period_start ? new Date(inv.period_start * 1000).toISOString().split('T')[0] : null,
                            periodEnd: inv.period_end ? new Date(inv.period_end * 1000).toISOString().split('T')[0] : null,
                            dueDate: inv.due_date ? new Date(inv.due_date * 1000).toISOString().split('T')[0] : null,
                            invoiceUrl: inv.hosted_invoice_url || null,
                            number: inv.number || null,
                            description: inv.lines?.data?.[0]?.description || '',
                            attemptCount: inv.attempt_count || 0,
                            attempted: inv.attempted || false,
                        });
                    }

                    hasMore = data.has_more;
                    if (hasMore && data.data.length > 0) {
                        startingAfter = data.data[data.data.length - 1].id;
                    }
                }

                results.stripe = allInvoices;
            } catch (err) {
                results.errors.push({ source: 'stripe', message: err.message });
            }
        } else {
            results.errors.push({ source: 'stripe', message: 'STRIPE_SECRET_KEY not configured' });
        }

        // --- Stripe Upcoming Invoices (next billing) ---
        if (STRIPE_SECRET_KEY) {
            try {
                // Get all active subscriptions to find upcoming invoices
                let hasMore = true;
                let startingAfter = null;
                const upcoming = [];

                while (hasMore) {
                    const params = new URLSearchParams({
                        limit: '100',
                        status: 'active',
                        'expand[]': 'data.customer',
                    });
                    if (startingAfter) params.append('starting_after', startingAfter);

                    const resp = await fetch(`https://api.stripe.com/v1/subscriptions?${params}`, {
                        headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` }
                    });
                    const data = await resp.json();
                    if (data.error) break;

                    for (const sub of (data.data || [])) {
                        const customer = sub.customer;
                        const customerName = typeof customer === 'object' ? (customer.name || customer.email || customer.id) : customer;
                        const customerEmail = typeof customer === 'object' ? (customer.email || '') : '';
                        const customerId = typeof customer === 'object' ? customer.id : customer;

                        upcoming.push({
                            subscriptionId: sub.id,
                            customerId,
                            customerName: customerName || '',
                            customerEmail: customerEmail || '',
                            status: sub.status,
                            nextBillingDate: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString().split('T')[0] : null,
                            amount: sub.items?.data?.[0]?.price?.unit_amount ? sub.items.data[0].price.unit_amount / 100 : null,
                            interval: sub.items?.data?.[0]?.price?.recurring?.interval || null,
                            cancelAtPeriodEnd: sub.cancel_at_period_end,
                            created: new Date(sub.created * 1000).toISOString().split('T')[0],
                        });
                    }

                    hasMore = data.has_more;
                    if (hasMore && data.data.length > 0) {
                        startingAfter = data.data[data.data.length - 1].id;
                    }
                }

                results.stripeUpcoming = upcoming;
            } catch (err) {
                results.errors.push({ source: 'stripe_upcoming', message: err.message });
            }
        }

        // --- Whop Payments ---
        if (WHOP_API_KEY) {
            try {
                const allPayments = [];
                let page = 1;
                let hasMore = true;

                while (hasMore) {
                    const resp = await fetch(`https://api.whop.com/api/v5/company/payments?per=50&page=${page}`, {
                        headers: { 'Authorization': `Bearer ${WHOP_API_KEY}` }
                    });

                    if (!resp.ok) {
                        // Try v2 fallback
                        const resp2 = await fetch(`https://api.whop.com/api/v2/company/payments?per=50&page=${page}`, {
                            headers: { 'Authorization': `Bearer ${WHOP_API_KEY}` }
                        });
                        if (!resp2.ok) {
                            // Try memberships with payment data as final fallback
                            const resp3 = await fetch(`https://api.whop.com/api/v5/company/memberships?per=50`, {
                                headers: { 'Authorization': `Bearer ${WHOP_API_KEY}` }
                            });
                            if (resp3.ok) {
                                const data3 = await resp3.json();
                                const memberships = data3.data || data3.memberships || [];
                                for (const m of memberships) {
                                    allPayments.push({
                                        id: m.id,
                                        source: 'whop',
                                        customerName: m.user?.username || m.user?.email || m.discord?.username || m.email || '',
                                        customerEmail: m.user?.email || m.email || '',
                                        status: m.status || (m.valid ? 'active' : 'inactive'),
                                        amountPaid: m.amount_subtotal ? m.amount_subtotal / 100 : (m.final_amount ? m.final_amount / 100 : 0),
                                        currency: m.currency || 'usd',
                                        created: m.created_at ? (typeof m.created_at === 'number' ? new Date(m.created_at * 1000).toISOString().split('T')[0] : String(m.created_at).split('T')[0]) : null,
                                        nextBillingDate: m.renewal_period_end ? (typeof m.renewal_period_end === 'number' ? new Date(m.renewal_period_end * 1000).toISOString().split('T')[0] : String(m.renewal_period_end).split('T')[0]) : null,
                                        interval: m.plan?.renewal_period || m.renewal_period || null,
                                        productName: m.plan?.plan_name || m.product?.name || m.product_name || '',
                                        cancelAtPeriodEnd: m.cancel_at_period_end || false,
                                    });
                                }
                            }
                            hasMore = false;
                            break;
                        }
                        const data2 = await resp2.json();
                        const payments2 = data2.data || data2.payments || [];
                        if (payments2.length === 0) { hasMore = false; break; }
                        for (const p of payments2) {
                            allPayments.push({
                                id: p.id,
                                source: 'whop',
                                customerName: p.user?.username || p.user?.email || p.membership?.user?.username || '',
                                customerEmail: p.user?.email || p.membership?.user?.email || '',
                                status: p.status,
                                amountPaid: p.final_amount ? p.final_amount / 100 : (p.amount ? p.amount / 100 : 0),
                                currency: p.currency || 'usd',
                                created: p.created_at ? String(p.created_at).split('T')[0] : null,
                                productName: p.product?.name || p.plan?.plan_name || '',
                                membershipId: p.membership_id || p.membership?.id || null,
                            });
                        }
                        page++;
                        if (payments2.length < 50) hasMore = false;
                        continue;
                    }

                    const data = await resp.json();
                    const payments = data.data || data.payments || [];
                    if (payments.length === 0) { hasMore = false; break; }

                    for (const p of payments) {
                        allPayments.push({
                            id: p.id,
                            source: 'whop',
                            customerName: p.user?.username || p.user?.email || '',
                            customerEmail: p.user?.email || '',
                            status: p.status,
                            amountPaid: p.final_amount ? p.final_amount / 100 : (p.amount ? p.amount / 100 : 0),
                            currency: p.currency || 'usd',
                            created: p.created_at ? String(p.created_at).split('T')[0] : null,
                            productName: p.product?.name || p.plan?.plan_name || '',
                            membershipId: p.membership_id || p.membership?.id || null,
                        });
                    }

                    page++;
                    if (payments.length < 50) hasMore = false;
                }

                results.whop = allPayments;
            } catch (err) {
                results.errors.push({ source: 'whop', message: err.message });
            }
        } else {
            results.errors.push({ source: 'whop', message: 'WHOP_API_KEY not configured' });
        }

        return res.json(results);
    }

    return res.status(400).json({ error: 'Invalid action. Use "fetchInvoices".' });
}
