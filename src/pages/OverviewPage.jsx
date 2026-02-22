import { useState, useMemo } from 'react';
import { Card } from '../components';
import { fmt, fmtD, fmtN, getHealth, getHealthScore } from '../utils/formatters';
import { HEALTH_COLORS } from '../utils/constants';

const HealthDot = ({ color }) => (
  <span className={`w-2.5 h-2.5 rounded-full inline-block flex-shrink-0 ${HEALTH_COLORS[color] || HEALTH_COLORS.gray}`} />
);

const FilterSelect = ({ label, value, onChange, options }) => (
  <div>
    <label className="block text-xs text-slate-500 mb-1">{label}</label>
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white"
    >
      <option value="">All</option>
      {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  </div>
);

export const OverviewPage = ({ clients, setupData, onSelectClient }) => {
  const [expandedSection, setExpandedSection] = useState(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTeamMember, setFilterTeamMember] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterCampaign, setFilterCampaign] = useState('');
  const [filterCallingStatus, setFilterCallingStatus] = useState('');
  const [filterOverallStanding, setFilterOverallStanding] = useState('');

  const getSetupInfo = (client) => {
    const name = client.client.toLowerCase().trim();
    return setupData.find(s => {
      const sn = (s.client || '').toLowerCase().trim();
      return sn === name || sn.includes(name) || name.includes(sn);
    });
  };

  // Enrich clients with health data
  const enriched = clients.map(c => {
    const setup = getSetupInfo(c);
    const health = getHealth(c.cpl);
    const score = getHealthScore(c, setup);
    return { ...c, setup, health, score };
  });

  // Get unique values for filter dropdowns
  const uniqueValues = (key) => [...new Set(enriched.map(c => c[key]).filter(Boolean))].sort();
  const statuses = useMemo(() => uniqueValues('status'), [enriched]);
  const teamMembers = useMemo(() => uniqueValues('teamMember'), [enriched]);
  const states = useMemo(() => uniqueValues('state'), [enriched]);
  const campaigns = useMemo(() => uniqueValues('campaign'), [enriched]);
  const callingStatuses = useMemo(() => uniqueValues('callingStatus'), [enriched]);
  const overallStandings = useMemo(() => uniqueValues('overallStanding'), [enriched]);

  const activeFilterCount = [filterStatus, filterTeamMember, filterState, filterCampaign, filterCallingStatus, filterOverallStanding].filter(Boolean).length;

  // Apply filters
  const filtered = enriched.filter(c => {
    const matchesSearch = !searchFilter ||
      c.client.toLowerCase().includes(searchFilter.toLowerCase()) ||
      (c.state || '').toLowerCase().includes(searchFilter.toLowerCase()) ||
      (c.teamMember || '').toLowerCase().includes(searchFilter.toLowerCase());
    const matchesStatus = !filterStatus || c.status === filterStatus;
    const matchesTeamMember = !filterTeamMember || c.teamMember === filterTeamMember;
    const matchesState = !filterState || c.state === filterState;
    const matchesCampaign = !filterCampaign || c.campaign === filterCampaign;
    const matchesCalling = !filterCallingStatus || c.callingStatus === filterCallingStatus;
    const matchesStanding = !filterOverallStanding || c.overallStanding === filterOverallStanding;
    return matchesSearch && matchesStatus && matchesTeamMember && matchesState && matchesCampaign && matchesCalling && matchesStanding;
  });

  const clearAllFilters = () => {
    setSearchFilter(''); setFilterStatus(''); setFilterTeamMember(''); setFilterState('');
    setFilterCampaign(''); setFilterCallingStatus(''); setFilterOverallStanding('');
  };

  // Sort helpers
  const byScoreAsc = (a, b) => a.score - b.score;
  const byScoreDesc = (a, b) => b.score - a.score;

  // --- Categories (using filtered data) ---
  const struggling = filtered
    .filter(c => c.health === 'red' && c.days > 7)
    .sort(byScoreAsc);

  const doingWell = filtered
    .filter(c => c.health === 'green' && c.days > 7)
    .sort(byScoreDesc);

  const noLeads = filtered
    .filter(c => c.days >= 3 && c.last3DayLeads === 0)
    .sort((a, b) => a.last7DayLeads - b.last7DayLeads);

  const gettingMoreLeads = filtered
    .filter(c => c.last3DayLeads > 0 && c.days > 3)
    .sort((a, b) => b.last3DayLeads - a.last3DayLeads);

  // --- Best performing ad/campaign names ---
  const campaignMap = {};
  filtered.forEach(c => {
    const name = (c.campaign || '').trim();
    if (!name) return;
    if (!campaignMap[name]) {
      campaignMap[name] = { campaign: name, clients: [], totalLeads: 0, totalSpend: 0, totalAppts: 0, totalDeals: 0 };
    }
    campaignMap[name].clients.push(c.client);
    campaignMap[name].totalLeads += c.leads;
    campaignMap[name].totalSpend += c.spend;
    campaignMap[name].totalAppts += c.appts;
    campaignMap[name].totalDeals += c.deals;
  });
  const campaignsList = Object.values(campaignMap)
    .map(cp => ({ ...cp, cpl: cp.totalLeads > 0 ? cp.totalSpend / cp.totalLeads : 0 }))
    .filter(cp => cp.totalLeads > 0)
    .sort((a, b) => a.cpl - b.cpl);

  // --- Totals ---
  const totals = filtered.reduce((acc, c) => ({
    spend: acc.spend + c.spend,
    leads: acc.leads + c.leads,
    appts: acc.appts + c.appts,
    deals: acc.deals + c.deals,
  }), { spend: 0, leads: 0, appts: 0, deals: 0 });
  const avgCpl = totals.leads > 0 ? totals.spend / totals.leads : 0;

  const toggle = (section) => setExpandedSection(expandedSection === section ? null : section);

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="text-center">
          <div className="text-3xl font-bold text-white">{filtered.length}</div>
          <div className="text-xs text-slate-400">Total Clients</div>
        </Card>
        <Card className="text-center">
          <div className="text-3xl font-bold text-brand-cyan">{fmt(totals.spend)}</div>
          <div className="text-xs text-slate-400">Total Spend</div>
        </Card>
        <Card className="text-center">
          <div className="text-3xl font-bold text-brand-purple">{fmtN(totals.leads)}</div>
          <div className="text-xs text-slate-400">Total Leads</div>
        </Card>
        <Card className="text-center">
          <div className="text-3xl font-bold text-emerald-400">{fmtN(totals.appts)}</div>
          <div className="text-xs text-slate-400">Total Appts</div>
        </Card>
        <Card className="text-center">
          <div className="text-3xl font-bold text-amber-400">{fmtD(avgCpl)}</div>
          <div className="text-xs text-slate-400">Avg CPL</div>
        </Card>
      </div>

      {/* Search & Filters */}
      <Card>
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              placeholder="Search clients..."
              className="w-64 input-field border rounded-xl px-3 py-2 text-sm"
            />
            {activeFilterCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium hover:bg-red-500/20"
              >
                Clear Filters ({activeFilterCount})
              </button>
            )}
            {(activeFilterCount > 0 || searchFilter) && (
              <span className="text-xs text-slate-500">
                Showing {filtered.length} of {enriched.length}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <FilterSelect label="Status" value={filterStatus} onChange={setFilterStatus} options={statuses} />
            <FilterSelect label="Team Member" value={filterTeamMember} onChange={setFilterTeamMember} options={teamMembers} />
            <FilterSelect label="State" value={filterState} onChange={setFilterState} options={states} />
            <FilterSelect label="Campaign" value={filterCampaign} onChange={setFilterCampaign} options={campaigns} />
            <FilterSelect label="Calling Status" value={filterCallingStatus} onChange={setFilterCallingStatus} options={callingStatuses} />
            <FilterSelect label="Overall Standing" value={filterOverallStanding} onChange={setFilterOverallStanding} options={overallStandings} />
          </div>
        </div>
      </Card>

      {/* Health Distribution */}
      <Card>
        <div className="p-4 border-b border-dark-700">
          <h3 className="text-lg font-semibold text-white">Client Health Distribution</h3>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Healthy', color: 'emerald', count: filtered.filter(c => c.health === 'green').length },
              { label: 'Moderate', color: 'amber', count: filtered.filter(c => c.health === 'yellow').length },
              { label: 'At Risk', color: 'red', count: filtered.filter(c => c.health === 'red').length },
              { label: 'New/No Data', color: 'slate', count: filtered.filter(c => c.health === 'gray').length },
            ].map(item => (
              <div key={item.label} className="text-center">
                <div className={`text-2xl font-bold text-${item.color}-400`}>{item.count}</div>
                <div className="text-xs text-slate-400">{item.label}</div>
                <div className="mt-2 h-2 rounded-full bg-dark-700 overflow-hidden">
                  <div
                    className={`h-full bg-${item.color}-500 rounded-full`}
                    style={{ width: `${filtered.length > 0 ? (item.count / filtered.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Struggling Clients */}
      <Card>
        <div
          className="p-4 border-b border-dark-700 flex items-center justify-between cursor-pointer hover:bg-dark-800 transition-colors"
          onClick={() => toggle('struggling')}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚨</span>
            <div>
              <h3 className="text-lg font-semibold text-red-400">Struggling Clients</h3>
              <p className="text-xs text-slate-500">High CPL (&gt;$50), poor performance</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="bg-red-500/20 text-red-400 px-3 py-1 rounded-full text-sm font-bold">{struggling.length}</span>
            <span className="text-slate-500">{expandedSection === 'struggling' ? '▾' : '▸'}</span>
          </div>
        </div>
        {(expandedSection === 'struggling' || expandedSection === null) && (
          <div className="divide-y divide-dark-700">
            {struggling.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-sm">No struggling clients</div>
            ) : (
              struggling.slice(0, expandedSection === 'struggling' ? undefined : 5).map(c => (
                <div
                  key={c.client}
                  className="p-4 hover:bg-dark-800 cursor-pointer transition-colors flex items-center justify-between"
                  onClick={() => onSelectClient(c)}
                >
                  <div className="flex items-center gap-3">
                    <HealthDot color={c.health} />
                    <div>
                      <div className="font-medium text-white">{c.client}</div>
                      <div className="text-xs text-slate-500">
                        {c.state || '—'} · Day {c.days} · {c.campaign || 'No campaign'}
                        {c.teamMember && ` · ${c.teamMember}`}
                        {c.setup?.csmRep && ` · CSM: ${c.setup.csmRep}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-right">
                    {c.status && (
                      <div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          c.status.toLowerCase() === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                          c.status.toLowerCase() === 'paused' ? 'bg-red-500/20 text-red-400' :
                          'bg-slate-500/20 text-slate-400'
                        }`}>{c.status}</span>
                      </div>
                    )}
                    <div>
                      <div className="text-red-400 font-bold">{fmtD(c.cpl)}</div>
                      <div className="text-xs text-slate-500">CPL</div>
                    </div>
                    <div>
                      <div className="text-white font-medium">{fmtN(c.leads)}</div>
                      <div className="text-xs text-slate-500">Leads</div>
                    </div>
                    <div>
                      <div className="text-white font-medium">{fmtN(c.appts)}</div>
                      <div className="text-xs text-slate-500">Appts</div>
                    </div>
                  </div>
                </div>
              ))
            )}
            {expandedSection !== 'struggling' && struggling.length > 5 && (
              <div className="p-3 text-center">
                <button onClick={() => toggle('struggling')} className="text-brand-cyan text-sm hover:underline">
                  Show all {struggling.length} struggling clients
                </button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Doing Well */}
      <Card>
        <div
          className="p-4 border-b border-dark-700 flex items-center justify-between cursor-pointer hover:bg-dark-800 transition-colors"
          onClick={() => toggle('doingWell')}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🌟</span>
            <div>
              <h3 className="text-lg font-semibold text-emerald-400">Doing Well</h3>
              <p className="text-xs text-slate-500">Low CPL (&le;$25), healthy performance</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-sm font-bold">{doingWell.length}</span>
            <span className="text-slate-500">{expandedSection === 'doingWell' ? '▾' : '▸'}</span>
          </div>
        </div>
        {(expandedSection === 'doingWell' || expandedSection === null) && (
          <div className="divide-y divide-dark-700">
            {doingWell.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-sm">No clients in healthy range yet</div>
            ) : (
              doingWell.slice(0, expandedSection === 'doingWell' ? undefined : 5).map(c => (
                <div
                  key={c.client}
                  className="p-4 hover:bg-dark-800 cursor-pointer transition-colors flex items-center justify-between"
                  onClick={() => onSelectClient(c)}
                >
                  <div className="flex items-center gap-3">
                    <HealthDot color={c.health} />
                    <div>
                      <div className="font-medium text-white">{c.client}</div>
                      <div className="text-xs text-slate-500">
                        {c.state || '—'} · Day {c.days} · {c.campaign || 'No campaign'}
                        {c.teamMember && ` · ${c.teamMember}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-right">
                    {c.status && (
                      <div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          c.status.toLowerCase() === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                          c.status.toLowerCase() === 'paused' ? 'bg-red-500/20 text-red-400' :
                          'bg-slate-500/20 text-slate-400'
                        }`}>{c.status}</span>
                      </div>
                    )}
                    <div>
                      <div className="text-emerald-400 font-bold">{fmtD(c.cpl)}</div>
                      <div className="text-xs text-slate-500">CPL</div>
                    </div>
                    <div>
                      <div className="text-white font-medium">{fmtN(c.leads)}</div>
                      <div className="text-xs text-slate-500">Leads</div>
                    </div>
                    <div>
                      <div className="text-white font-medium">{fmtN(c.deals)}</div>
                      <div className="text-xs text-slate-500">Deals</div>
                    </div>
                  </div>
                </div>
              ))
            )}
            {expandedSection !== 'doingWell' && doingWell.length > 5 && (
              <div className="p-3 text-center">
                <button onClick={() => toggle('doingWell')} className="text-brand-cyan text-sm hover:underline">
                  Show all {doingWell.length} healthy clients
                </button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Not Getting Leads */}
      <Card>
        <div
          className="p-4 border-b border-dark-700 flex items-center justify-between cursor-pointer hover:bg-dark-800 transition-colors"
          onClick={() => toggle('noLeads')}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">📉</span>
            <div>
              <h3 className="text-lg font-semibold text-amber-400">Not Getting Leads</h3>
              <p className="text-xs text-slate-500">0 leads in the last 3 days</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="bg-amber-500/20 text-amber-400 px-3 py-1 rounded-full text-sm font-bold">{noLeads.length}</span>
            <span className="text-slate-500">{expandedSection === 'noLeads' ? '▾' : '▸'}</span>
          </div>
        </div>
        {(expandedSection === 'noLeads' || expandedSection === null) && (
          <div className="divide-y divide-dark-700">
            {noLeads.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-sm">All clients getting leads</div>
            ) : (
              noLeads.slice(0, expandedSection === 'noLeads' ? undefined : 5).map(c => (
                <div
                  key={c.client}
                  className="p-4 hover:bg-dark-800 cursor-pointer transition-colors flex items-center justify-between"
                  onClick={() => onSelectClient(c)}
                >
                  <div className="flex items-center gap-3">
                    <HealthDot color={c.health} />
                    <div>
                      <div className="font-medium text-white">{c.client}</div>
                      <div className="text-xs text-slate-500">
                        {c.state || '—'} · Day {c.days} · {c.campaign || 'No campaign'}
                        {c.teamMember && ` · ${c.teamMember}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-right">
                    <div>
                      <div className="text-amber-400 font-bold">0</div>
                      <div className="text-xs text-slate-500">3-Day Leads</div>
                    </div>
                    <div>
                      <div className="text-white font-medium">{fmtN(c.last7DayLeads)}</div>
                      <div className="text-xs text-slate-500">7-Day Leads</div>
                    </div>
                    <div>
                      <div className="text-white font-medium">{fmt(c.spend)}</div>
                      <div className="text-xs text-slate-500">Spend</div>
                    </div>
                  </div>
                </div>
              ))
            )}
            {expandedSection !== 'noLeads' && noLeads.length > 5 && (
              <div className="p-3 text-center">
                <button onClick={() => toggle('noLeads')} className="text-brand-cyan text-sm hover:underline">
                  Show all {noLeads.length} clients with no leads
                </button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Getting More Leads */}
      <Card>
        <div
          className="p-4 border-b border-dark-700 flex items-center justify-between cursor-pointer hover:bg-dark-800 transition-colors"
          onClick={() => toggle('gettingLeads')}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">📈</span>
            <div>
              <h3 className="text-lg font-semibold text-brand-cyan">Getting Leads</h3>
              <p className="text-xs text-slate-500">Active lead generation in last 3 days</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="bg-cyan-500/20 text-cyan-400 px-3 py-1 rounded-full text-sm font-bold">{gettingMoreLeads.length}</span>
            <span className="text-slate-500">{expandedSection === 'gettingLeads' ? '▾' : '▸'}</span>
          </div>
        </div>
        {(expandedSection === 'gettingLeads' || expandedSection === null) && (
          <div className="divide-y divide-dark-700">
            {gettingMoreLeads.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-sm">No clients with recent leads</div>
            ) : (
              gettingMoreLeads.slice(0, expandedSection === 'gettingLeads' ? undefined : 5).map(c => (
                <div
                  key={c.client}
                  className="p-4 hover:bg-dark-800 cursor-pointer transition-colors flex items-center justify-between"
                  onClick={() => onSelectClient(c)}
                >
                  <div className="flex items-center gap-3">
                    <HealthDot color={c.health} />
                    <div>
                      <div className="font-medium text-white">{c.client}</div>
                      <div className="text-xs text-slate-500">
                        {c.state || '—'} · Day {c.days} · {c.campaign || 'No campaign'}
                        {c.teamMember && ` · ${c.teamMember}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-right">
                    <div>
                      <div className="text-cyan-400 font-bold">{fmtN(c.last3DayLeads)}</div>
                      <div className="text-xs text-slate-500">3-Day Leads</div>
                    </div>
                    <div>
                      <div className="text-white font-medium">{fmtN(c.last7DayLeads)}</div>
                      <div className="text-xs text-slate-500">7-Day Leads</div>
                    </div>
                    <div>
                      <div className="text-white font-medium">{fmtD(c.cpl)}</div>
                      <div className="text-xs text-slate-500">CPL</div>
                    </div>
                  </div>
                </div>
              ))
            )}
            {expandedSection !== 'gettingLeads' && gettingMoreLeads.length > 5 && (
              <div className="p-3 text-center">
                <button onClick={() => toggle('gettingLeads')} className="text-brand-cyan text-sm hover:underline">
                  Show all {gettingMoreLeads.length} clients getting leads
                </button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Best Performing Ad/Campaign Names */}
      <Card>
        <div className="p-4 border-b border-dark-700">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏆</span>
            <div>
              <h3 className="text-lg font-semibold text-brand-purple">Best Performing Ad Names</h3>
              <p className="text-xs text-slate-500">Campaign types ranked by CPL (lowest = best)</p>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-dark-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Rank</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Campaign / Ad Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Clients</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase">Leads</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase">Spend</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase">CPL</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase">Appts</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase">Deals</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700">
              {campaignsList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500 text-sm">No campaign data available</td>
                </tr>
              ) : (
                campaignsList.map((cp, i) => (
                  <tr key={cp.campaign} className="hover:bg-dark-800 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                        i === 0 ? 'bg-amber-500/20 text-amber-400' :
                        i === 1 ? 'bg-slate-400/20 text-slate-300' :
                        i === 2 ? 'bg-orange-500/20 text-orange-400' :
                        'bg-dark-700 text-slate-500'
                      }`}>
                        {i + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{cp.campaign}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-300 text-sm">{cp.clients.length}</div>
                      <div className="text-xs text-slate-500 truncate max-w-[200px]" title={cp.clients.join(', ')}>
                        {cp.clients.slice(0, 3).join(', ')}{cp.clients.length > 3 ? ` +${cp.clients.length - 3}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-brand-purple font-medium">{fmtN(cp.totalLeads)}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{fmt(cp.totalSpend)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold ${
                        cp.cpl <= 25 ? 'text-emerald-400' : cp.cpl <= 50 ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {fmtD(cp.cpl)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300">{fmtN(cp.totalAppts)}</td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-medium">{fmtN(cp.totalDeals)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default OverviewPage;
