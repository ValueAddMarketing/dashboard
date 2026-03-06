// GHL OAuth Callback Handler
// This endpoint receives the authorization code from GHL after app installation
// and exchanges it for access + refresh tokens, then stores them in Supabase.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GHL_CLIENT_ID = process.env.GHL_CLIENT_ID;
const GHL_CLIENT_SECRET = process.env.GHL_CLIENT_SECRET;
const GHL_TOKEN_URL = 'https://services.leadconnectorhq.com/oauth/token';

export default async function handler(req, res) {
    // This is a GET request - GHL redirects here with ?code=XXX
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(200).end();
    }

    const { code } = req.query;

    if (!code) {
        return res.status(400).send('Missing authorization code. Please install the app from GHL.');
    }

    if (!GHL_CLIENT_ID || !GHL_CLIENT_SECRET) {
        return res.status(500).send('GHL OAuth credentials not configured. Set GHL_CLIENT_ID and GHL_CLIENT_SECRET in Vercel env vars.');
    }

    try {
        // Exchange authorization code for tokens
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
            console.error('GHL token exchange failed:', tokenData);
            return res.status(400).send(`Token exchange failed: ${tokenData.error || tokenData.message || JSON.stringify(tokenData)}`);
        }

        const {
            access_token,
            refresh_token,
            expires_in,
            userType,
            companyId,
            locationId
        } = tokenData;

        // Store tokens in Supabase
        if (!SUPABASE_URL || !SUPABASE_KEY) {
            return res.status(500).send('Supabase not configured');
        }

        const expiresAt = new Date(Date.now() + (expires_in || 86400) * 1000).toISOString();

        // Upsert the OAuth tokens
        const upsertResp = await fetch(`${SUPABASE_URL}/rest/v1/ghl_oauth_tokens`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify({
                company_id: companyId || 'default',
                access_token,
                refresh_token,
                expires_at: expiresAt,
                user_type: userType || 'Company',
                location_id: locationId || null,
                updated_at: new Date().toISOString()
            })
        });

        if (!upsertResp.ok) {
            const errText = await upsertResp.text();
            console.error('Supabase upsert failed:', errText);
            return res.status(500).send(`Failed to store tokens: ${errText}`);
        }

        // If it's a Company-level token, generate location tokens for all sub-accounts
        if (userType === 'Company' && companyId) {
            // Fire off location token generation in the background
            generateAllLocationTokens(access_token, companyId).catch(err => {
                console.error('Background location token generation failed:', err);
            });
        }

        // Redirect to dashboard with success message
        return res.redirect(302, '/?ghl_setup=success');

    } catch (error) {
        console.error('GHL OAuth callback error:', error);
        return res.status(500).send(`OAuth error: ${error.message}`);
    }
}

function getBaseUrl(req) {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return `${proto}://${host}`;
}

// Generate location-level tokens for all sub-accounts and store them
async function generateAllLocationTokens(agencyToken, companyId) {
    const GHL_BASE = 'https://services.leadconnectorhq.com';

    // 1. List all locations
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

    // 2. For each location, generate a location-level access token
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
                body: JSON.stringify({
                    companyId,
                    locationId: loc.id
                })
            });

            const tokenData = await tokenResp.json();

            if (tokenData.access_token) {
                // Update the client_ghl_locations table with this token
                await fetch(`${SUPABASE_URL}/rest/v1/client_ghl_locations?ghl_location_id=eq.${loc.id}`, {
                    method: 'PATCH',
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        ghl_token: tokenData.access_token
                    })
                });
            }
        } catch (err) {
            console.error(`Failed to generate token for location ${loc.id} (${loc.name}):`, err.message);
        }

        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 100));
    }
}
