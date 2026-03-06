// GHL OAuth Token Refresh
// Called periodically or on-demand to refresh expired tokens
// Agency tokens expire in ~24 hours, refresh tokens last 1 year

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GHL_CLIENT_ID = process.env.GHL_CLIENT_ID;
const GHL_CLIENT_SECRET = process.env.GHL_CLIENT_SECRET;
const GHL_TOKEN_URL = 'https://services.leadconnectorhq.com/oauth/token';
const GHL_BASE = 'https://services.leadconnectorhq.com';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    if (!SUPABASE_URL || !SUPABASE_KEY || !GHL_CLIENT_ID || !GHL_CLIENT_SECRET) {
        return res.status(500).json({ error: 'Missing required env vars' });
    }

    try {
        // Get stored tokens from Supabase
        const tokensResp = await fetch(`${SUPABASE_URL}/rest/v1/ghl_oauth_tokens?select=*&limit=1`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        const tokens = await tokensResp.json();

        if (!Array.isArray(tokens) || tokens.length === 0) {
            return res.status(400).json({ error: 'No OAuth tokens found. Please install the GHL app first.' });
        }

        const stored = tokens[0];

        // Check if token is expired or about to expire (within 1 hour)
        const expiresAt = new Date(stored.expires_at);
        const isExpired = expiresAt < new Date(Date.now() + 3600000);

        if (!isExpired) {
            return res.json({ message: 'Token still valid', expiresAt: stored.expires_at });
        }

        // Refresh the token
        const refreshResp = await fetch(GHL_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: GHL_CLIENT_ID,
                client_secret: GHL_CLIENT_SECRET,
                grant_type: 'refresh_token',
                refresh_token: stored.refresh_token,
                user_type: 'Company'
            }).toString()
        });

        const refreshData = await refreshResp.json();

        if (refreshData.error || !refreshData.access_token) {
            return res.status(400).json({ error: 'Token refresh failed', details: refreshData });
        }

        const newExpiresAt = new Date(Date.now() + (refreshData.expires_in || 86400) * 1000).toISOString();

        // Update stored tokens
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

        // Re-generate location tokens for all sub-accounts
        const companyId = stored.company_id;
        const agencyToken = refreshData.access_token;

        // List all locations
        const allLocations = [];
        let skip = 0;
        let hasMore = true;

        while (hasMore) {
            const resp = await fetch(`${GHL_BASE}/locations/search?skip=${skip}&limit=100`, {
                headers: {
                    'Authorization': `Bearer ${agencyToken}`,
                    'Version': '2021-07-28',
                    'Accept': 'application/json'
                }
            });
            const data = await resp.json();
            const locations = data.locations || [];
            allLocations.push(...locations);
            if (locations.length < 100) hasMore = false;
            else skip += 100;
            if (allLocations.length > 500) hasMore = false;
        }

        // Generate location tokens
        let updated = 0;
        let errors = 0;

        for (const loc of allLocations) {
            try {
                const tokenResp = await fetch(`${GHL_BASE}/oauth/locationToken`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${agencyToken}`,
                        'Version': '2021-07-28',
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({ companyId, locationId: loc.id })
                });

                const tokenData = await tokenResp.json();

                if (tokenData.access_token) {
                    await fetch(`${SUPABASE_URL}/rest/v1/client_ghl_locations?ghl_location_id=eq.${loc.id}`, {
                        method: 'PATCH',
                        headers: {
                            'apikey': SUPABASE_KEY,
                            'Authorization': `Bearer ${SUPABASE_KEY}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ ghl_token: tokenData.access_token })
                    });
                    updated++;
                }
            } catch (err) {
                errors++;
            }
            await new Promise(r => setTimeout(r, 100));
        }

        return res.json({
            message: 'Tokens refreshed successfully',
            agencyTokenExpires: newExpiresAt,
            locationTokensUpdated: updated,
            locationTokenErrors: errors,
            totalLocations: allLocations.length
        });

    } catch (error) {
        console.error('GHL refresh error:', error);
        return res.status(500).json({ error: error.message });
    }
}
