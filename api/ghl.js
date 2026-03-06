const GHL_API_KEY = process.env.GHL_API_KEY;
const GHL_BASE = 'https://services.leadconnectorhq.com';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    if (!GHL_API_KEY) {
        return res.status(500).json({ error: 'GHL_API_KEY not configured' });
    }

    const { action, locationId, contactId, startDate, endDate } = req.body;

    const ghlFetch = async (url, options = {}) => {
        const resp = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${GHL_API_KEY}`,
                'Version': '2021-07-28',
                'Accept': 'application/json',
                ...options.headers
            }
        });
        if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(`GHL API ${resp.status}: ${errText}`);
        }
        return resp.json();
    };

    try {
        // List all locations (sub-accounts) under the agency
        if (action === 'listLocations') {
            const data = await ghlFetch(`${GHL_BASE}/locations/search`, {
                method: 'GET'
            });
            // The search endpoint may need query params
            // Try the company-based approach
            const locations = data.locations || [];
            return res.json({ locations: locations.map(l => ({ id: l.id, name: l.name, email: l.email, phone: l.phone })) });
        }

        // Get contacts for a specific location with date filter
        if (action === 'getContacts') {
            if (!locationId) return res.status(400).json({ error: 'locationId required' });

            const allContacts = [];
            let hasMore = true;
            let startAfterId = null;
            const limit = 100;

            // Build date range - default last 30 days
            const since = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const until = endDate || new Date().toISOString();

            while (hasMore) {
                let url = `${GHL_BASE}/contacts/?locationId=${locationId}&limit=${limit}&startAfterDate=${encodeURIComponent(since)}`;
                if (startAfterId) url += `&startAfterId=${startAfterId}`;

                const data = await ghlFetch(url);
                const contacts = data.contacts || [];
                allContacts.push(...contacts);

                if (contacts.length < limit) {
                    hasMore = false;
                } else {
                    startAfterId = contacts[contacts.length - 1].id;
                }

                // Safety limit
                if (allContacts.length > 2000) {
                    hasMore = false;
                }
            }

            // Filter by date range and map
            const filtered = allContacts.filter(c => {
                const created = new Date(c.dateAdded || c.createdAt);
                return created >= new Date(since) && created <= new Date(until);
            });

            return res.json({
                contacts: filtered.map(c => ({
                    id: c.id,
                    name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.email || 'Unknown',
                    email: c.email || '',
                    phone: c.phone || '',
                    source: c.source || '',
                    dateAdded: c.dateAdded || c.createdAt,
                    tags: c.tags || [],
                    customFields: c.customField || []
                })),
                total: filtered.length
            });
        }

        // Get tasks/notes/activities for a contact to find first call
        if (action === 'getContactActivity') {
            if (!contactId) return res.status(400).json({ error: 'contactId required' });

            // Fetch notes (manual call logs often stored here)
            let notes = [];
            try {
                const notesData = await ghlFetch(`${GHL_BASE}/contacts/${contactId}/notes`);
                notes = notesData.notes || [];
            } catch (e) { /* notes endpoint may not exist for all contacts */ }

            // Fetch tasks
            let tasks = [];
            try {
                const tasksData = await ghlFetch(`${GHL_BASE}/contacts/${contactId}/tasks`);
                tasks = tasksData.tasks || [];
            } catch (e) { /* ignore */ }

            return res.json({ notes, tasks });
        }

        // Bulk: Get speed-to-lead data for a location
        // Fetches contacts + their call activities in one go
        if (action === 'getSpeedToLead') {
            if (!locationId) return res.status(400).json({ error: 'locationId required' });

            const since = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const until = endDate || new Date().toISOString();

            // Step 1: Get contacts for this location
            const allContacts = [];
            let hasMore = true;
            let startAfterId = null;

            while (hasMore) {
                let url = `${GHL_BASE}/contacts/?locationId=${locationId}&limit=100`;
                if (startAfterId) url += `&startAfterId=${startAfterId}`;

                const data = await ghlFetch(url);
                const contacts = data.contacts || [];
                allContacts.push(...contacts);

                if (contacts.length < 100) {
                    hasMore = false;
                } else {
                    startAfterId = contacts[contacts.length - 1].id;
                }

                if (allContacts.length > 1000) {
                    hasMore = false;
                }
            }

            // Filter to date range
            const filtered = allContacts.filter(c => {
                const created = new Date(c.dateAdded || c.createdAt);
                return created >= new Date(since) && created <= new Date(until);
            });

            // Step 2: For each contact, try to find first call/activity
            // Process in batches of 10 to avoid rate limits
            const results = [];
            const batchSize = 10;

            for (let i = 0; i < filtered.length; i += batchSize) {
                const batch = filtered.slice(i, i + batchSize);
                const settled = await Promise.allSettled(batch.map(async (contact) => {
                    let firstCallTime = null;
                    let callType = null;

                    // Try to get notes (call logs)
                    try {
                        const notesData = await ghlFetch(`${GHL_BASE}/contacts/${contact.id}/notes`);
                        const callNotes = (notesData.notes || []).filter(n => {
                            const body = (n.body || '').toLowerCase();
                            return body.includes('call') || body.includes('called') || body.includes('spoke') || body.includes('voicemail') || body.includes('vm') || body.includes('phone') || body.includes('dial');
                        });
                        if (callNotes.length > 0) {
                            // Sort by date, get earliest
                            callNotes.sort((a, b) => new Date(a.dateAdded || a.createdAt) - new Date(b.dateAdded || b.createdAt));
                            firstCallTime = callNotes[0].dateAdded || callNotes[0].createdAt;
                            callType = 'note';
                        }
                    } catch (e) { /* ignore */ }

                    // Try to get tasks (completed call tasks)
                    try {
                        const tasksData = await ghlFetch(`${GHL_BASE}/contacts/${contact.id}/tasks`);
                        const callTasks = (tasksData.tasks || []).filter(t => {
                            const title = (t.title || '').toLowerCase();
                            const body = (t.body || '').toLowerCase();
                            return (title.includes('call') || body.includes('call')) && t.status === 'completed';
                        });
                        if (callTasks.length > 0) {
                            callTasks.sort((a, b) => new Date(a.dateAdded || a.createdAt) - new Date(b.dateAdded || b.createdAt));
                            const taskTime = callTasks[0].dateAdded || callTasks[0].createdAt;
                            // Use whichever came first - note or task
                            if (!firstCallTime || new Date(taskTime) < new Date(firstCallTime)) {
                                firstCallTime = taskTime;
                                callType = 'task';
                            }
                        }
                    } catch (e) { /* ignore */ }

                    const dateAdded = contact.dateAdded || contact.createdAt;
                    let speedMinutes = null;
                    if (firstCallTime && dateAdded) {
                        speedMinutes = Math.round((new Date(firstCallTime) - new Date(dateAdded)) / (1000 * 60));
                        if (speedMinutes < 0) speedMinutes = 0; // Clamp negatives
                    }

                    return {
                        id: contact.id,
                        name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contact.email || 'Unknown',
                        email: contact.email || '',
                        phone: contact.phone || '',
                        source: contact.source || '',
                        dateAdded,
                        firstCallTime,
                        callType,
                        speedMinutes,
                        called: !!firstCallTime,
                        tags: contact.tags || []
                    };
                }));

                for (const result of settled) {
                    if (result.status === 'fulfilled') {
                        results.push(result.value);
                    }
                }

                // Small delay between batches to respect rate limits
                if (i + batchSize < filtered.length) {
                    await new Promise(r => setTimeout(r, 200));
                }
            }

            // Calculate aggregate stats
            const called = results.filter(r => r.called);
            const uncalled = results.filter(r => !r.called);
            const speeds = called.map(r => r.speedMinutes).filter(s => s !== null && s >= 0);
            const avgSpeed = speeds.length > 0 ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : null;
            const medianSpeed = speeds.length > 0 ? speeds.sort((a, b) => a - b)[Math.floor(speeds.length / 2)] : null;
            const within1Min = speeds.filter(s => s <= 1).length;
            const within5Min = speeds.filter(s => s <= 5).length;
            const within1Hr = speeds.filter(s => s <= 60).length;
            const within24Hr = speeds.filter(s => s <= 1440).length;

            return res.json({
                leads: results,
                stats: {
                    totalLeads: results.length,
                    totalCalled: called.length,
                    totalUncalled: uncalled.length,
                    avgSpeedMinutes: avgSpeed,
                    medianSpeedMinutes: medianSpeed,
                    within1Min,
                    within5Min,
                    within1Hr,
                    within24Hr,
                    pctCalled: results.length > 0 ? Math.round((called.length / results.length) * 100) : 0,
                    pctWithin5Min: results.length > 0 ? Math.round((within5Min / results.length) * 100) : 0,
                    fastestMinutes: speeds.length > 0 ? Math.min(...speeds) : null,
                    slowestMinutes: speeds.length > 0 ? Math.max(...speeds) : null
                }
            });
        }

        // Fetch speed to lead for ALL locations at once
        if (action === 'getAllSpeedToLead') {
            const SUPABASE_URL = process.env.SUPABASE_URL;
            const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

            if (!SUPABASE_URL || !SUPABASE_KEY) {
                return res.status(500).json({ error: 'Supabase not configured' });
            }

            // Get GHL location mappings from Supabase
            const mappingsRes = await fetch(`${SUPABASE_URL}/rest/v1/client_ghl_locations?select=*`, {
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
            });
            const mappings = await mappingsRes.json();

            if (!Array.isArray(mappings) || mappings.length === 0) {
                return res.json({ results: {}, mappingsCount: 0, error: 'No GHL location mappings found. Please map clients to GHL locations first.' });
            }

            const since = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const until = endDate || new Date().toISOString();

            const results = {};
            const errors = {};

            // Process each location sequentially to avoid rate limits
            for (const mapping of mappings) {
                try {
                    // Recursively call ourselves for each location
                    const locationData = await processLocationSpeedToLead(ghlFetch, mapping.ghl_location_id, since, until);
                    results[mapping.client_name] = locationData;
                } catch (err) {
                    errors[mapping.client_name] = err.message;
                }
            }

            return res.json({
                results,
                errors: Object.keys(errors).length > 0 ? errors : undefined,
                dateRange: { since, until },
                mappingsCount: mappings.length
            });
        }

        return res.status(400).json({ error: 'Invalid action. Use "listLocations", "getContacts", "getContactActivity", "getSpeedToLead", or "getAllSpeedToLead".' });
    } catch (error) {
        console.error('GHL API error:', error);
        return res.status(500).json({ error: error.message });
    }
}

// Helper: process speed-to-lead for a single location
async function processLocationSpeedToLead(ghlFetch, locationId, since, until) {
    const GHL_BASE = 'https://services.leadconnectorhq.com';

    // Get contacts
    const allContacts = [];
    let hasMore = true;
    let startAfterId = null;

    while (hasMore) {
        let url = `${GHL_BASE}/contacts/?locationId=${locationId}&limit=100`;
        if (startAfterId) url += `&startAfterId=${startAfterId}`;

        const data = await ghlFetch(url);
        const contacts = data.contacts || [];
        allContacts.push(...contacts);

        if (contacts.length < 100) hasMore = false;
        else startAfterId = contacts[contacts.length - 1].id;
        if (allContacts.length > 500) hasMore = false;
    }

    const filtered = allContacts.filter(c => {
        const created = new Date(c.dateAdded || c.createdAt);
        return created >= new Date(since) && created <= new Date(until);
    });

    // Get call data for each contact
    const leads = [];
    const batchSize = 10;

    for (let i = 0; i < filtered.length; i += batchSize) {
        const batch = filtered.slice(i, i + batchSize);
        const settled = await Promise.allSettled(batch.map(async (contact) => {
            let firstCallTime = null;
            let callType = null;

            try {
                const notesData = await ghlFetch(`${GHL_BASE}/contacts/${contact.id}/notes`);
                const callNotes = (notesData.notes || []).filter(n => {
                    const body = (n.body || '').toLowerCase();
                    return body.includes('call') || body.includes('called') || body.includes('spoke') || body.includes('voicemail') || body.includes('vm') || body.includes('phone') || body.includes('dial');
                });
                if (callNotes.length > 0) {
                    callNotes.sort((a, b) => new Date(a.dateAdded || a.createdAt) - new Date(b.dateAdded || b.createdAt));
                    firstCallTime = callNotes[0].dateAdded || callNotes[0].createdAt;
                    callType = 'note';
                }
            } catch (e) { /* ignore */ }

            try {
                const tasksData = await ghlFetch(`${GHL_BASE}/contacts/${contact.id}/tasks`);
                const callTasks = (tasksData.tasks || []).filter(t => {
                    const title = (t.title || '').toLowerCase();
                    const body = (t.body || '').toLowerCase();
                    return (title.includes('call') || body.includes('call')) && t.status === 'completed';
                });
                if (callTasks.length > 0) {
                    callTasks.sort((a, b) => new Date(a.dateAdded || a.createdAt) - new Date(b.dateAdded || b.createdAt));
                    const taskTime = callTasks[0].dateAdded || callTasks[0].createdAt;
                    if (!firstCallTime || new Date(taskTime) < new Date(firstCallTime)) {
                        firstCallTime = taskTime;
                        callType = 'task';
                    }
                }
            } catch (e) { /* ignore */ }

            const dateAdded = contact.dateAdded || contact.createdAt;
            let speedMinutes = null;
            if (firstCallTime && dateAdded) {
                speedMinutes = Math.round((new Date(firstCallTime) - new Date(dateAdded)) / (1000 * 60));
                if (speedMinutes < 0) speedMinutes = 0;
            }

            return {
                id: contact.id,
                name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contact.email || 'Unknown',
                email: contact.email || '',
                phone: contact.phone || '',
                source: contact.source || '',
                dateAdded,
                firstCallTime,
                callType,
                speedMinutes,
                called: !!firstCallTime,
                tags: contact.tags || []
            };
        }));

        for (const result of settled) {
            if (result.status === 'fulfilled') leads.push(result.value);
        }

        if (i + batchSize < filtered.length) await new Promise(r => setTimeout(r, 200));
    }

    const called = leads.filter(r => r.called);
    const speeds = called.map(r => r.speedMinutes).filter(s => s !== null && s >= 0);
    const avgSpeed = speeds.length > 0 ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : null;
    const medianSpeed = speeds.length > 0 ? speeds.sort((a, b) => a - b)[Math.floor(speeds.length / 2)] : null;

    return {
        leads,
        stats: {
            totalLeads: leads.length,
            totalCalled: called.length,
            totalUncalled: leads.length - called.length,
            avgSpeedMinutes: avgSpeed,
            medianSpeedMinutes: medianSpeed,
            within1Min: speeds.filter(s => s <= 1).length,
            within5Min: speeds.filter(s => s <= 5).length,
            within1Hr: speeds.filter(s => s <= 60).length,
            within24Hr: speeds.filter(s => s <= 1440).length,
            pctCalled: leads.length > 0 ? Math.round((called.length / leads.length) * 100) : 0,
            pctWithin5Min: leads.length > 0 ? Math.round((speeds.filter(s => s <= 5).length / leads.length) * 100) : 0,
            fastestMinutes: speeds.length > 0 ? Math.min(...speeds) : null,
            slowestMinutes: speeds.length > 0 ? Math.max(...speeds) : null
        }
    };
}
