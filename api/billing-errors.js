// api/billing-errors.js - Fetches actual payment history from Stripe
// Whop data comes from billing-subscriptions.js (which has user identity data)

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    const { action } = req.body;

    if (action === 'fetchInvoices') {
        const results = { stripe: [], stripeUpcoming: [], errors: [] };

        if (!STRIPE_SECRET_KEY) {
            results.errors.push({ source: 'stripe', message: 'STRIPE_SECRET_KEY not configured' });
            return res.json(results);
        }

        // Helper to fetch all pages of a Stripe list endpoint
        const fetchAllStripePages = async (endpoint, mapFn) => {
            const items = [];
            let hasMore = true;
            let startingAfter = null;
            while (hasMore) {
                const params = new URLSearchParams({ limit: '100', 'expand[]': 'data.customer' });
                if (startingAfter) params.append('starting_after', startingAfter);
                const resp = await fetch(`https://api.stripe.com/v1/${endpoint}?${params}`, {
                    headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` }
                });
                const data = await resp.json();
                if (data.error) { results.errors.push({ source: 'stripe', message: data.error.message }); break; }
                for (const item of (data.data || [])) items.push(mapFn(item));
                hasMore = data.has_more;
                if (hasMore && data.data.length > 0) startingAfter = data.data[data.data.length - 1].id;
            }
            return items;
        };

        const getCustomerInfo = (customer) => ({
            name: typeof customer === 'object' ? (customer.name || customer.email || customer.id) : customer,
            email: typeof customer === 'object' ? (customer.email || '') : '',
            id: typeof customer === 'object' ? customer.id : customer,
        });

        // Run invoices + active subscriptions + one-time charges in parallel
        const [invoices, subscriptions, charges] = await Promise.all([
            fetchAllStripePages('invoices', (inv) => {
                const c = getCustomerInfo(inv.customer);
                return {
                    id: inv.id, source: 'stripe', customerId: c.id,
                    customerName: c.name || '', customerEmail: c.email || '',
                    subscriptionId: inv.subscription || null, status: inv.status, paid: inv.paid,
                    amountDue: inv.amount_due ? inv.amount_due / 100 : 0,
                    amountPaid: inv.amount_paid ? inv.amount_paid / 100 : 0,
                    amountRemaining: inv.amount_remaining ? inv.amount_remaining / 100 : 0,
                    currency: inv.currency || 'usd',
                    created: inv.created ? new Date(inv.created * 1000).toISOString().split('T')[0] : null,
                    periodStart: inv.period_start ? new Date(inv.period_start * 1000).toISOString().split('T')[0] : null,
                    periodEnd: inv.period_end ? new Date(inv.period_end * 1000).toISOString().split('T')[0] : null,
                    dueDate: inv.due_date ? new Date(inv.due_date * 1000).toISOString().split('T')[0] : null,
                    invoiceUrl: inv.hosted_invoice_url || null, number: inv.number || null,
                    description: inv.lines?.data?.[0]?.description || '',
                    attemptCount: inv.attempt_count || 0, attempted: inv.attempted || false,
                    chargeId: inv.charge || null,
                };
            }).catch(err => { results.errors.push({ source: 'stripe_invoices', message: err.message }); return []; }),

            fetchAllStripePages('subscriptions?status=active', (sub) => {
                const c = getCustomerInfo(sub.customer);
                return {
                    subscriptionId: sub.id, customerId: c.id,
                    customerName: c.name || '', customerEmail: c.email || '',
                    status: sub.status,
                    nextBillingDate: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString().split('T')[0] : null,
                    amount: sub.items?.data?.[0]?.price?.unit_amount ? sub.items.data[0].price.unit_amount / 100 : null,
                    interval: sub.items?.data?.[0]?.price?.recurring?.interval || null,
                    cancelAtPeriodEnd: sub.cancel_at_period_end,
                    created: new Date(sub.created * 1000).toISOString().split('T')[0],
                };
            }).catch(err => { results.errors.push({ source: 'stripe_upcoming', message: err.message }); return []; }),

            // Fetch one-time charges (Klarna, payment links, etc.) that aren't tied to invoices
            fetchAllStripePages('charges', (ch) => {
                const c = getCustomerInfo(ch.customer);
                return {
                    id: ch.id, source: 'stripe', customerId: c.id,
                    customerName: c.name || '', customerEmail: c.email || '',
                    subscriptionId: null, status: ch.status === 'succeeded' ? 'paid' : ch.status,
                    paid: ch.status === 'succeeded', isCharge: true,
                    amountDue: ch.amount ? ch.amount / 100 : 0,
                    amountPaid: ch.status === 'succeeded' ? (ch.amount ? ch.amount / 100 : 0) : 0,
                    amountRemaining: ch.status === 'succeeded' ? 0 : (ch.amount ? ch.amount / 100 : 0),
                    currency: ch.currency || 'usd',
                    created: ch.created ? new Date(ch.created * 1000).toISOString().split('T')[0] : null,
                    periodStart: null, periodEnd: null, dueDate: null,
                    invoiceUrl: ch.receipt_url || null, number: null,
                    description: ch.description || (ch.payment_method_details?.type ? `${ch.payment_method_details.type} payment` : 'One-time charge'),
                    attemptCount: 1, attempted: true,
                };
            }).catch(err => { results.errors.push({ source: 'stripe_charges', message: err.message }); return []; }),
        ]);

        // Merge charges that aren't already covered by invoices (avoid double-counting)
        // Build set of charge IDs that are already represented by invoices
        const invoiceChargeIds = new Set(invoices.map(i => i.chargeId).filter(Boolean));
        const deduped = charges.filter(ch => !invoiceChargeIds.has(ch.id));

        results.stripe = [...invoices, ...deduped];
        results.stripeUpcoming = subscriptions;

        return res.json(results);
    }

    return res.status(400).json({ error: 'Invalid action. Use "fetchInvoices".' });
}
