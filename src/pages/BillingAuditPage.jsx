import { useState, useMemo, useEffect } from 'react';
import { Card } from '../components';
import { fmtN, pn } from '../utils/formatters';
import { fetchDailySpendData } from '../services/metaAds';

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

const DiscrepancyBadge = ({ days }) => {
  const abs = Math.abs(days);
  if (abs >= 7) {
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">{days}d off</span>;
  }
  if (abs >= 3) {
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400">{days}d off</span>;
  }
  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400">OK</span>;
};

const parseDate = (dateStr) => {
  if (!dateStr) return null;
  const cleaned = dateStr.trim();
  // Try various date formats
  const d = new Date(cleaned);
  if (!isNaN(d.getTime())) return d;
  return null;
};

const formatDate = (date) => {
  if (!date) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const toYMD = (date) => {
  if (!date) return null;
  return date.toISOString().split('T')[0];
};

const daysBetween = (a, b) => {
  if (!a || !b) return 0;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
};

const addDays = (date, days) => {
  if (!date) return null;
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

export const BillingAuditPage = ({ clients, setupData }) => {
  const [searchFilter, setSearchFilter] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterTeamMember, setFilterTeamMember] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'discrepancy', dir: 'desc' });
  const [dailySpend, setDailySpend] = useState({});
  const [loading, setLoading] = useState(true);

  const getSetupInfo = (client) => {
    const name = client.client.toLowerCase().trim();
    return setupData.find(s => {
      const sn = (s.client || '').toLowerCase().trim();
      return sn === name || sn.includes(name) || name.includes(sn);
    });
  };

  // Build client dates map and fetch daily spend on mount
  useEffect(() => {
    const clientDates = {};
    for (const c of clients) {
      const setup = getSetupInfo(c);
      if (setup?.adLiveDate) {
        const d = parseDate(setup.adLiveDate);
        const ymd = toYMD(d);
        if (ymd) clientDates[c.client] = ymd;
      }
    }

    if (Object.keys(clientDates).length > 0) {
      fetchDailySpendData(clientDates)
        .then(data => setDailySpend(data))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [clients, setupData]);

  // Enrich clients with audit data
  const enriched = useMemo(() => clients.map(c => {
    const setup = getSetupInfo(c);
    const adLiveDate = parseDate(setup?.adLiveDate);
    const paidDate = parseDate(setup?.paidDate);
    const billingCycle = setup?.billingCycle || '';
    const recordedOnPause = pn(setup?.adsOnPauseDays);

    // Setup days: from sheet or computed
    let setupDaysVal = pn(setup?.setupDays);
    if (!setupDaysVal && adLiveDate && paidDate) {
      setupDaysVal = Math.max(0, daysBetween(paidDate, adLiveDate));
    }

    // Daily spend data from Meta
    const spendData = dailySpend[c.client] || [];
    const hasMetaData = spendData.length > 0;

    // First date with actual spend from Meta
    const firstSpendEntry = spendData.find(d => d.spend > 0);
    const firstSpendDate = firstSpendEntry ? parseDate(firstSpendEntry.date) : null;

    // Launch setup days: first spend date minus paid date
    const launchSetupDays = (firstSpendDate && paidDate) ? Math.max(0, daysBetween(paidDate, firstSpendDate)) : null;

    const activeDays = spendData.filter(d => d.spend > 0).length;
    const totalDaysSinceAdLive = adLiveDate ? daysBetween(adLiveDate, new Date()) : 0;
    const inactiveDays = hasMetaData ? Math.max(0, totalDaysSinceAdLive - activeDays) : 0;

    // Corrected billing start
    const correctedBillingStart = adLiveDate ? addDays(adLiveDate, setupDaysVal + inactiveDays) : null;

    // Discrepancy
    const discrepancy = hasMetaData ? inactiveDays - recordedOnPause : 0;

    // Severity
    const absDisc = Math.abs(discrepancy);
    const severity = absDisc >= 7 ? 'High' : absDisc >= 3 ? 'Medium' : 'OK';

    return {
      ...c,
      setup,
      paidDate,
      adLiveDate,
      firstSpendDate,
      launchSetupDays,
      setupDaysVal,
      activeDays,
      inactiveDays,
      recordedOnPause,
      correctedBillingStart,
      billingCycle,
      discrepancy,
      severity,
      hasMetaData,
      teamMember: c.teamMember || setup?.csmRep || '',
    };
  }), [clients, setupData, dailySpend]);

  // Filter values
  const teamMembers = useMemo(() =>
    [...new Set(enriched.map(c => c.teamMember).filter(Boolean))].sort(),
    [enriched]
  );

  const activeFilterCount = [filterSeverity, filterTeamMember].filter(Boolean).length;

  // Apply filters
  const filtered = enriched.filter(c => {
    if (!c.adLiveDate) return false; // Only show clients with ad live dates
    const matchesSearch = !searchFilter ||
      c.client.toLowerCase().includes(searchFilter.toLowerCase()) ||
      c.teamMember.toLowerCase().includes(searchFilter.toLowerCase());
    const matchesSeverity = !filterSeverity || c.severity === filterSeverity;
    const matchesTeamMember = !filterTeamMember || c.teamMember === filterTeamMember;
    return matchesSearch && matchesSeverity && matchesTeamMember;
  });

  // Sorting
  const handleSort = (key) => {
    setSortConfig(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { key, dir: 'desc' }
    );
  };

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let valA, valB;
      if (sortConfig.key === 'client') {
        valA = a.client; valB = b.client;
      } else if (sortConfig.key === 'paidDate') {
        valA = a.paidDate?.getTime() || 0; valB = b.paidDate?.getTime() || 0;
      } else if (sortConfig.key === 'adLiveDate') {
        valA = a.adLiveDate?.getTime() || 0; valB = b.adLiveDate?.getTime() || 0;
      } else if (sortConfig.key === 'firstSpendDate') {
        valA = a.firstSpendDate?.getTime() || 0; valB = b.firstSpendDate?.getTime() || 0;
      } else if (sortConfig.key === 'correctedBillingStart') {
        valA = a.correctedBillingStart?.getTime() || 0; valB = b.correctedBillingStart?.getTime() || 0;
      } else {
        valA = a[sortConfig.key] ?? 0; valB = b[sortConfig.key] ?? 0;
      }
      const cmp = typeof valA === 'string' ? valA.localeCompare(valB) : valA - valB;
      if (cmp !== 0) return sortConfig.dir === 'asc' ? cmp : -cmp;
      // Secondary sort: discrepancy desc
      return Math.abs(b.discrepancy) - Math.abs(a.discrepancy);
    });
    return arr;
  }, [filtered, sortConfig]);

  // Summary stats
  const clientsAudited = filtered.filter(c => c.hasMetaData).length;
  const clientsWithDiscrepancies = filtered.filter(c => c.hasMetaData && Math.abs(c.discrepancy) >= 3).length;
  const totalUnrecordedPauseDays = filtered.reduce((sum, c) => sum + (c.hasMetaData && c.discrepancy > 0 ? c.discrepancy : 0), 0);
  const avgActiveDays = clientsAudited > 0
    ? Math.round(filtered.filter(c => c.hasMetaData).reduce((sum, c) => sum + c.activeDays, 0) / clientsAudited)
    : 0;

  const clearAllFilters = () => {
    setSearchFilter(''); setFilterSeverity(''); setFilterTeamMember('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center space-y-4">
          <div className="text-4xl animate-spin inline-block">⏳</div>
          <div className="text-slate-400 text-sm">Fetching daily spend data from Meta Ads...</div>
          <div className="text-slate-500 text-xs">This may take a moment as we process all client accounts</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="text-center">
          <div className="text-3xl font-bold text-white">{clientsAudited}</div>
          <div className="text-xs text-slate-400">Clients Audited</div>
        </Card>
        <Card className="text-center">
          <div className={`text-3xl font-bold ${clientsWithDiscrepancies > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {clientsWithDiscrepancies}
          </div>
          <div className="text-xs text-slate-400">With Discrepancies</div>
        </Card>
        <Card className="text-center">
          <div className={`text-3xl font-bold ${totalUnrecordedPauseDays > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {fmtN(totalUnrecordedPauseDays)}
          </div>
          <div className="text-xs text-slate-400">Unrecorded Pause Days</div>
        </Card>
        <Card className="text-center">
          <div className="text-3xl font-bold text-blue-400">{fmtN(avgActiveDays)}</div>
          <div className="text-xs text-slate-400">Avg Active Days</div>
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
                Showing {filtered.length} of {enriched.filter(c => c.adLiveDate).length}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
            <FilterSelect
              label="Discrepancy Severity"
              value={filterSeverity}
              onChange={setFilterSeverity}
              options={['High', 'Medium', 'OK']}
            />
            <FilterSelect
              label="Team Member"
              value={filterTeamMember}
              onChange={setFilterTeamMember}
              options={teamMembers}
            />
          </div>
        </div>
      </Card>

      {/* Audit Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-dark-800">
              <tr>
                <SortHeader label="Client" sortKey="client" sortConfig={sortConfig} onSort={handleSort} align="left" />
                <SortHeader label="Paid Date" sortKey="paidDate" sortConfig={sortConfig} onSort={handleSort} align="left" />
                <SortHeader label="First Spend Date" sortKey="firstSpendDate" sortConfig={sortConfig} onSort={handleSort} align="left" />
                <SortHeader label="Setup Days" sortKey="launchSetupDays" sortConfig={sortConfig} onSort={handleSort} />
                <SortHeader label="Ad Live Date" sortKey="adLiveDate" sortConfig={sortConfig} onSort={handleSort} align="left" />
                <SortHeader label="Active Days" sortKey="activeDays" sortConfig={sortConfig} onSort={handleSort} />
                <SortHeader label="Inactive Days" sortKey="inactiveDays" sortConfig={sortConfig} onSort={handleSort} />
                <SortHeader label="Recorded Pause" sortKey="recordedOnPause" sortConfig={sortConfig} onSort={handleSort} />
                <SortHeader label="Discrepancy" sortKey="discrepancy" sortConfig={sortConfig} onSort={handleSort} />
                <SortHeader label="Corrected Billing Start" sortKey="correctedBillingStart" sortConfig={sortConfig} onSort={handleSort} align="left" />
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Sheet Billing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-slate-500 text-sm">
                    No clients match current filters
                  </td>
                </tr>
              ) : (
                sorted.map(c => (
                  <tr
                    key={c.client}
                    className={`transition-colors ${c.hasMetaData ? 'hover:bg-dark-800' : 'bg-dark-900/50 opacity-60'}`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{c.client}</div>
                      <div className="text-xs text-slate-500">{c.teamMember || '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {formatDate(c.paidDate)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {c.firstSpendDate ? (
                        <span className="text-emerald-400 font-medium">{formatDate(c.firstSpendDate)}</span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.launchSetupDays != null ? (
                        <span className={`font-medium ${c.launchSetupDays > 7 ? 'text-amber-400' : c.launchSetupDays > 3 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                          {c.launchSetupDays}
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {formatDate(c.adLiveDate)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.hasMetaData ? (
                        <span className="font-medium text-emerald-400">{fmtN(c.activeDays)}</span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.hasMetaData ? (
                        <span className={`font-medium ${c.inactiveDays > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                          {fmtN(c.inactiveDays)}
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-300">
                      {c.recordedOnPause || '0'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.hasMetaData ? (
                        <DiscrepancyBadge days={c.discrepancy} />
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-500/20 text-slate-500">No data</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {c.hasMetaData && c.correctedBillingStart ? (
                        <span className="text-cyan-400 font-medium">{formatDate(c.correctedBillingStart)}</span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">
                      {c.billingCycle || '—'}
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

export default BillingAuditPage;
