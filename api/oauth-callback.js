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
        // Exchange authorization code for tokens
        const tokenResp = await fetch(GHL_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: GHL_CLIENT_ID,
                client_secret: GHL_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code,
                user_type: 'Location',
                redirect_uri: `${getBaseUrl(req)}/api/oauth-callback`
            }).toString()
        });

        const tokenData = await tokenResp.json();

        if (tokenData.error || !tokenData.access_token) {
            return res.status(400).send(`Token exchange failed: ${JSON.stringify(tokenData)}`);
        }

        const { access_token, locationId, companyId } = tokenData;

        if (!SUPABASE_URL || !SUPABASE_KEY) {
            return res.status(500).send('Supabase not configured');
        }

        let updated = false;

        // Store token directly in client_ghl_locations for the matching location
        if (locationId) {
            const patchResp = await fetch(
                `${SUPABASE_URL}/rest/v1/client_ghl_locations?ghl_location_id=eq.${encodeURIComponent(locationId)}`,
                {
                    method: 'PATCH',
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify({ ghl_token: access_token })
                }
            );
            const patchResult = await patchResp.json();
            if (Array.isArray(patchResult) && patchResult.length > 0) {
                updated = true;
            }
        }

        // Redirect to dashboard with result
        const clientName = updated ? 'location' : 'unknown';
        return res.redirect(302, `/?ghl_token_saved=${updated ? 'true' : 'false'}&locationId=${locationId || 'none'}`);

    } catch (error) {
        return res.status(500).send(`OAuth error: ${error.message}`);
    }
}

function getBaseUrl(req) {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return `${proto}://${host}`;
}
