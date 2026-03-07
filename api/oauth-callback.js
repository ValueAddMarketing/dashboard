// GHL OAuth Callback Handler
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

        const { access_token, refresh_token, expires_in, userType, companyId, locationId } = tokenData;

        if (!SUPABASE_URL || !SUPABASE_KEY) {
            return res.status(500).send('Supabase not configured');
        }

        const expiresAt = new Date(Date.now() + (expires_in || 86400) * 1000).toISOString();
        const cid = companyId || 'default';

        // Upsert using PostgREST on_conflict parameter
        const upsertResp = await fetch(`${SUPABASE_URL}/rest/v1/ghl_oauth_tokens?on_conflict=company_id`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates,return=minimal'
            },
            body: JSON.stringify({
                company_id: cid,
                access_token,
                refresh_token,
                expires_at: expiresAt,
                user_type: userType || 'Location',
                location_id: locationId || null,
                updated_at: new Date().toISOString()
            })
        });

        if (!upsertResp.ok) {
            const errText = await upsertResp.text();
            return res.status(500).send(`Failed to store tokens: ${errText}`);
        }

        // Redirect to dashboard with success
        return res.redirect(302, '/?ghl_setup=success');

    } catch (error) {
        return res.status(500).send(`OAuth error: ${error.message}`);
    }
}

function getBaseUrl(req) {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return `${proto}://${host}`;
}
