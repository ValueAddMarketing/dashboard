// api/meta-ads.js
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Valid Meta date presets
const VALID_DATE_PRESETS = [
  'today', 'yesterday', 'last_3d', 'last_7d', 'last_14d',
  'last_28d', 'last_30d', 'last_90d', 'this_month', 'last_month',
  'this_quarter', 'maximum'
];

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

  const { action, datePreset } = req.body;
  const selectedPreset = VALID_DATE_PRESETS.includes(datePreset) ? datePreset : 'last_7d';

  try {
    // Diagnostic action to check env vars
    if (action === 'diagnose') {
      return res.json({
        envVars: {
          META_ACCESS_TOKEN: META_ACCESS_TOKEN ? `set (${META_ACCESS_TOKEN.slice(0, 8)}...)` : 'NOT SET',
          SUPABASE_URL: SUPABASE_URL || 'NOT SET',
          SUPABASE_SERVICE_KEY: SUPABASE_KEY ? `set (${SUPABASE_KEY.slice(0, 8)}...)` : 'NOT SET'
        }
      });
    }

    if (action === 'listAdAccounts') {
      const url = `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,business_name&access_token=${META_ACCESS_TOKEN}&limit=100`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.error) {
        return res.status(400).json({ error: data.error.message });
      }

      return res.json({ accounts: data.data || [] });
    }

    if (action === 'fetchAll') {
      if (!SUPABASE_URL || !SUPABASE_KEY) {
        return res.status(500).json({ error: 'Supabase not configured', detail: { SUPABASE_URL: !!SUPABASE_URL, SUPABASE_SERVICE_KEY: !!SUPABASE_KEY } });
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
        return res.json({ results: {}, debug: { mappingsError: mappings, mappingsCount: 0 } });
      }

      // Fetch expanded insights for each mapped account
      const insightFields = [
        'spend', 'impressions', 'reach', 'clicks',
        'ctr', 'cpc', 'cpm', 'frequency',
        'actions', 'cost_per_action_type'
      ].join(',');

      const results = {};
      const errors = {};
      for (const mapping of mappings) {
        const accountId = mapping.meta_ad_account_id;
        const url = `https://graph.facebook.com/v21.0/act_${accountId}/insights?fields=${insightFields}&date_preset=${selectedPreset}&access_token=${META_ACCESS_TOKEN}`;

        try {
          const insightRes = await fetch(url);
          const insightData = await insightRes.json();

          if (insightData.error) {
            errors[mapping.client_name] = insightData.error.message;
            continue;
          }

          if (insightData.data && insightData.data[0]) {
            const insight = insightData.data[0];
            const spend = parseFloat(insight.spend || 0);
            const impressions = parseInt(insight.impressions || 0);
            const reach = parseInt(insight.reach || 0);
            const clicks = parseInt(insight.clicks || 0);
            const ctr = parseFloat(insight.ctr || 0);
            const cpc = parseFloat(insight.cpc || 0);
            const cpm = parseFloat(insight.cpm || 0);
            const frequency = parseFloat(insight.frequency || 0);

            // Extract specific action values
            const actions = insight.actions || [];
            const costPerAction = insight.cost_per_action_type || [];
            const leads = parseInt(actions.find(a => a.action_type === 'lead')?.value || 0);
            const linkClicks = parseInt(actions.find(a => a.action_type === 'link_click')?.value || 0);
            const pageEngagement = parseInt(actions.find(a => a.action_type === 'page_engagement')?.value || 0);
            const postEngagement = parseInt(actions.find(a => a.action_type === 'post_engagement')?.value || 0);
            const costPerLead = parseFloat(costPerAction.find(a => a.action_type === 'lead')?.value || 0);

            results[mapping.client_name] = {
              spend: spend.toFixed(2),
              impressions,
              reach,
              clicks,
              ctr: ctr.toFixed(2),
              cpc: cpc.toFixed(2),
              cpm: cpm.toFixed(2),
              frequency: frequency.toFixed(2),
              leads,
              linkClicks,
              pageEngagement,
              postEngagement,
              cpl: leads > 0 ? (spend / leads).toFixed(2) : costPerLead > 0 ? costPerLead.toFixed(2) : null,
              datePreset: selectedPreset
            };
          } else {
            errors[mapping.client_name] = 'No insights data returned (account may have no activity in this date range)';
          }
        } catch (err) {
          errors[mapping.client_name] = err.message;
        }
      }

      return res.json({
        results,
        datePreset: selectedPreset,
        debug: {
          mappingsCount: mappings.length,
          mappings: mappings.map(m => ({ client: m.client_name, accountId: m.meta_ad_account_id })),
          errors: Object.keys(errors).length > 0 ? errors : undefined
        }
      });
    }

    return res.status(400).json({ error: 'Invalid action. Use "listAdAccounts" or "fetchAll".' });
  } catch (error) {
    console.error('Meta API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
