// api/meta-ads-manage.js — Campaign management: status toggles, budget edits, campaign structure
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
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
    // Fetch campaign structure (campaigns → ad sets → ads) for an ad account
    if (action === 'fetchStructure') {
      const { adAccountId } = req.body;
      if (!adAccountId) return res.status(400).json({ error: 'adAccountId required' });

      const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

      // Fetch campaigns
      const campaignsUrl = `https://graph.facebook.com/v21.0/${accountId}/campaigns?fields=id,name,status,daily_budget,lifetime_budget,budget_remaining,objective,buying_type&limit=100&access_token=${META_ACCESS_TOKEN}`;
      const campaignsRes = await fetch(campaignsUrl);
      const campaignsData = await campaignsRes.json();

      if (campaignsData.error) {
        return res.status(400).json({ error: campaignsData.error.message });
      }

      const campaigns = campaignsData.data || [];

      // For each campaign, fetch ad sets
      const results = [];
      for (const campaign of campaigns) {
        const adSetsUrl = `https://graph.facebook.com/v21.0/${campaign.id}/adsets?fields=id,name,status,daily_budget,lifetime_budget,budget_remaining,optimization_goal,billing_event,targeting&limit=100&access_token=${META_ACCESS_TOKEN}`;
        const adSetsRes = await fetch(adSetsUrl);
        const adSetsData = await adSetsRes.json();

        const adSets = [];
        if (adSetsData.data) {
          for (const adSet of adSetsData.data) {
            // Fetch ads for each ad set
            const adsUrl = `https://graph.facebook.com/v21.0/${adSet.id}/ads?fields=id,name,status,creative{id,name,title,body,image_url,thumbnail_url}&limit=100&access_token=${META_ACCESS_TOKEN}`;
            const adsRes = await fetch(adsUrl);
            const adsData = await adsRes.json();

            adSets.push({
              id: adSet.id,
              name: adSet.name,
              status: adSet.status,
              daily_budget: adSet.daily_budget ? (parseInt(adSet.daily_budget) / 100).toFixed(2) : null,
              lifetime_budget: adSet.lifetime_budget ? (parseInt(adSet.lifetime_budget) / 100).toFixed(2) : null,
              budget_remaining: adSet.budget_remaining ? (parseInt(adSet.budget_remaining) / 100).toFixed(2) : null,
              optimization_goal: adSet.optimization_goal,
              ads: (adsData.data || []).map(ad => ({
                id: ad.id,
                name: ad.name,
                status: ad.status,
                creative: ad.creative || null
              }))
            });
          }
        }

        results.push({
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          daily_budget: campaign.daily_budget ? (parseInt(campaign.daily_budget) / 100).toFixed(2) : null,
          lifetime_budget: campaign.lifetime_budget ? (parseInt(campaign.lifetime_budget) / 100).toFixed(2) : null,
          budget_remaining: campaign.budget_remaining ? (parseInt(campaign.budget_remaining) / 100).toFixed(2) : null,
          objective: campaign.objective,
          adSets
        });
      }

      return res.json({ campaigns: results });
    }

    // Fetch campaign structure for ALL mapped clients at once
    if (action === 'fetchAllStructures') {
      if (!SUPABASE_URL || !SUPABASE_KEY) {
        return res.status(500).json({ error: 'Supabase not configured' });
      }

      const mappingsRes = await fetch(`${SUPABASE_URL}/rest/v1/client_ad_accounts?select=*`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      });
      const mappings = await mappingsRes.json();
      if (!Array.isArray(mappings)) return res.json({ results: {} });

      const results = {};
      const errors = {};

      // Process in batches of 3 to avoid rate limits (this fetches a lot of data)
      const batchSize = 3;
      for (let i = 0; i < mappings.length; i += batchSize) {
        const batch = mappings.slice(i, i + batchSize);
        const settled = await Promise.allSettled(batch.map(async (mapping) => {
          const accountId = `act_${mapping.meta_ad_account_id}`;
          const campaignsUrl = `https://graph.facebook.com/v21.0/${accountId}/campaigns?fields=id,name,status,daily_budget,lifetime_budget,budget_remaining,objective&limit=50&access_token=${META_ACCESS_TOKEN}`;
          const campaignsRes = await fetch(campaignsUrl);
          const campaignsData = await campaignsRes.json();

          if (campaignsData.error) throw new Error(campaignsData.error.message);

          const campaigns = [];
          for (const campaign of (campaignsData.data || [])) {
            const adSetsUrl = `https://graph.facebook.com/v21.0/${campaign.id}/adsets?fields=id,name,status,daily_budget,lifetime_budget,budget_remaining&limit=50&access_token=${META_ACCESS_TOKEN}`;
            const adSetsRes = await fetch(adSetsUrl);
            const adSetsData = await adSetsRes.json();

            const adSets = [];
            for (const adSet of (adSetsData.data || [])) {
              const adsUrl = `https://graph.facebook.com/v21.0/${adSet.id}/ads?fields=id,name,status&limit=50&access_token=${META_ACCESS_TOKEN}`;
              const adsRes = await fetch(adsUrl);
              const adsData = await adsRes.json();
              adSets.push({
                id: adSet.id, name: adSet.name, status: adSet.status,
                daily_budget: adSet.daily_budget ? (parseInt(adSet.daily_budget) / 100).toFixed(2) : null,
                lifetime_budget: adSet.lifetime_budget ? (parseInt(adSet.lifetime_budget) / 100).toFixed(2) : null,
                ads: (adsData.data || []).map(ad => ({ id: ad.id, name: ad.name, status: ad.status }))
              });
            }
            campaigns.push({
              id: campaign.id, name: campaign.name, status: campaign.status,
              daily_budget: campaign.daily_budget ? (parseInt(campaign.daily_budget) / 100).toFixed(2) : null,
              lifetime_budget: campaign.lifetime_budget ? (parseInt(campaign.lifetime_budget) / 100).toFixed(2) : null,
              objective: campaign.objective,
              adSets
            });
          }
          return { clientName: mapping.client_name, campaigns };
        }));

        for (const result of settled) {
          if (result.status === 'fulfilled') {
            results[result.value.clientName] = result.value.campaigns;
          } else {
            const idx = settled.indexOf(result);
            errors[batch[idx]?.client_name || 'unknown'] = result.reason?.message || 'Unknown error';
          }
        }
      }

      return res.json({ results, errors: Object.keys(errors).length > 0 ? errors : undefined });
    }

    // Update status (ACTIVE/PAUSED) for a campaign, ad set, or ad
    if (action === 'updateStatus') {
      const { objectId, newStatus } = req.body;
      if (!objectId || !newStatus) return res.status(400).json({ error: 'objectId and newStatus required' });

      const validStatuses = ['ACTIVE', 'PAUSED'];
      if (!validStatuses.includes(newStatus)) {
        return res.status(400).json({ error: 'newStatus must be ACTIVE or PAUSED' });
      }

      const url = `https://graph.facebook.com/v21.0/${objectId}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `status=${newStatus}&access_token=${META_ACCESS_TOKEN}`
      });
      const data = await response.json();

      if (data.error) {
        return res.status(400).json({ error: data.error.message });
      }

      return res.json({ success: true, objectId, newStatus });
    }

    // Update budget for a campaign or ad set
    if (action === 'updateBudget') {
      const { objectId, budgetType, amount } = req.body;
      if (!objectId || !budgetType || amount === undefined) {
        return res.status(400).json({ error: 'objectId, budgetType, and amount required' });
      }

      if (!['daily_budget', 'lifetime_budget'].includes(budgetType)) {
        return res.status(400).json({ error: 'budgetType must be daily_budget or lifetime_budget' });
      }

      // Meta API expects budget in cents
      const budgetInCents = Math.round(parseFloat(amount) * 100);
      if (isNaN(budgetInCents) || budgetInCents < 100) {
        return res.status(400).json({ error: 'Budget must be at least $1.00' });
      }

      const url = `https://graph.facebook.com/v21.0/${objectId}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `${budgetType}=${budgetInCents}&access_token=${META_ACCESS_TOKEN}`
      });
      const data = await response.json();

      if (data.error) {
        return res.status(400).json({ error: data.error.message });
      }

      return res.json({ success: true, objectId, budgetType, amount: (budgetInCents / 100).toFixed(2) });
    }

    // Fetch today's spend for all mapped accounts
    if (action === 'fetchTodaySpend') {
      if (!SUPABASE_URL || !SUPABASE_KEY) {
        return res.status(500).json({ error: 'Supabase not configured' });
      }

      const mappingsRes = await fetch(`${SUPABASE_URL}/rest/v1/client_ad_accounts?select=*`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      });
      const mappings = await mappingsRes.json();
      if (!Array.isArray(mappings)) return res.json({ results: {} });

      const today = new Date().toISOString().split('T')[0];
      const results = {};
      const errors = {};

      const batchSize = 5;
      for (let i = 0; i < mappings.length; i += batchSize) {
        const batch = mappings.slice(i, i + batchSize);
        const settled = await Promise.allSettled(batch.map(async (mapping) => {
          const accountId = mapping.meta_ad_account_id;
          const timeRange = JSON.stringify({ since: today, until: today });
          const url = `https://graph.facebook.com/v21.0/act_${accountId}/insights?fields=spend&time_range=${encodeURIComponent(timeRange)}&access_token=${META_ACCESS_TOKEN}`;
          const resp = await fetch(url);
          const data = await resp.json();
          if (data.error) throw new Error(data.error.message);
          const spend = data.data && data.data[0] ? parseFloat(data.data[0].spend || 0) : 0;
          return { clientName: mapping.client_name, spend };
        }));

        for (const result of settled) {
          if (result.status === 'fulfilled') {
            results[result.value.clientName] = result.value.spend;
          } else {
            const idx = settled.indexOf(result);
            errors[batch[idx]?.client_name || 'unknown'] = result.reason?.message || 'Unknown error';
          }
        }
      }

      return res.json({ results, errors: Object.keys(errors).length > 0 ? errors : undefined });
    }

    return res.status(400).json({ error: 'Invalid action. Use fetchStructure, fetchAllStructures, updateStatus, updateBudget, or fetchTodaySpend.' });
  } catch (error) {
    console.error('Meta Manage API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
