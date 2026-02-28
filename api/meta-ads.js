// api/meta-ads.js
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!META_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'META_ACCESS_TOKEN not configured' });
  }

  const { action } = req.body;

  try {
    if (action === 'listAdAccounts') {
      // Get all ad accounts from Business Manager
      const url = `https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name,business_name&access_token=${META_ACCESS_TOKEN}&limit=100`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.error) {
        return res.status(400).json({ error: data.error.message });
      }

      return res.json({ accounts: data.data || [] });
    }

    if (action === 'fetchAll') {
      if (!SUPABASE_URL || !SUPABASE_KEY) {
        return res.status(500).json({ error: 'Supabase not configured' });
      }

      // Get mappings from Supabase
      const mappingsRes = await fetch(`${SUPABASE_URL}/rest/v1/client_ad_accounts?select=*`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      });
      const mappings = await mappingsRes.json();

      if (!Array.isArray(mappings)) {
        return res.json({ results: {} });
      }

      // Fetch insights for each mapped account
      const results = {};
      for (const mapping of mappings) {
        const accountId = mapping.meta_ad_account_id;
        const url = `https://graph.facebook.com/v19.0/act_${accountId}/insights?fields=spend,actions&date_preset=last_7d&access_token=${META_ACCESS_TOKEN}`;

        try {
          const insightRes = await fetch(url);
          const insightData = await insightRes.json();

          if (insightData.data && insightData.data[0]) {
            const insight = insightData.data[0];
            const spend = parseFloat(insight.spend || 0);
            const leads = parseInt(
              (insight.actions || []).find(a => a.action_type === 'lead')?.value || 0
            );
            results[mapping.client_name] = {
              spend: spend.toFixed(2),
              leads: leads,
              cpl: leads > 0 ? (spend / leads).toFixed(2) : null
            };
          }
        } catch (err) {
          console.error(`Error fetching insights for ${mapping.client_name}:`, err);
        }
      }

      return res.json({ results });
    }

    return res.status(400).json({ error: 'Invalid action. Use "listAdAccounts" or "fetchAll".' });
  } catch (error) {
    console.error('Meta API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
