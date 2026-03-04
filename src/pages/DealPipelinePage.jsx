import { useState, useMemo } from 'react';
import { Card } from '../components';
import { fmt, fmtD, fmtN, pn } from '../utils/formatters';

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

const FUNNEL_STAGES = [
  { key: 'leads', label: 'Leads', color: 'bg-blue-500' },
  { key: 'appts', label: 'Appts', color: 'bg-cyan-500' },
  { key: 'deals', label: 'Deals', color: 'bg-purple-500' },
  { key: 'listings', label: 'Listings', color: 'bg-amber-500' },
  { key: 'buyerSigned', label: 'Buyer Signed', color: 'bg-orange-500' },
  { key: 'closings', label: 'Closings', color: 'bg-emerald-500' },
];

const FunnelDots = ({ row }) => (
  <div className="flex items-center gap-1">
    {FUNNEL_STAGES.map(stage => {
      const val = row[stage.key] || 0;
      return (
        <span
          key={stage.key}
          title={`${stage.label}: ${val}`}
          className={`w-2.5 h-2.5 rounded-full ${val > 0 ? stage.color : 'bg-dark-600'}`}
        />
      );
    })}
  </div>
);

const SortHeader = ({ label, sortKey, sortConfig, onSort, align = 'right' }) => {
  const active = sortConfig.key === sortKey;
  return (
    <th
      className={`px-4 py-3 text-xs font-semibold text-slate-400 uppercase cursor-pointer hover:text-white select-none ${align === 'left' ? 'text-left' : 'text-right'}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && <span className="text-brand-cyan">{sortConfig.dir === 'asc' ? '▲' : '▼'}</span>}
      </span>
    </th>
  );
};

export const DealPipelinePage = ({ clients, setupData, onSelectClient }) => {
  const [searchFilter, setSearchFilter] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTeamMember, setFilterTeamMember] = useState('');
  const [filterCampaign, setFilterCampaign] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'closings', dir: 'desc' });

  const getSetupInfo = (client) => {
    const name = client.client.toLowerCase().trim();
    return setupData.find(s => {
      const sn = (s.client || '').toLowerCase().trim();
      return sn === name || sn.includes(name) || name.includes(sn);
    });
  };

  // Enrich clients with pipeline data
  const enriched = useMemo(() => clients.map(c => {
    const setup = getSetupInfo(c);
    const effectiveLeads = c.adDataSource === 'meta' ? (c.weeklyLeads || 0) : c.leads;
    const effectiveSpend = c.adDataSource === 'meta' ? (c.weeklySpend || 0) : c.spend;
    const closings = setup ? pn(setup.closings) : 0;
    const leadsPerDeal = c.deals > 0 ? effectiveLeads / c.deals : 0;
    const spendPerDeal = c.deals > 0 ? effectiveSpend / c.deals : 0;
    const cpl = effectiveLeads > 0 ? effectiveSpend / effectiveLeads : 0;

    return {
      ...c,
      setup,
      effectiveLeads,
      effectiveSpend,
      closings,
      leadsPerDeal,
      spendPerDeal,
      effectiveCPL: cpl,
    };
  }), [clients, setupData]);

  // Unique filter values
  const uniqueValues = (key) => [...new Set(enriched.map(c => c[key]).filter(Boolean))].sort();
  const statuses = useMemo(() => uniqueValues('status'), [enriched]);
  const teamMembers = useMemo(() => uniqueValues('teamMember'), [enriched]);
  const campaigns = useMemo(() => uniqueValues('campaign'), [enriched]);

  const activeFilterCount = [filterStatus, filterTeamMember, filterCampaign].filter(Boolean).length;

  // Apply filters
  const filtered = enriched.filter(c => {
    const matchesSearch = !searchFilter ||
      c.client.toLowerCase().includes(searchFilter.toLowerCase()) ||
      (c.teamMember || '').toLowerCase().includes(searchFilter.toLowerCase());
    const matchesStatus = !filterStatus || c.status === filterStatus;
    const matchesTeamMember = !filterTeamMember || c.teamMember === filterTeamMember;
    const matchesCampaign = !filterCampaign || c.campaign === filterCampaign;
    return matchesSearch && matchesStatus && matchesTeamMember && matchesCampaign;
  });

  // Only show clients with any pipeline activity
  const pipelineClients = filtered.filter(c =>
    c.effectiveLeads > 0 || c.appts > 0 || c.deals > 0 || c.listings > 0 || c.buyerSigned > 0 || c.closings > 0
  );

  // Sorting
  const handleSort = (key) => {
    setSortConfig(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { key, dir: 'desc' }
    );
  };

  const sorted = useMemo(() => {
    const arr = [...pipelineClients];
    arr.sort((a, b) => {
      const valA = a[sortConfig.key] ?? 0;
      const valB = b[sortConfig.key] ?? 0;
      const cmp = typeof valA === 'string' ? valA.localeCompare(valB) : valA - valB;
      if (cmp !== 0) return sortConfig.dir === 'asc' ? cmp : -cmp;
      // Secondary sort: deals desc
      if (sortConfig.key !== 'deals') return b.deals - a.deals;
      return 0;
    });
    return arr;
  }, [pipelineClients, sortConfig]);

  // Summary stats from filtered pipeline clients
  const totals = pipelineClients.reduce((acc, c) => ({
    leads: acc.leads + c.effectiveLeads,
    appts: acc.appts + c.appts,
    deals: acc.deals + c.deals,
    closings: acc.closings + c.closings,
  }), { leads: 0, appts: 0, deals: 0, closings: 0 });

  const clearAllFilters = () => {
    setSearchFilter(''); setFilterStatus(''); setFilterTeamMember(''); setFilterCampaign('');
  };

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="text-center">
          <div className="text-3xl font-bold text-white">{pipelineClients.length}</div>
          <div className="text-xs text-slate-400">Active Pipeline Clients</div>
        </Card>
        <Card className="text-center">
          <div className="text-3xl font-bold text-blue-400">{fmtN(totals.leads)}</div>
          <div className="text-xs text-slate-400">Total Leads</div>
        </Card>
        <Card className="text-center">
          <div className="text-3xl font-bold text-cyan-400">{fmtN(totals.appts)}</div>
          <div className="text-xs text-slate-400">Total Appts</div>
        </Card>
        <Card className="text-center">
          <div className="text-3xl font-bold text-purple-400">{fmtN(totals.deals)}</div>
          <div className="text-xs text-slate-400">Total Potential Deals</div>
        </Card>
        <Card className="text-center">
          <div className="text-3xl font-bold text-emerald-400">{fmtN(totals.closings)}</div>
          <div className="text-xs text-slate-400">Total Closings</div>
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
                Showing {pipelineClients.length} of {enriched.filter(c =>
                  c.effectiveLeads > 0 || c.appts > 0 || c.deals > 0 || c.listings > 0 || c.buyerSigned > 0 || c.closings > 0
                ).length}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <FilterSelect label="Status" value={filterStatus} onChange={setFilterStatus} options={statuses} />
            <FilterSelect label="Team Member" value={filterTeamMember} onChange={setFilterTeamMember} options={teamMembers} />
            <FilterSelect label="Campaign" value={filterCampaign} onChange={setFilterCampaign} options={campaigns} />
          </div>
        </div>
      </Card>

      {/* Funnel Legend */}
      <div className="flex items-center gap-4 px-1">
        <span className="text-xs text-slate-500 font-medium">Funnel stages:</span>
        {FUNNEL_STAGES.map(stage => (
          <div key={stage.key} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
            <span className="text-xs text-slate-400">{stage.label}</span>
          </div>
        ))}
      </div>

      {/* Pipeline Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-dark-800">
              <tr>
                <SortHeader label="Client" sortKey="client" sortConfig={sortConfig} onSort={handleSort} align="left" />
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Funnel</th>
                <SortHeader label="Status" sortKey="status" sortConfig={sortConfig} onSort={handleSort} align="left" />
                <SortHeader label="Leads" sortKey="effectiveLeads" sortConfig={sortConfig} onSort={handleSort} />
                <SortHeader label="Appts" sortKey="appts" sortConfig={sortConfig} onSort={handleSort} />
                <SortHeader label="Deals" sortKey="deals" sortConfig={sortConfig} onSort={handleSort} />
                <SortHeader label="Listings" sortKey="listings" sortConfig={sortConfig} onSort={handleSort} />
                <SortHeader label="Buyer Signed" sortKey="buyerSigned" sortConfig={sortConfig} onSort={handleSort} />
                <SortHeader label="Closings" sortKey="closings" sortConfig={sortConfig} onSort={handleSort} />
                <SortHeader label="Leads/Deal" sortKey="leadsPerDeal" sortConfig={sortConfig} onSort={handleSort} />
                <SortHeader label="Spend/Deal" sortKey="spendPerDeal" sortConfig={sortConfig} onSort={handleSort} />
                <SortHeader label="CPL" sortKey="effectiveCPL" sortConfig={sortConfig} onSort={handleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-slate-500 text-sm">
                    No clients with pipeline activity
                  </td>
                </tr>
              ) : (
                sorted.map(c => (
                  <tr
                    key={c.client}
                    className="hover:bg-dark-800 cursor-pointer transition-colors"
                    onClick={() => onSelectClient(c)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{c.client}</div>
                      <div className="text-xs text-slate-500">
                        {c.teamMember || '—'}
                        {c.adDataSource === 'meta' && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[10px] font-medium">META</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <FunnelDots row={c} />
                    </td>
                    <td className="px-4 py-3">
                      {c.status && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          c.status.toLowerCase() === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                          c.status.toLowerCase() === 'paused' ? 'bg-red-500/20 text-red-400' :
                          'bg-slate-500/20 text-slate-400'
                        }`}>{c.status}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-blue-400 font-medium">{fmtN(c.effectiveLeads)}</td>
                    <td className="px-4 py-3 text-right text-cyan-400">{fmtN(c.appts)}</td>
                    <td className="px-4 py-3 text-right text-purple-400 font-bold">{fmtN(c.deals)}</td>
                    <td className="px-4 py-3 text-right text-amber-400">{fmtN(c.listings)}</td>
                    <td className="px-4 py-3 text-right text-orange-400">{fmtN(c.buyerSigned)}</td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-bold">{fmtN(c.closings)}</td>
                    <td className="px-4 py-3 text-right text-slate-300">
                      {c.deals > 0 ? fmtN(c.leadsPerDeal) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300">
                      {c.deals > 0 ? fmt(c.spendPerDeal) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-medium ${
                        c.effectiveCPL <= 25 ? 'text-emerald-400' : c.effectiveCPL <= 50 ? 'text-amber-400' : c.effectiveCPL > 0 ? 'text-red-400' : 'text-slate-500'
                      }`}>
                        {c.effectiveCPL > 0 ? fmtD(c.effectiveCPL) : '—'}
                      </span>
                    </td>
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

export default DealPipelinePage;
