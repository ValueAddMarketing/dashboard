// GHL OAuth Callback Handler
// Exchanges authorization code for token, stores it in client_ghl_locations for the location
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GHL_CLIENT_ID = process.env.GHL_CLIENT_ID;
const GHL_CLIENT_SECRET = process.env.GHL_CLIENT_SECRET;
const GHL_TOKEN_URL = 'https://services.leadconnectorhq.com/oauth/token';

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(200).end();
    }

    const { code } = req.query;

    if (!code) {
        return res.status(400).send('Missing authorization code.');
    }

    if (!GHL_CLIENT_ID || !GHL_CLIENT_SECRET) {
        return res.status(500).send('GHL OAuth credentials not configured.');
    }

    try {
        // Exchange authorization code for tokens (Company-level for batch access)
        const tokenResp = await fetch(GHL_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: GHL_CLIENT_ID,
                client_secret: GHL_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code,
                user_type: 'Company',
                redirect_uri: `${getBaseUrl(req)}/api/oauth-callback`
            }).toString()
        });

        const tokenData = await tokenResp.json();

        if (tokenData.error || !tokenData.access_token) {
            return res.status(400).send(`Token exchange failed: ${JSON.stringify(tokenData)}`);
        }

        const { access_token, refresh_token, expires_in, locationId, companyId } = tokenData;

        if (!SUPABASE_URL || !SUPABASE_KEY) {
            return res.status(500).send('Supabase not configured');
        }

        const expiresAt = new Date(Date.now() + (expires_in || 86400) * 1000).toISOString();

        // Store agency-level token in ghl_oauth_tokens (upsert by company_id)
        if (companyId) {
            await fetch(
                `${SUPABASE_URL}/rest/v1/ghl_oauth_tokens`,
                {
                    method: 'POST',
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'resolution=merge-duplicates'
                    },
                    body: JSON.stringify({
                        company_id: companyId,
                        access_token,
                        refresh_token: refresh_token || '',
                        expires_at: expiresAt,
                        user_type: 'Company',
                        location_id: locationId || null,
                        updated_at: new Date().toISOString()
                    })
                }
            );
        }

        // Also generate location tokens for all mapped sub-accounts
        let tokensGenerated = 0;
        try {
            const mappingsResp = await fetch(`${SUPABASE_URL}/rest/v1/client_ghl_locations?select=*`, {
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
            });
            const mappings = await mappingsResp.json();

            if (Array.isArray(mappings) && mappings.length > 0 && companyId) {
                for (const mapping of mappings) {
                    try {
                        // Generate location-level token from agency token
                        const locResp = await fetch('https://services.leadconnectorhq.com/oauth/locationToken', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${access_token}`,
                                'Version': '2021-07-28',
                                'Content-Type': 'application/json',
                                'Accept': 'application/json'
                            },
                            body: JSON.stringify({ companyId, locationId: mapping.ghl_location_id })
                        });
                        const locData = await locResp.json();
                        if (locData.access_token) {
                            await fetch(
                                `${SUPABASE_URL}/rest/v1/client_ghl_locations?ghl_location_id=eq.${encodeURIComponent(mapping.ghl_location_id)}`,
                                {
                                    method: 'PATCH',
                                    headers: {
                                        'apikey': SUPABASE_KEY,
                                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({ ghl_token: locData.access_token })
                                }
                            );
                            tokensGenerated++;
                        }
                    } catch (e) { /* skip failed locations */ }
                    await new Promise(r => setTimeout(r, 100));
                }
            }
        } catch (e) { /* non-blocking */ }

        // Redirect to dashboard with result
        return res.redirect(302, `/?ghl_oauth=success&company=${companyId || 'none'}&tokens_generated=${tokensGenerated}`);

    } catch (error) {
        return res.status(500).send(`OAuth error: ${error.message}`);
    }
}

function getBaseUrl(req) {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return `${proto}://${host}`;
}
