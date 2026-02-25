import { useState, useMemo } from 'react';
import { Card, Badge } from '../components';
import { pn, clean, fmt } from '../utils/formatters';

/**
 * Get renewal urgency based on days left
 * RED = within 1 month (30 days), YELLOW = within 3 months (90 days)
 */
const getUrgency = (daysLeft) => {
  if (daysLeft <= 30) return 'red';
  if (daysLeft <= 90) return 'yellow';
  return 'green';
};

const urgencyConfig = {
  red: {
    row: 'bg-red-500/10 border-l-4 border-red-500',
    badge: 'bg-red-500/20 text-red-400 border border-red-500/40',
    text: 'text-red-400',
    label: 'Urgent',
    dot: 'bg-red-500',
  },
  yellow: {
    row: 'bg-amber-500/10 border-l-4 border-amber-500',
    badge: 'bg-amber-500/20 text-amber-400 border border-amber-500/40',
    text: 'text-amber-400',
    label: 'Upcoming',
    dot: 'bg-amber-500',
  },
  green: {
    row: 'border-l-4 border-transparent',
    badge: 'bg-emerald-500/20 text-emerald-400',
    text: 'text-emerald-400',
    label: 'Safe',
    dot: 'bg-emerald-500',
  },
};

export const ClientTimelinePage = ({ clients, setupData }) => {
  const [searchFilter, setSearchFilter] = useState('');
  const [filterUrgency, setFilterUrgency] = useState('');
  const [filterCsm, setFilterCsm] = useState('');

  const getSetupInfo = (client) => {
    const name = client.client.toLowerCase().trim();
    return setupData.find(s => {
      const sn = (s.client || '').toLowerCase().trim();
      return sn === name || sn.includes(name) || name.includes(sn);
    });
  };

  // Build the renewal data from both sheets
  const renewalData = useMemo(() => {
    const data = [];

    // Process all clients from setup data (covers all clients)
    setupData.forEach(setup => {
      const daysLeftRaw = pn(setup.daysLeft);
      const remainingMonthsRaw = setup.contractLength || '';
      const clientName = setup.client || '';

      // Find matching ads client for additional info
      const adsClient = clients.find(c => {
        const cn = c.client.toLowerCase().trim();
        const sn = clientName.toLowerCase().trim();
        return cn === sn || cn.includes(sn) || sn.includes(cn);
      });

      // Use days left from setup sheet, or compute from remaining contract months
      let daysLeft = daysLeftRaw;
      if (!daysLeft && adsClient?.remainingContractMonths) {
        daysLeft = pn(adsClient.remainingContractMonths) * 30;
      }

      // Skip clients with no contract data
      if (!daysLeft && daysLeft !== 0) return;

      const urgency = getUrgency(daysLeft);

      data.push({
        client: clientName,
        daysLeft,
        remainingMonths: adsClient?.remainingContractMonths || '',
        contractLength: adsClient?.contractLengthMonths || setup.contractLength || '',
        contractCategory: setup.contractCategory || '',
        csmRep: setup.csmRep || '',
        mrr: setup.mrr || '',
        status: adsClient?.status || setup.status || '',
        duePayment: setup.duePayment || '',
        state: adsClient?.state || setup.state || '',
        campaign: adsClient?.campaign || setup.campaign || '',
        urgency,
        spend: adsClient?.spend || 0,
      });
    });

    // Sort by days left ascending (most urgent first)
    return data.sort((a, b) => a.daysLeft - b.daysLeft);
  }, [clients, setupData]);

  // Get unique CSMs for filter
  const csmOptions = useMemo(() =>
    [...new Set(renewalData.map(d => d.csmRep).filter(Boolean))].sort(),
    [renewalData]
  );

  // Apply filters
  const filtered = useMemo(() => {
    return renewalData.filter(d => {
      const matchesSearch = !searchFilter ||
        d.client.toLowerCase().includes(searchFilter.toLowerCase()) ||
        d.csmRep.toLowerCase().includes(searchFilter.toLowerCase()) ||
        d.state.toLowerCase().includes(searchFilter.toLowerCase());
      const matchesUrgency = !filterUrgency || d.urgency === filterUrgency;
      const matchesCsm = !filterCsm || d.csmRep === filterCsm;
      return matchesSearch && matchesUrgency && matchesCsm;
    });
  }, [renewalData, searchFilter, filterUrgency, filterCsm]);

  // Counts
  const urgentCount = renewalData.filter(d => d.urgency === 'red').length;
  const upcomingCount = renewalData.filter(d => d.urgency === 'yellow').length;
  const safeCount = renewalData.filter(d => d.urgency === 'green').length;

  const clearFilters = () => {
    setSearchFilter('');
    setFilterUrgency('');
    setFilterCsm('');
  };

  const activeFilterCount = [filterUrgency, filterCsm].filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="text-center">
          <div className="text-3xl font-bold text-white">{renewalData.length}</div>
          <div className="text-xs text-slate-400 mt-1">Total Contracts</div>
        </Card>
        <Card
          className={`text-center cursor-pointer ${filterUrgency === 'red' ? 'ring-2 ring-red-500' : ''}`}
          onClick={() => setFilterUrgency(filterUrgency === 'red' ? '' : 'red')}
        >
          <div className="text-3xl font-bold text-red-400">{urgentCount}</div>
          <div className="text-xs text-slate-400 mt-1">Renewing Within 1 Month</div>
          <div className="mt-2 h-1.5 rounded-full bg-dark-700 overflow-hidden">
            <div
              className="h-full bg-red-500 rounded-full"
              style={{ width: `${renewalData.length > 0 ? (urgentCount / renewalData.length) * 100 : 0}%` }}
            />
          </div>
        </Card>
        <Card
          className={`text-center cursor-pointer ${filterUrgency === 'yellow' ? 'ring-2 ring-amber-500' : ''}`}
          onClick={() => setFilterUrgency(filterUrgency === 'yellow' ? '' : 'yellow')}
        >
          <div className="text-3xl font-bold text-amber-400">{upcomingCount}</div>
          <div className="text-xs text-slate-400 mt-1">Renewing Within 3 Months</div>
          <div className="mt-2 h-1.5 rounded-full bg-dark-700 overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full"
              style={{ width: `${renewalData.length > 0 ? (upcomingCount / renewalData.length) * 100 : 0}%` }}
            />
          </div>
        </Card>
        <Card
          className={`text-center cursor-pointer ${filterUrgency === 'green' ? 'ring-2 ring-emerald-500' : ''}`}
          onClick={() => setFilterUrgency(filterUrgency === 'green' ? '' : 'green')}
        >
          <div className="text-3xl font-bold text-emerald-400">{safeCount}</div>
          <div className="text-xs text-slate-400 mt-1">Safe (3+ Months)</div>
          <div className="mt-2 h-1.5 rounded-full bg-dark-700 overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full"
              style={{ width: `${renewalData.length > 0 ? (safeCount / renewalData.length) * 100 : 0}%` }}
            />
          </div>
        </Card>
      </div>

      {/* Visual Timeline Bar */}
      <Card>
        <div className="p-4 border-b border-dark-700">
          <h3 className="text-lg font-semibold text-white">Renewal Timeline</h3>
          <p className="text-xs text-slate-500 mt-1">Visual overview of contract renewals sorted by urgency</p>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-6 mb-4 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500"></span>
              Within 1 month
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-500"></span>
              Within 3 months
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
              3+ months away
            </div>
          </div>
          <div className="space-y-2 max-h-[300px] overflow-y-auto scrollbar">
            {renewalData.map(d => {
              const cfg = urgencyConfig[d.urgency];
              // Scale bar width: max 365 days = 100%
              const barWidth = Math.min(100, Math.max(2, (d.daysLeft / 365) * 100));
              return (
                <div key={d.client} className="flex items-center gap-3">
                  <div className="w-40 truncate text-sm text-slate-300 flex-shrink-0" title={d.client}>
                    {d.client}
                  </div>
                  <div className="flex-1 h-6 bg-dark-700 rounded-full overflow-hidden relative">
                    <div
                      className={`h-full rounded-full ${cfg.dot} transition-all`}
                      style={{ width: `${barWidth}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white/80">
                      {d.daysLeft} days
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Search and Filters */}
      <Card>
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              placeholder="Search by client, CSM, or state..."
              className="w-72 input-field border rounded-xl px-3 py-2 text-sm"
            />
            {(activeFilterCount > 0 || searchFilter) && (
              <button
                onClick={clearFilters}
                className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium hover:bg-red-500/20"
              >
                Clear Filters
              </button>
            )}
            {(activeFilterCount > 0 || searchFilter) && (
              <span className="text-xs text-slate-500">
                Showing {filtered.length} of {renewalData.length}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Urgency</label>
              <select
                value={filterUrgency}
                onChange={e => setFilterUrgency(e.target.value)}
                className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="">All</option>
                <option value="red">Urgent (within 1 month)</option>
                <option value="yellow">Upcoming (within 3 months)</option>
                <option value="green">Safe (3+ months)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">CSM Rep</label>
              <select
                value={filterCsm}
                onChange={e => setFilterCsm(e.target.value)}
                className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="">All</option>
                {csmOptions.map(csm => <option key={csm} value={csm}>{csm}</option>)}
              </select>
            </div>
          </div>
        </div>
      </Card>

      {/* Detailed Table */}
      <Card>
        <div className="p-4 border-b border-dark-700">
          <h3 className="text-lg font-semibold text-white">All Client Renewals</h3>
          <p className="text-xs text-slate-500 mt-1">Sorted by days remaining (most urgent first)</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-dark-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Client</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase">Days Left</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase">Months Left</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase">Urgency</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">CSM Rep</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Contract</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">MRR</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase">Status</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase">Payment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500 text-sm">
                    No clients match the current filters
                  </td>
                </tr>
              ) : (
                filtered.map(d => {
                  const cfg = urgencyConfig[d.urgency];
                  const isOverdue = d.daysLeft <= 0;
                  return (
                    <tr key={d.client} className={`${cfg.row} hover:bg-dark-800/50 transition-colors`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{d.client}</div>
                        <div className="text-xs text-slate-500">
                          {d.state || '—'}{d.campaign ? ` · ${d.campaign}` : ''}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-lg font-bold ${cfg.text}`}>
                          {isOverdue ? 'OVERDUE' : d.daysLeft}
                        </span>
                        {!isOverdue && <div className="text-xs text-slate-500">days</div>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-medium ${
                          pn(d.remainingMonths) <= 1 ? 'text-red-400' :
                          pn(d.remainingMonths) <= 3 ? 'text-amber-400' :
                          'text-white'
                        }`}>
                          {clean(d.remainingMonths)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${cfg.badge}`}>
                          {isOverdue ? 'OVERDUE' : cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">{clean(d.csmRep)}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {clean(d.contractLength)}{d.contractLength ? ' mo' : ''}
                      </td>
                      <td className="px-4 py-3 text-sm text-brand-cyan font-medium">{clean(d.mrr)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          (d.status || '').toLowerCase() === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                          (d.status || '').toLowerCase() === 'paused' ? 'bg-red-500/20 text-red-400' :
                          'bg-slate-500/20 text-slate-400'
                        }`}>
                          {clean(d.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {d.duePayment ? (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            d.duePayment.includes('OVERDUE')
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-slate-500/20 text-slate-400'
                          }`}>
                            {d.duePayment}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default ClientTimelinePage;
