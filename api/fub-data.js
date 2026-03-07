// api/fub-data.js - Follow Up Boss data proxy for George's ROI Dashboard
const FUB_API_KEY = process.env.FUB_API_KEY;

async function fubFetch(endpoint) {
  const auth = Buffer.from(`${FUB_API_KEY}:`).toString('base64');
  const resp = await fetch(`https://api.followupboss.com/v1${endpoint}`, {
    headers: { 'Authorization': `Basic ${auth}` }
  });
  if (!resp.ok) throw new Error(`FUB API error: ${resp.status}`);
  return resp.json();
}

async function fetchAllPeople() {
  const auth = Buffer.from(`${FUB_API_KEY}:`).toString('base64');
  let people = [];
  let url = 'https://api.followupboss.com/v1/people?limit=100&fields=id,name,source,stage,price,created,tags';

  while (url) {
    const resp = await fetch(url, {
      headers: { 'Authorization': `Basic ${auth}` }
    });
    const data = await resp.json();
    people = people.concat(data.people || []);
    url = data._metadata?.nextLink || null;
  }
  return people;
}

async function fetchAllDeals() {
  const data = await fubFetch('/deals?limit=100');
  return data.deals || [];
}

async function fetchPipelines() {
  const data = await fubFetch('/pipelines');
  return data.pipelines || [];
}

async function fetchPersonSource(personId) {
  const auth = Buffer.from(`${FUB_API_KEY}:`).toString('base64');
  const resp = await fetch(
    `https://api.followupboss.com/v1/people/${personId}?fields=id,name,source,stage,created`,
    { headers: { 'Authorization': `Basic ${auth}` } }
  );
  if (!resp.ok) return null;
  return resp.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!FUB_API_KEY) {
    return res.status(500).json({ error: 'FUB_API_KEY not configured' });
  }

  try {
    // Fetch all data in parallel
    const [people, deals, pipelines] = await Promise.all([
      fetchAllPeople(),
      fetchAllDeals(),
      fetchPipelines()
    ]);

    // Build person lookup
    const personMap = {};
    for (const p of people) {
      personMap[p.id] = p;
    }

    // For deal people not in our people list, fetch individually
    const missingIds = [];
    for (const deal of deals) {
      for (const dp of (deal.people || [])) {
        if (!personMap[dp.id]) missingIds.push(dp.id);
      }
    }
    const uniqueMissing = [...new Set(missingIds)];
    const missingResults = await Promise.all(uniqueMissing.map(id => fetchPersonSource(id)));
    for (const p of missingResults) {
      if (p) personMap[p.id] = p;
    }

    // Enrich deals with source info
    const enrichedDeals = deals.map(deal => {
      const dealPeople = (deal.people || []).map(dp => {
        const full = personMap[dp.id];
        return {
          id: dp.id,
          name: dp.name,
          source: full?.source || '<unspecified>',
          stage: full?.stage || 'Unknown',
          created: full?.created || null
        };
      });
      // Primary source = first person's source
      const primarySource = dealPeople[0]?.source || '<unspecified>';
      return { ...deal, dealPeople, primarySource };
    });

    // Source stats from people
    const sourceStats = {};
    for (const p of people) {
      const src = p.source || '<unspecified>';
      if (!sourceStats[src]) {
        sourceStats[src] = { total: 0, stages: {}, monthlyLeads: {} };
      }
      sourceStats[src].total++;
      const stage = p.stage || 'Unknown';
      sourceStats[src].stages[stage] = (sourceStats[src].stages[stage] || 0) + 1;

      // Monthly tracking
      if (p.created) {
        const month = p.created.substring(0, 7);
        sourceStats[src].monthlyLeads[month] = (sourceStats[src].monthlyLeads[month] || 0) + 1;
      }
    }

    // Deal stats by source
    const dealsBySource = {};
    for (const deal of enrichedDeals) {
      const src = deal.primarySource;
      if (!dealsBySource[src]) {
        dealsBySource[src] = {
          totalDeals: 0, closedDeals: 0, activeDeals: 0,
          totalVolume: 0, closedVolume: 0, totalCommission: 0,
          closedCommission: 0, deals: []
        };
      }
      dealsBySource[src].totalDeals++;
      dealsBySource[src].totalVolume += deal.price || 0;
      dealsBySource[src].totalCommission += deal.commissionValue || 0;

      const isClosed = deal.stageName === 'Closed';
      if (isClosed) {
        dealsBySource[src].closedDeals++;
        dealsBySource[src].closedVolume += deal.price || 0;
        dealsBySource[src].closedCommission += deal.commissionValue || 0;
      } else {
        dealsBySource[src].activeDeals++;
      }
      dealsBySource[src].deals.push({
        id: deal.id,
        name: deal.name,
        price: deal.price,
        commission: deal.commissionValue,
        stage: deal.stageName,
        pipeline: deal.pipelineName,
        created: deal.createdAt,
        timeToClose: deal.timeToClose,
        people: deal.dealPeople.map(p => p.name)
      });
    }

    return res.status(200).json({
      summary: {
        totalPeople: people.length,
        totalDeals: deals.length,
        closedDeals: deals.filter(d => d.stageName === 'Closed').length,
        totalCommission: deals.reduce((s, d) => s + (d.commissionValue || 0), 0),
        closedCommission: deals.filter(d => d.stageName === 'Closed').reduce((s, d) => s + (d.commissionValue || 0), 0),
        totalVolume: deals.reduce((s, d) => s + (d.price || 0), 0),
      },
      sourceStats,
      dealsBySource,
      pipelines,
      deals: enrichedDeals,
    });
  } catch (err) {
    console.error('FUB API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
