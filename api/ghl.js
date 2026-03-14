const GHL_API_KEY = process.env.GHL_API_KEY; // Agency-level PIT (fallback for listing locations)
const GHL_CLIENT_ID = process.env.GHL_CLIENT_ID;
const GHL_CLIENT_SECRET = process.env.GHL_CLIENT_SECRET;
const GHL_BASE = 'https://services.leadconnectorhq.com';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Create a ghlFetch that uses a specific token
const makeGhlFetch = (token) => async (url, options = {}) => {
    const resp = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
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

// Get the agency OAuth token from Supabase, refreshing if needed
async function getAgencyOAuthToken() {
    if (!SUPABASE_URL || !SUPABASE_KEY) return null;

    const resp = await fetch(`${SUPABASE_URL}/rest/v1/ghl_oauth_tokens?select=*&limit=1`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const tokens = await resp.json();
    if (!Array.isArray(tokens) || tokens.length === 0) return null;

    const stored = tokens[0];
    const expiresAt = new Date(stored.expires_at);

    // If token expires within 1 hour, refresh it
    if (expiresAt < new Date(Date.now() + 3600000) && stored.refresh_token && GHL_CLIENT_ID && GHL_CLIENT_SECRET) {
        try {
            const refreshResp = await fetch('https://services.leadconnectorhq.com/oauth/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: GHL_CLIENT_ID,
                    client_secret: GHL_CLIENT_SECRET,
                    grant_type: 'refresh_token',
                    refresh_token: stored.refresh_token,
                    user_type: stored.user_type || 'Company'
                }).toString()
            });
            const refreshData = await refreshResp.json();

            if (refreshData.access_token) {
                const newExpiresAt = new Date(Date.now() + (refreshData.expires_in || 86400) * 1000).toISOString();
                await fetch(`${SUPABASE_URL}/rest/v1/ghl_oauth_tokens?company_id=eq.${stored.company_id}`, {
                    method: 'PATCH',
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        access_token: refreshData.access_token,
                        refresh_token: refreshData.refresh_token,
                        expires_at: newExpiresAt,
                        updated_at: new Date().toISOString()
                    })
                });
                return { token: refreshData.access_token, companyId: stored.company_id, locationId: stored.location_id, userType: stored.user_type };
            }
        } catch (e) {
            console.error('Token refresh failed:', e);
        }
    }

    return { token: stored.access_token, companyId: stored.company_id, locationId: stored.location_id, userType: stored.user_type };
}

// Generate a location-level token from the agency OAuth token
async function getLocationToken(agencyToken, companyId, locationId) {
    const resp = await fetch(`${GHL_BASE}/oauth/locationToken`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${agencyToken}`,
            'Version': '2021-07-28',
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({ companyId, locationId })
    });
    const data = await resp.json();
    if (!data.access_token) throw new Error(`Failed to get location token: ${JSON.stringify(data)}`);
    return data.access_token;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { action, locationId, contactId, startDate, endDate, clientName } = req.body;

    // Get the best available agency token (OAuth first, then PIT fallback)
    const oauthData = await getAgencyOAuthToken();
    const agencyToken = oauthData?.token || GHL_API_KEY;
    const companyId = oauthData?.companyId;
    const oauthLocationId = oauthData?.locationId;
    const oauthUserType = oauthData?.userType;
    const agencyFetch = agencyToken ? makeGhlFetch(agencyToken) : null;
    const hasOAuth = !!oauthData?.token;

    try {
        // Check OAuth status
        if (action === 'oauthStatus') {
            return res.json({
                hasOAuth,
                hasPIT: !!GHL_API_KEY,
                hasClientCredentials: !!(GHL_CLIENT_ID && GHL_CLIENT_SECRET),
                companyId,
                oauthUserType,
                oauthLocationId,
                storedUserType: oauthData?.userType || 'NOT_SET',
                storedLocationId: oauthData?.locationId || 'NOT_SET'
            });
        }

        // List all locations using agency token
        if (action === 'listLocations') {
            if (!agencyFetch) return res.status(500).json({ error: 'No GHL token configured. Install the OAuth app or set GHL_API_KEY.' });

            const allLocations = [];
            let skip = 0;
            const limit = 100;
            let hasMore = true;

            while (hasMore) {
                const data = await agencyFetch(`${GHL_BASE}/locations/search?skip=${skip}&limit=${limit}`);
                const locations = data.locations || [];
                allLocations.push(...locations);
                if (locations.length < limit) hasMore = false;
                else skip += limit;
                if (allLocations.length > 500) hasMore = false;
            }

            return res.json({ locations: allLocations.map(l => ({ id: l.id, name: l.name, email: l.email, phone: l.phone })) });
        }

        // Test a sub-account token by trying to fetch contacts
        if (action === 'testToken') {
            const { token, testLocationId } = req.body;
            if (!token || !testLocationId) return res.status(400).json({ error: 'token and testLocationId required' });

            try {
                const testFetch = makeGhlFetch(token);
                const data = await testFetch(`${GHL_BASE}/contacts/?locationId=${testLocationId}&limit=1`);
                const count = (data.contacts || []).length;
                return res.json({ success: true, message: `Token works! Found contacts.`, contactCount: count });
            } catch (err) {
                return res.json({ success: false, message: err.message });
            }
        }

        // Generate location tokens for all mapped clients (OAuth only)
        if (action === 'generateLocationTokens') {
            if (!hasOAuth) {
                return res.status(400).json({ error: 'OAuth not configured. Install the GHL app first.' });
            }

            const mappingsRes = await fetch(`${SUPABASE_URL}/rest/v1/client_ghl_locations?select=*`, {
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
            });
            const mappings = await mappingsRes.json();

            if (!Array.isArray(mappings) || mappings.length === 0) {
                return res.json({ updated: 0, error: 'No mappings found' });
            }

            let updated = 0;
            let failed = 0;
            const errors = {};

            // Sub-Account token: can only assign to matching location
            if (oauthUserType === 'Location') {
                for (const mapping of mappings) {
                    if (mapping.ghl_location_id === oauthLocationId) {
                        await fetch(`${SUPABASE_URL}/rest/v1/client_ghl_locations?ghl_location_id=eq.${mapping.ghl_location_id}`, {
                            method: 'PATCH',
                            headers: {
                                'apikey': SUPABASE_KEY,
                                'Authorization': `Bearer ${SUPABASE_KEY}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ ghl_token: oauthData.token })
                        });
                        updated++;
                    }
                }
                return res.json({ updated, skipped: mappings.length - updated, total: mappings.length, note: 'Sub-Account token — only the installed location was updated. Install the app on more locations to add more.' });
            }

            // Company token: generate location tokens for all
            for (const mapping of mappings) {
                try {
                    const locToken = await getLocationToken(oauthData.token, companyId, mapping.ghl_location_id);
                    await fetch(`${SUPABASE_URL}/rest/v1/client_ghl_locations?ghl_location_id=eq.${mapping.ghl_location_id}`, {
                        method: 'PATCH',
                        headers: {
                            'apikey': SUPABASE_KEY,
                            'Authorization': `Bearer ${SUPABASE_KEY}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ ghl_token: locToken })
                    });
                    updated++;
                } catch (err) {
                    errors[mapping.client_name] = err.message;
                    failed++;
                }
                await new Promise(r => setTimeout(r, 100));
            }

            return res.json({ updated, failed, total: mappings.length, errors: Object.keys(errors).length > 0 ? errors : undefined });
        }

        // Fetch speed to lead for ALL locations
        if (action === 'getAllSpeedToLead') {
            if (!SUPABASE_URL || !SUPABASE_KEY) {
                return res.status(500).json({ error: 'Supabase not configured' });
            }

            // Get GHL location mappings from Supabase
            const mappingsRes = await fetch(`${SUPABASE_URL}/rest/v1/client_ghl_locations?select=*`, {
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
            });
            const mappings = await mappingsRes.json();

            if (!Array.isArray(mappings) || mappings.length === 0) {
                return res.json({ results: {}, mappingsCount: 0, error: 'No GHL location mappings found.' });
            }

            // Strategy: use stored ghl_token if available, otherwise try OAuth token directly
            const processable = [];
            for (const m of mappings) {
                if (m.ghl_token) {
                    processable.push({ ...m, tokenSource: 'stored' });
                } else if (hasOAuth) {
                    // Try OAuth token directly — works for the location the app was installed on
                    processable.push({ ...m, ghl_token: oauthData.token, tokenSource: 'oauth_direct' });
                }
            }

            if (processable.length === 0) {
                return res.json({ results: {}, mappingsCount: mappings.length, tokensConfigured: 0, error: 'No tokens available. Install the GHL OAuth app or add sub-account tokens manually.' });
            }

            const since = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const until = endDate || new Date().toISOString();

            const results = {};
            const errors = {};

            for (const mapping of processable) {
                try {
                    const locationFetch = makeGhlFetch(mapping.ghl_token);
                    const locationData = await processLocationSpeedToLead(locationFetch, mapping.ghl_location_id, since, until);
                    results[mapping.client_name] = locationData;
                } catch (err) {
                    errors[mapping.client_name] = err.message;
                }
            }

            return res.json({
                results,
                errors: Object.keys(errors).length > 0 ? errors : undefined,
                dateRange: { since, until },
                mappingsCount: mappings.length,
                tokensConfigured: processable.length
            });
        }

        // ========== CALL TRACKING: Fetch all calls for all clients ==========
        if (action === 'getAllCalls') {
            const mappingsRes = await fetch(`${SUPABASE_URL}/rest/v1/client_ghl_locations?select=*`, {
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
            });
            const mappings = await mappingsRes.json();

            if (!Array.isArray(mappings) || mappings.length === 0) {
                return res.json({ results: {}, mappingsCount: 0, error: 'No GHL location mappings found. Set up mappings in the Speed to Lead tab first.' });
            }

            const processable = [];
            for (const m of mappings) {
                if (m.ghl_token) {
                    processable.push({ ...m, tokenSource: 'stored' });
                } else if (hasOAuth) {
                    processable.push({ ...m, ghl_token: oauthData.token, tokenSource: 'oauth_direct' });
                }
            }

            if (processable.length === 0) {
                return res.json({ results: {}, mappingsCount: mappings.length, tokensConfigured: 0, error: 'No tokens available. Install the GHL OAuth app or add sub-account tokens.' });
            }

            const since = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const until = endDate || new Date().toISOString();

            const results = {};
            const errors = {};

            for (const mapping of processable) {
                try {
                    const locationFetch = makeGhlFetch(mapping.ghl_token);
                    const calls = await fetchLocationCalls(locationFetch, mapping.ghl_location_id, since, until);
                    const metrics = computeCallMetrics(calls);
                    results[mapping.client_name] = { calls, metrics };
                } catch (err) {
                    errors[mapping.client_name] = err.message;
                }
            }

            return res.json({
                results,
                errors: Object.keys(errors).length > 0 ? errors : undefined,
                dateRange: { since, until },
                mappingsCount: mappings.length,
                tokensConfigured: processable.length
            });
        }

        // ========== CALL TRACKING: Fetch calls for a single client ==========
        if (action === 'getClientCalls') {
            if (!clientName) return res.status(400).json({ error: 'clientName required' });

            const mappingRes = await fetch(
                `${SUPABASE_URL}/rest/v1/client_ghl_locations?client_name=eq.${encodeURIComponent(clientName)}&select=*&limit=1`,
                { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
            );
            const mappingArr = await mappingRes.json();

            if (!Array.isArray(mappingArr) || mappingArr.length === 0) {
                return res.status(404).json({ error: `No GHL mapping found for "${clientName}"` });
            }

            const mapping = mappingArr[0];
            const token = mapping.ghl_token || (hasOAuth ? oauthData.token : null);
            if (!token) return res.status(400).json({ error: 'No token available for this client' });

            const since = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const until = endDate || new Date().toISOString();

            const locationFetch = makeGhlFetch(token);
            const calls = await fetchLocationCalls(locationFetch, mapping.ghl_location_id, since, until);
            const metrics = computeCallMetrics(calls);

            return res.json({ calls, metrics, dateRange: { since, until } });
        }

        return res.status(400).json({ error: 'Invalid action.' });
    } catch (error) {
        console.error('GHL API error:', error);
        return res.status(500).json({ error: error.message });
    }
}

// Helper: process speed-to-lead for a single location
async function processLocationSpeedToLead(ghlFetch, locationId, since, until) {
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

// ========== CALL TRACKING HELPERS ==========

// Fetch all calls for a single location using the Conversations API
async function fetchLocationCalls(ghlFetch, locationId, startDate, endDate) {
    const calls = [];
    let page = 0;
    const maxPages = 20;
    let hasMore = true;
    let lastMessageAfter = null;

    while (hasMore && page < maxPages) {
        const searchBody = {
            locationId,
            limit: 50,
            type: 'TYPE_CALL',
            sortBy: 'last_message_date',
            sortOrder: 'desc'
        };

        if (startDate) searchBody.startsAfter = new Date(startDate).getTime();
        if (endDate) searchBody.startsBefore = new Date(endDate).getTime();
        if (lastMessageAfter) searchBody.lastMessageAfter = lastMessageAfter;

        try {
            const data = await ghlFetch(`${GHL_BASE}/conversations/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(searchBody)
            });

            const conversations = data.conversations || [];
            if (conversations.length === 0) { hasMore = false; break; }

            for (const conv of conversations) {
                try {
                    const messagesData = await ghlFetch(
                        `${GHL_BASE}/conversations/${conv.id}/messages?limit=50&type=TYPE_CALL`
                    );
                    const messages = messagesData.messages?.messages || messagesData.messages || [];

                    for (const msg of messages) {
                        const msgDate = new Date(msg.dateAdded || msg.createdAt);
                        if (startDate && msgDate < new Date(startDate)) continue;
                        if (endDate && msgDate > new Date(endDate)) continue;

                        // Extract recording URL
                        let recordingUrl = null;
                        if (msg.attachments && msg.attachments.length > 0) {
                            const audioAttachment = msg.attachments.find(a =>
                                a.url && (a.contentType?.startsWith('audio/') || a.url.includes('.mp3') || a.url.includes('.wav') || a.url.includes('recording'))
                            );
                            if (audioAttachment) recordingUrl = audioAttachment.url;
                        }
                        if (!recordingUrl && msg.meta?.recordingUrl) recordingUrl = msg.meta.recordingUrl;
                        if (!recordingUrl && msg.meta?.recording) recordingUrl = msg.meta.recording;
                        if (!recordingUrl && msg.recordingUrl) recordingUrl = msg.recordingUrl;

                        // Extract duration
                        let duration = null;
                        if (msg.meta?.duration != null) duration = parseInt(msg.meta.duration);
                        else if (msg.meta?.callDuration != null) duration = parseInt(msg.meta.callDuration);
                        else if (msg.duration != null) duration = parseInt(msg.duration);

                        // Call status
                        let callStatus = msg.meta?.callStatus || msg.meta?.status || msg.status || 'unknown';
                        if (callStatus === 'completed' && duration === 0) callStatus = 'no-answer';

                        // Direction
                        const direction = msg.direction || msg.meta?.direction || (msg.type === 1 ? 'inbound' : 'outbound');

                        calls.push({
                            id: msg.id || `${conv.id}-${msgDate.getTime()}`,
                            conversationId: conv.id,
                            contactId: conv.contactId,
                            contactName: conv.contactName || conv.fullName || 'Unknown',
                            contactEmail: conv.email || '',
                            contactPhone: conv.phone || '',
                            date: msg.dateAdded || msg.createdAt,
                            direction,
                            duration,
                            status: callStatus,
                            recordingUrl,
                            body: msg.body || ''
                        });
                    }
                } catch (msgErr) {
                    console.error(`Failed to fetch messages for conversation ${conv.id}:`, msgErr.message);
                    calls.push({
                        id: conv.id,
                        conversationId: conv.id,
                        contactId: conv.contactId,
                        contactName: conv.contactName || conv.fullName || 'Unknown',
                        contactEmail: conv.email || '',
                        contactPhone: conv.phone || '',
                        date: conv.lastMessageDate || conv.dateAdded,
                        direction: 'unknown',
                        duration: null,
                        status: 'unknown',
                        recordingUrl: null,
                        body: ''
                    });
                }
                await new Promise(r => setTimeout(r, 100));
            }

            if (conversations.length < 50) {
                hasMore = false;
            } else {
                const lastConv = conversations[conversations.length - 1];
                lastMessageAfter = lastConv.lastMessageDate || lastConv.dateAdded;
                if (!lastMessageAfter) hasMore = false;
            }
            page++;
        } catch (err) {
            console.error(`Conversations search failed for location ${locationId}:`, err.message);
            hasMore = false;
        }
    }

    return calls;
}

// Compute call metrics from raw call data
function computeCallMetrics(calls) {
    const totalCalls = calls.length;
    if (totalCalls === 0) {
        return {
            totalCalls: 0, inboundCalls: 0, outboundCalls: 0, answeredCalls: 0,
            missedCalls: 0, pickupRate: 0, avgDuration: 0, totalDuration: 0,
            longestCall: 0, shortestCall: 0, callsWithRecording: 0,
            callsByDay: {}, callsPerDay: 0, callsByHour: {}
        };
    }

    const answered = calls.filter(c => c.status === 'completed' && c.duration > 0);
    const missed = calls.filter(c => c.status === 'no-answer' || c.status === 'missed' || c.status === 'busy' || (c.status === 'completed' && c.duration === 0));
    const withDuration = calls.filter(c => c.duration != null && c.duration > 0);
    const withRecording = calls.filter(c => c.recordingUrl);

    const durations = withDuration.map(c => c.duration);
    const totalDuration = durations.reduce((a, b) => a + b, 0);
    const avgDuration = durations.length > 0 ? Math.round(totalDuration / durations.length) : 0;

    const callsByDay = {};
    const callsByHour = {};
    const uniqueDates = new Set();

    for (const call of calls) {
        if (call.date) {
            const d = new Date(call.date);
            const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
            callsByDay[dayName] = (callsByDay[dayName] || 0) + 1;
            const hour = d.getHours();
            const hourLabel = hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;
            callsByHour[hourLabel] = (callsByHour[hourLabel] || 0) + 1;
            uniqueDates.add(d.toISOString().split('T')[0]);
        }
    }

    const dayCount = uniqueDates.size || 1;

    return {
        totalCalls,
        inboundCalls: calls.filter(c => c.direction === 'inbound').length,
        outboundCalls: calls.filter(c => c.direction === 'outbound').length,
        answeredCalls: answered.length,
        missedCalls: missed.length,
        pickupRate: totalCalls > 0 ? Math.round((answered.length / totalCalls) * 100) : 0,
        avgDuration,
        totalDuration,
        longestCall: durations.length > 0 ? Math.max(...durations) : 0,
        shortestCall: durations.length > 0 ? Math.min(...durations) : 0,
        callsWithRecording: withRecording.length,
        callsByDay,
        callsPerDay: Math.round((totalCalls / dayCount) * 10) / 10,
        callsByHour,
        dayCount
    };
}
