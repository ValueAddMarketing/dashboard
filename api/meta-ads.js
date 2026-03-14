// api/meta-ads.js — Unified Meta ads + sheets proxy + campaign management
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Valid Meta date presets
const VALID_DATE_PRESETS = [
  'today', 'yesterday', 'last_3d', 'last_7d', 'last_14d',
  'last_28d', 'last_30d', 'last_90d', 'this_month', 'last_month',
  'this_quarter', 'maximum'
];

// ========== SHEETS PROXY CONFIG ==========
const SHEET_URLS = {
  clientAdsPerformance: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR4LTw-15NE0j25eIOpY_bTPSAipW7-F2eXnL0xtdXMWCZtK9z3MYWxHr6ltnMChLk-YDLzwiXAfvwE/pub?gid=964722332&single=true&output=csv',
  setupTiming: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR4LTw-15NE0j25eIOpY_bTPSAipW7-F2eXnL0xtdXMWCZtK9z3MYWxHr6ltnMChLk-YDLzwiXAfvwE/pub?gid=646836237&single=true&output=csv',
  closerForm: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR4LTw-15NE0j25eIOpY_bTPSAipW7-F2eXnL0xtdXMWCZtK9z3MYWxHr6ltnMChLk-YDLzwiXAfvwE/pub?gid=986050898&single=true&output=csv',
  fanbasis: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR4LTw-15NE0j25eIOpY_bTPSAipW7-F2eXnL0xtdXMWCZtK9z3MYWxHr6ltnMChLk-YDLzwiXAfvwE/pub?gid=102644999&single=true&output=csv',
  cashflow: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR4LTw-15NE0j25eIOpY_bTPSAipW7-F2eXnL0xtdXMWCZtK9z3MYWxHr6ltnMChLk-YDLzwiXAfvwE/pub?gid=787866349&single=true&output=csv',
};

const REQUIRED_COLUMNS = {
  clientAdsPerformance: ['Client', 'Ad Account Name', 'Status', 'State', 'Total Ad Spend', 'Lifetime Seller Leads', 'Lifetime Buyer Leads', 'Daily Set Ad Spend'],
  setupTiming: ['VAM', 'CSM', 'Status', 'Paid date', 'Ad Live date', 'Billing cycle', 'MRR'],
};

const HEADER_ROW_HINTS = { clientAdsPerformance: 1, setupTiming: 0 };
const SKIP_AFTER_HEADER = { clientAdsPerformance: 0, setupTiming: 1 };

const CACHE_TTL_MS = 2 * 60 * 1000;
const sheetCache = new Map();

function parseCSV(text) {
  const rows = [];
  let i = 0;
  const len = text.length;
  while (i < len) {
    const row = [];
    while (i < len) {
      let value = '';
      while (i < len && text[i] === ' ') i++;
      if (i < len && text[i] === '"') {
        i++;
        while (i < len) {
          if (text[i] === '"') {
            if (i + 1 < len && text[i + 1] === '"') { value += '"'; i += 2; }
            else { i++; break; }
          } else { value += text[i]; i++; }
        }
        while (i < len && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') i++;
      } else {
        while (i < len && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') { value += text[i]; i++; }
      }
      row.push(value);
      if (i < len && text[i] === ',') { i++; } else { break; }
    }
    if (i < len && text[i] === '\r') i++;
    if (i < len && text[i] === '\n') i++;
    if (row.length > 1 || (row.length === 1 && row[0].trim() !== '')) rows.push(row);
  }
  return rows;
}

function normalizeHeader(h) { return (h || '').toLowerCase().trim().replace(/\s+/g, ' '); }

function detectHeaderRow(rows, sheetName) {
  const required = REQUIRED_COLUMNS[sheetName];
  if (!required || rows.length === 0) return HEADER_ROW_HINTS[sheetName] || 0;
  const normalizedRequired = required.map(normalizeHeader);
  let bestRow = HEADER_ROW_HINTS[sheetName] || 0;
  let bestScore = 0;
  for (let r = 0; r < Math.min(5, rows.length); r++) {
    const normalizedCells = rows[r].map(normalizeHeader);
    let score = 0;
    for (const req of normalizedRequired) { if (normalizedCells.includes(req)) score++; }
    if (score > bestScore) { bestScore = score; bestRow = r; }
  }
  return bestRow;
}

function validateHeaders(headers, sheetName) {
  const required = REQUIRED_COLUMNS[sheetName];
  if (!required) return { warnings: [], errors: [], headerMap: {} };
  const warnings = [], errors = [], headerMap = {};
  const normalizedHeaders = headers.map(normalizeHeader);
  for (const req of required) {
    if (headers.indexOf(req) !== -1) { headerMap[req] = req; continue; }
    const fuzzyIdx = normalizedHeaders.indexOf(normalizeHeader(req));
    if (fuzzyIdx !== -1) {
      headerMap[req] = headers[fuzzyIdx];
      warnings.push(`Column "${req}" matched via fuzzy match to "${headers[fuzzyIdx]}"`);
    } else {
      errors.push(`Required column "${req}" not found in headers`);
    }
  }
  return { warnings, errors, headerMap };
}

async function fetchSheet(sheetName) {
  const url = SHEET_URLS[sheetName];
  if (!url) throw new Error(`Unknown sheet: ${sheetName}`);
  const cached = sheetCache.get(sheetName);
  const now = Date.now();
  if (cached && (now - cached.cachedAt) < CACHE_TTL_MS) return { ...cached.result, fromCache: true };

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${sheetName}: ${response.status}`);
  const text = await response.text();
  const allRows = parseCSV(text);
  if (allRows.length === 0) return { data: [], headers: [], rowCount: 0, cachedAt: now, fromCache: false, warnings: [], errors: ['Sheet returned no data'], headerRow: 0 };

  const headerRow = detectHeaderRow(allRows, sheetName);
  const headers = allRows[headerRow].map(h => h.trim());
  const { warnings, errors } = validateHeaders(headers, sheetName);
  const dataStartRow = headerRow + 1 + (SKIP_AFTER_HEADER[sheetName] || 0);

  const data = [];
  for (let r = dataStartRow; r < allRows.length; r++) {
    const row = allRows[r];
    if (!row.some(cell => cell.trim() !== '')) continue;
    const obj = {};
    for (let c = 0; c < headers.length; c++) { if (headers[c]) obj[headers[c]] = (row[c] || '').trim(); }
    data.push(obj);
  }

  const result = { data, headers, rowCount: data.length, cachedAt: now, fromCache: false, warnings, errors, headerRow };
  sheetCache.set(sheetName, { cachedAt: now, result });
  return result;
}

// ========== HELPERS ==========
async function getSupabaseMappings() {
  const mappingsRes = await fetch(`${SUPABASE_URL}/rest/v1/client_ad_accounts?select=*`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  return mappingsRes.json();
}

// ========== HANDLER ==========
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, datePreset } = req.body;

  try {
    // ========== SHEETS PROXY ACTIONS ==========
    if (action === 'sheetsAll') {
      const [clientAdsPerformance, setupTiming] = await Promise.all([fetchSheet('clientAdsPerformance'), fetchSheet('setupTiming')]);
      return res.json({ clientAdsPerformance, setupTiming });
    }

    if (action === 'sheetsOne') {
      const { sheet } = req.body;
      if (!sheet || !SHEET_URLS[sheet]) return res.status(400).json({ error: `Invalid sheet. Valid: ${Object.keys(SHEET_URLS).join(', ')}` });
      return res.json(await fetchSheet(sheet));
    }

    // ========== META ADS ACTIONS (require token) ==========
    if (!META_ACCESS_TOKEN) {
      return res.status(500).json({ error: 'META_ACCESS_TOKEN not configured' });
    }
    const selectedPreset = VALID_DATE_PRESETS.includes(datePreset) ? datePreset : 'last_7d';

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
      if (data.error) return res.status(400).json({ error: data.error.message });
      return res.json({ accounts: data.data || [] });
    }

    if (action === 'fetchAll') {
      if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Supabase not configured' });
      const mappings = await getSupabaseMappings();
      if (!Array.isArray(mappings)) return res.json({ results: {}, debug: { mappingsError: mappings, mappingsCount: 0 } });

      const insightFields = ['spend', 'impressions', 'reach', 'clicks', 'ctr', 'cpc', 'cpm', 'frequency', 'actions', 'cost_per_action_type'].join(',');
      const results = {}, errors = {};
      for (const mapping of mappings) {
        const accountId = mapping.meta_ad_account_id;
        const url = `https://graph.facebook.com/v21.0/act_${accountId}/insights?fields=${insightFields}&date_preset=${selectedPreset}&access_token=${META_ACCESS_TOKEN}`;
        try {
          const insightRes = await fetch(url);
          const insightData = await insightRes.json();
          if (insightData.error) { errors[mapping.client_name] = insightData.error.message; continue; }
          if (insightData.data && insightData.data[0]) {
            const insight = insightData.data[0];
            const spend = parseFloat(insight.spend || 0);
            const impressions = parseInt(insight.impressions || 0);
            const reach = parseInt(insight.reach || 0);
            const clicks = parseInt(insight.clicks || 0);
            const actions = insight.actions || [];
            const costPerAction = insight.cost_per_action_type || [];
            const leads = parseInt(actions.find(a => a.action_type === 'lead')?.value || 0);
            const costPerLead = parseFloat(costPerAction.find(a => a.action_type === 'lead')?.value || 0);
            results[mapping.client_name] = {
              spend: spend.toFixed(2), impressions, reach, clicks,
              ctr: parseFloat(insight.ctr || 0).toFixed(2), cpc: parseFloat(insight.cpc || 0).toFixed(2),
              cpm: parseFloat(insight.cpm || 0).toFixed(2), frequency: parseFloat(insight.frequency || 0).toFixed(2),
              leads, linkClicks: parseInt(actions.find(a => a.action_type === 'link_click')?.value || 0),
              pageEngagement: parseInt(actions.find(a => a.action_type === 'page_engagement')?.value || 0),
              postEngagement: parseInt(actions.find(a => a.action_type === 'post_engagement')?.value || 0),
              cpl: leads > 0 ? (spend / leads).toFixed(2) : costPerLead > 0 ? costPerLead.toFixed(2) : null,
              datePreset: selectedPreset
            };
          } else { errors[mapping.client_name] = 'No insights data returned'; }
        } catch (err) { errors[mapping.client_name] = err.message; }
      }
      return res.json({ results, datePreset: selectedPreset, debug: { mappingsCount: mappings.length, mappings: mappings.map(m => ({ client: m.client_name, accountId: m.meta_ad_account_id })), errors: Object.keys(errors).length > 0 ? errors : undefined } });
    }

    if (action === 'fetchDailySpend') {
      if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Supabase not configured' });
      const { clientDates } = req.body;
      if (!clientDates || typeof clientDates !== 'object') return res.status(400).json({ error: 'clientDates map required' });
      const mappings = await getSupabaseMappings();
      if (!Array.isArray(mappings)) return res.json({ results: {}, errors: { _general: 'Failed to fetch mappings' } });

      const today = new Date().toISOString().split('T')[0];
      const results = {}, errors = {};
      const clientMappings = mappings.filter(m => clientDates[m.client_name]);
      for (let i = 0; i < clientMappings.length; i += 5) {
        const batch = clientMappings.slice(i, i + 5);
        const settled = await Promise.allSettled(batch.map(async (mapping) => {
          const timeRange = JSON.stringify({ since: clientDates[mapping.client_name], until: today });
          let url = `https://graph.facebook.com/v21.0/act_${mapping.meta_ad_account_id}/insights?fields=spend&time_range=${encodeURIComponent(timeRange)}&time_increment=1&limit=500&access_token=${META_ACCESS_TOKEN}`;
          const allDays = [];
          while (url) {
            const resp = await fetch(url);
            const data = await resp.json();
            if (data.error) throw new Error(data.error.message);
            if (data.data) for (const row of data.data) allDays.push({ date: row.date_start, spend: parseFloat(row.spend || 0) });
            url = data.paging?.next || null;
          }
          return { clientName: mapping.client_name, days: allDays };
        }));
        for (const result of settled) {
          if (result.status === 'fulfilled') results[result.value.clientName] = result.value.days;
          else { const idx = settled.indexOf(result); errors[batch[idx]?.client_name || 'unknown'] = result.reason?.message || 'Unknown error'; }
        }
      }
      return res.json({ results, errors: Object.keys(errors).length > 0 ? errors : undefined });
    }

    // ========== CAMPAIGN MANAGEMENT ACTIONS ==========
    if (action === 'fetchStructure') {
      const { adAccountId } = req.body;
      if (!adAccountId) return res.status(400).json({ error: 'adAccountId required' });
      const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
      const campaignsUrl = `https://graph.facebook.com/v21.0/${accountId}/campaigns?fields=id,name,status,daily_budget,lifetime_budget,budget_remaining,objective,buying_type&limit=100&access_token=${META_ACCESS_TOKEN}`;
      const campaignsRes = await fetch(campaignsUrl);
      const campaignsData = await campaignsRes.json();
      if (campaignsData.error) return res.status(400).json({ error: campaignsData.error.message });

      const results = [];
      for (const campaign of (campaignsData.data || [])) {
        const adSetsUrl = `https://graph.facebook.com/v21.0/${campaign.id}/adsets?fields=id,name,status,daily_budget,lifetime_budget,budget_remaining,optimization_goal&limit=100&access_token=${META_ACCESS_TOKEN}`;
        const adSetsRes = await fetch(adSetsUrl);
        const adSetsData = await adSetsRes.json();
        const adSets = [];
        for (const adSet of (adSetsData.data || [])) {
          const adsUrl = `https://graph.facebook.com/v21.0/${adSet.id}/ads?fields=id,name,status&limit=100&access_token=${META_ACCESS_TOKEN}`;
          const adsRes = await fetch(adsUrl);
          const adsData = await adsRes.json();
          adSets.push({ id: adSet.id, name: adSet.name, status: adSet.status, daily_budget: adSet.daily_budget ? (parseInt(adSet.daily_budget) / 100).toFixed(2) : null, lifetime_budget: adSet.lifetime_budget ? (parseInt(adSet.lifetime_budget) / 100).toFixed(2) : null, budget_remaining: adSet.budget_remaining ? (parseInt(adSet.budget_remaining) / 100).toFixed(2) : null, optimization_goal: adSet.optimization_goal, ads: (adsData.data || []).map(ad => ({ id: ad.id, name: ad.name, status: ad.status })) });
        }
        results.push({ id: campaign.id, name: campaign.name, status: campaign.status, daily_budget: campaign.daily_budget ? (parseInt(campaign.daily_budget) / 100).toFixed(2) : null, lifetime_budget: campaign.lifetime_budget ? (parseInt(campaign.lifetime_budget) / 100).toFixed(2) : null, budget_remaining: campaign.budget_remaining ? (parseInt(campaign.budget_remaining) / 100).toFixed(2) : null, objective: campaign.objective, adSets });
      }
      return res.json({ campaigns: results });
    }

    if (action === 'fetchAllStructures') {
      if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Supabase not configured' });
      const mappings = await getSupabaseMappings();
      if (!Array.isArray(mappings)) return res.json({ results: {} });
      const results = {}, errors = {};
      for (let i = 0; i < mappings.length; i += 3) {
        const batch = mappings.slice(i, i + 3);
        const settled = await Promise.allSettled(batch.map(async (mapping) => {
          const accountId = `act_${mapping.meta_ad_account_id}`;
          const campaignsRes = await fetch(`https://graph.facebook.com/v21.0/${accountId}/campaigns?fields=id,name,status,daily_budget,lifetime_budget,budget_remaining,objective&limit=50&access_token=${META_ACCESS_TOKEN}`);
          const campaignsData = await campaignsRes.json();
          if (campaignsData.error) throw new Error(campaignsData.error.message);
          const campaigns = [];
          for (const campaign of (campaignsData.data || [])) {
            const adSetsRes = await fetch(`https://graph.facebook.com/v21.0/${campaign.id}/adsets?fields=id,name,status,daily_budget,lifetime_budget,budget_remaining&limit=50&access_token=${META_ACCESS_TOKEN}`);
            const adSetsData = await adSetsRes.json();
            const adSets = [];
            for (const adSet of (adSetsData.data || [])) {
              const adsRes = await fetch(`https://graph.facebook.com/v21.0/${adSet.id}/ads?fields=id,name,status&limit=50&access_token=${META_ACCESS_TOKEN}`);
              const adsData = await adsRes.json();
              adSets.push({ id: adSet.id, name: adSet.name, status: adSet.status, daily_budget: adSet.daily_budget ? (parseInt(adSet.daily_budget) / 100).toFixed(2) : null, lifetime_budget: adSet.lifetime_budget ? (parseInt(adSet.lifetime_budget) / 100).toFixed(2) : null, ads: (adsData.data || []).map(ad => ({ id: ad.id, name: ad.name, status: ad.status })) });
            }
            campaigns.push({ id: campaign.id, name: campaign.name, status: campaign.status, daily_budget: campaign.daily_budget ? (parseInt(campaign.daily_budget) / 100).toFixed(2) : null, lifetime_budget: campaign.lifetime_budget ? (parseInt(campaign.lifetime_budget) / 100).toFixed(2) : null, objective: campaign.objective, adSets });
          }
          return { clientName: mapping.client_name, campaigns };
        }));
        for (const result of settled) {
          if (result.status === 'fulfilled') results[result.value.clientName] = result.value.campaigns;
          else { const idx = settled.indexOf(result); errors[batch[idx]?.client_name || 'unknown'] = result.reason?.message || 'Unknown error'; }
        }
      }
      return res.json({ results, errors: Object.keys(errors).length > 0 ? errors : undefined });
    }

    if (action === 'updateStatus') {
      const { objectId, newStatus } = req.body;
      if (!objectId || !newStatus) return res.status(400).json({ error: 'objectId and newStatus required' });
      if (!['ACTIVE', 'PAUSED'].includes(newStatus)) return res.status(400).json({ error: 'newStatus must be ACTIVE or PAUSED' });
      const response = await fetch(`https://graph.facebook.com/v21.0/${objectId}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `status=${newStatus}&access_token=${META_ACCESS_TOKEN}` });
      const data = await response.json();
      if (data.error) return res.status(400).json({ error: data.error.message });
      return res.json({ success: true, objectId, newStatus });
    }

    if (action === 'updateBudget') {
      const { objectId, budgetType, amount } = req.body;
      if (!objectId || !budgetType || amount === undefined) return res.status(400).json({ error: 'objectId, budgetType, and amount required' });
      if (!['daily_budget', 'lifetime_budget'].includes(budgetType)) return res.status(400).json({ error: 'budgetType must be daily_budget or lifetime_budget' });
      const budgetInCents = Math.round(parseFloat(amount) * 100);
      if (isNaN(budgetInCents) || budgetInCents < 100) return res.status(400).json({ error: 'Budget must be at least $1.00' });
      const response = await fetch(`https://graph.facebook.com/v21.0/${objectId}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `${budgetType}=${budgetInCents}&access_token=${META_ACCESS_TOKEN}` });
      const data = await response.json();
      if (data.error) return res.status(400).json({ error: data.error.message });
      return res.json({ success: true, objectId, budgetType, amount: (budgetInCents / 100).toFixed(2) });
    }

    if (action === 'fetchTodaySpend') {
      if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Supabase not configured' });
      const mappings = await getSupabaseMappings();
      if (!Array.isArray(mappings)) return res.json({ results: {} });
      const today = new Date().toISOString().split('T')[0];
      const results = {}, errors = {};
      for (let i = 0; i < mappings.length; i += 5) {
        const batch = mappings.slice(i, i + 5);
        const settled = await Promise.allSettled(batch.map(async (mapping) => {
          const timeRange = JSON.stringify({ since: today, until: today });
          const url = `https://graph.facebook.com/v21.0/act_${mapping.meta_ad_account_id}/insights?fields=spend&time_range=${encodeURIComponent(timeRange)}&access_token=${META_ACCESS_TOKEN}`;
          const resp = await fetch(url);
          const data = await resp.json();
          if (data.error) throw new Error(data.error.message);
          return { clientName: mapping.client_name, spend: data.data && data.data[0] ? parseFloat(data.data[0].spend || 0) : 0 };
        }));
        for (const result of settled) {
          if (result.status === 'fulfilled') results[result.value.clientName] = result.value.spend;
          else { const idx = settled.indexOf(result); errors[batch[idx]?.client_name || 'unknown'] = result.reason?.message || 'Unknown error'; }
        }
      }
      return res.json({ results, errors: Object.keys(errors).length > 0 ? errors : undefined });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (error) {
    console.error('Meta API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
