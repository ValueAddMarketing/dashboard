import { Card, HealthScoreCard, CollapsibleSection, DataRow } from '../components';
import { fmt, fmtD, fmtN, fmtP, clean, pn } from '../utils/formatters';

/**
 * Client Health page - detailed client metrics and status
 */
export const ClientHealthPage = ({ client, setup }) => {
  if (!client) {
    return (
      <Card className="p-12 text-center text-slate-500">
        Select a client to view details
      </Card>
    );
  }

  const c = client;
  const s = setup;

  // Calculate trend data
  const last3DayLeads = (c.last3DaySellerLeads || 0) + (c.last3DayBuyerLeads || 0);
  const last7DayLeads = (c.last7DaySellerLeads || 0) + (c.last7DayBuyerLeads || 0);
  const avgDailyLeads = c.leads / Math.max(c.days, 1);
  const recent7DayAvg = last7DayLeads / 7;
  const leadTrend = recent7DayAvg > avgDailyLeads * 1.1 ? 'up' : recent7DayAvg < avgDailyLeads * 0.9 ? 'down' : null;

  const last7CPL = c.last7DaySellerCPL || c.last7DayBuyerCPL || 0;
  const cplTrend = last7CPL > 0 && c.cpl > 0 ? (last7CPL < c.cpl * 0.9 ? 'up' : last7CPL > c.cpl * 1.1 ? 'down' : null) : null;

  return (
    <div className="space-y-6">
      {/* Health Score + Quick Stats Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        <HealthScoreCard client={c} setup={s} />

        {/* Quick Stats with Trends */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="border-l-4 border-brand-cyan">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-3xl font-bold text-white">{fmt(c.spend)}</div>
                <div className="text-sm text-slate-400 mt-1">Total Spend</div>
              </div>
              <span className="text-2xl">💰</span>
            </div>
          </Card>

          <Card className="border-l-4 border-brand-cyan">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-3xl font-bold text-brand-cyan">{fmtN(c.leads)}</div>
                <div className="text-sm text-slate-400 mt-1">Total Leads</div>
              </div>
              <span className="text-2xl">📊</span>
            </div>
            {leadTrend && (
              <div className={`mt-2 text-sm flex items-center gap-1 ${leadTrend === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
                <span>{leadTrend === 'up' ? '↗️' : '↘️'}</span>
                <span>{leadTrend === 'up' ? 'Trending up' : 'Trending down'} vs avg</span>
              </div>
            )}
          </Card>

          <Card className="border-l-4 border-brand-purple">
            <div className="flex items-start justify-between">
              <div>
                <div className={`text-3xl font-bold ${c.cpl > 50 ? 'text-red-400' : c.cpl > 35 ? 'text-amber-400' : 'text-white'}`}>
                  {fmtD(c.cpl)}
                </div>
                <div className="text-sm text-slate-400 mt-1">Cost Per Lead</div>
              </div>
              <span className="text-2xl">📈</span>
            </div>
            {cplTrend && (
              <div className={`mt-2 text-sm flex items-center gap-1 ${cplTrend === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
                <span>{cplTrend === 'up' ? '↘️' : '↗️'}</span>
                <span>{cplTrend === 'up' ? 'Improving!' : 'Increasing'}</span>
              </div>
            )}
          </Card>

          <Card className="border-l-4 border-brand-purple">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-3xl font-bold text-brand-purple">{fmtN(c.appts)}</div>
                <div className="text-sm text-slate-400 mt-1">Appointments</div>
              </div>
              <span className="text-2xl">📅</span>
            </div>
            {c.leads > 0 && (
              <div className="mt-2 text-sm text-slate-400">
                {(c.appts / c.leads * 100).toFixed(1)}% conversion
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Recent Performance */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="border-l-4 border-amber-500">
          <div className="section-title mb-4">📊 Last 3 Days</div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-3xl font-bold text-white">{fmtN(last3DayLeads)}</div>
              <div className="text-sm text-slate-400 mt-1">Leads</div>
              {last3DayLeads === 0 && c.days >= 3 && (
                <div className="mt-2 text-xs text-amber-400">⚠️ No leads</div>
              )}
            </div>
            <div>
              <div className="text-3xl font-bold text-brand-cyan">
                {fmtD(c.last3DaySellerCPL || c.last3DayBuyerCPL || 0)}
              </div>
              <div className="text-sm text-slate-400 mt-1">CPL</div>
            </div>
          </div>
        </Card>

        <Card className="border-l-4 border-brand-cyan">
          <div className="section-title mb-4">📈 Last 7 Days</div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-3xl font-bold text-white">{fmtN(last7DayLeads)}</div>
              <div className="text-sm text-slate-400 mt-1">Leads</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-brand-cyan">{fmtD(last7CPL)}</div>
              <div className="text-sm text-slate-400 mt-1">CPL</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Status & Team Info */}
      <CollapsibleSection
        title="Status & Team Info"
        icon="📋"
        summary={`${c.status || 'No status'} • ${c.teamMember || 'No team member'} • ${c.overallStanding || 'No standing'}`}
        defaultOpen={true}
      >
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-1">
          <DataRow label="Status" value={c.status} highlight color={
            (c.status || '').toLowerCase() === 'active' ? 'text-emerald-400' :
            (c.status || '').toLowerCase() === 'paused' ? 'text-red-400' :
            'text-brand-cyan'
          } icon="📋"/>
          <DataRow label="Team Member" value={c.teamMember} highlight color="text-brand-purple" icon="👥"/>
          <DataRow label="Overall Standing" value={c.overallStanding} highlight color={
            (c.overallStanding || '').toLowerCase().includes('good') ? 'text-emerald-400' :
            (c.overallStanding || '').toLowerCase().includes('bad') || (c.overallStanding || '').toLowerCase().includes('poor') ? 'text-red-400' :
            'text-amber-400'
          } icon="📊"/>
          <DataRow label="Specific Target" value={c.specificTarget} icon="🎯"/>
          <DataRow label="Overlap" value={c.overlap} icon="🔄"/>
          <DataRow label="Using DQ Reasons" value={c.usingDqReasons} icon="📝"/>
          <DataRow label="Calling using CRM" value={c.callingUsingCrm} icon="💻"/>
          <DataRow label="Current Testings" value={c.currentTestings} icon="🧪"/>
          <DataRow label="Client Avg Home Value" value={c.clientAvgHomeValue} icon="🏠"/>
        </div>
        {c.mbNotes && (
          <div className="mt-4 p-3 bg-dark-800 rounded-lg">
            <div className="text-xs text-slate-500 mb-1">MB Detailed Notes / Test Conducted</div>
            <div className="text-sm text-slate-300">{c.mbNotes}</div>
          </div>
        )}
      </CollapsibleSection>

      {/* Collapsible Sections */}
      <CollapsibleSection
        title="CSM & Client Status"
        icon="👤"
        summary={`${s?.csmRep || 'No CSM'} • ${s?.status || 'Status unknown'} • MRR: ${s?.mrr || '—'}`}
        defaultOpen={false}
      >
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-1">
          <DataRow label="CSM Rep" value={s?.csmRep} highlight color="text-brand-purple" icon="👤"/>
          <DataRow label="Status" value={s?.status} icon="📋"/>
          <DataRow label="Concern" value={s?.concern} icon="⚠️"/>
          <DataRow label="Referral" value={s?.referral} icon="🤝"/>
          <DataRow label="Testimonial" value={s?.testimonial} icon="⭐"/>
          <DataRow label="Lender" value={s?.lender} icon="🏦"/>
          <DataRow label="Last CSM Note" value={s?.lastCsmNote} icon="📝"/>
          <DataRow label="Upcoming CSM Date" value={s?.upcomingCsmDate} icon="📅"/>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Client & Contract Details"
        icon="📋"
        summary={`${s?.state || c.state || 'No state'} • ${c.contract || s?.contractCategory || 'No category'} • Days Left: ${s?.daysLeft || '—'}`}
        defaultOpen={false}
      >
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-1">
          <DataRow label="State" value={s?.state || c.state} icon="📍"/>
          <DataRow label="Campaign" value={s?.campaign || c.campaign} icon="🎯"/>
          <DataRow label="Contract" value={c.contract} highlight icon="📄"/>
          <DataRow label="Contract Length (Months)" value={c.contractLengthMonths} icon="📅"/>
          <DataRow label="Remaining Contract Months" value={c.remainingContractMonths} highlight color={pn(c.remainingContractMonths) <= 2 ? 'text-red-400' : 'text-brand-cyan'} icon="⏳"/>
          <DataRow label="Contract Category" value={s?.contractCategory} highlight icon="📄"/>
          <DataRow label="MRR" value={s?.mrr} highlight color="text-emerald-400" icon="💰"/>
          <DataRow label="Fulfilled" value={s?.fulfilled} highlight color="text-emerald-400" icon="✅"/>
          <DataRow label="Days Left" value={s?.daysLeft} highlight color={pn(s?.daysLeft) < 0 ? 'text-red-400' : 'text-brand-cyan'} icon="⏳"/>
          <DataRow label="Due Payment" value={s?.duePayment} highlight color={s?.duePayment?.includes('OVERDUE') ? 'text-red-400' : 'text-emerald-400'} icon="💳"/>
          <DataRow label="Spanish" value={s?.spanish} icon="🌐"/>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Key Dates"
        icon="📅"
        summary={`Paid: ${clean(s?.paidDate)} • Ads Live: ${clean(s?.adLiveDate)}`}
        defaultOpen={false}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: '💰', value: s?.paidDate, label: 'Paid' },
            { icon: '🚀', value: s?.onboardedDate, label: 'Onboarded' },
            { icon: '📞', value: s?.launchCallDate, label: 'Launch Call' },
            { icon: '📢', value: s?.adLiveDate, label: 'Ads Live' }
          ].map((item, i) => (
            <div key={i} className="bg-dark-800 rounded-xl p-5 text-center">
              <div className="text-2xl mb-2">{item.icon}</div>
              <div className="text-lg font-bold text-white">{clean(item.value)}</div>
              <div className="text-sm text-slate-400 mt-1">{item.label}</div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Ad Account & Spend"
        icon="📢"
        summary={`${c.adAccount || 'No account'} • ${fmt(c.spend)} total • ${c.days} days running`}
        defaultOpen={false}
      >
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-1">
          <DataRow label="Ad Account" value={c.adAccount} highlight icon="📱"/>
          <DataRow label="Daily Set Ad Spend" value={fmtD(c.dailySetAdSpend)} icon="💵"/>
          <DataRow label="Total Ad Spend" value={fmt(c.spend)} highlight color="text-brand-cyan" icon="💰"/>
          <DataRow label="Ad Spend Per Month" value={fmt(c.spendPerMonth)} icon="📆"/>
          <DataRow label="Ad Spend Per Day" value={fmtD(c.spendPerDay)} icon="📅"/>
          <DataRow label="Days Running" value={c.days} icon="⏱️"/>
          <DataRow label="Weeks Running" value={c.weeks} icon="📊"/>
          <DataRow label="Months Running" value={c.months} icon="🗓️"/>
          <DataRow label="Calling Status" value={c.callingStatus} icon="📞"/>
          <DataRow label="Lead Sync" value={c.leadySync} icon="🔗"/>
        </div>
      </CollapsibleSection>

      {/* Mortgage Data */}
      {(c.mortgageLeads > 0 || c.last3DayMortgageLeads > 0 || c.last7DayMortgageLeads > 0 || c.mortgageAppts > 0) && (
        <CollapsibleSection
          title="Mortgage Performance"
          icon="🏦"
          summary={`${fmtN(c.mortgageLeads)} leads • ${fmtD(c.mortgageCPL)} CPL • ${fmtN(c.mortgageAppts)} appts`}
          defaultOpen={false}
        >
          <div className="grid md:grid-cols-2 gap-x-8 gap-y-1">
            <DataRow label="Last 3 Day Mortgage Leads" value={fmtN(c.last3DayMortgageLeads)} icon="📊"/>
            <DataRow label="Last 3 Days Mortgage CPL" value={fmtD(c.last3DayMortgageCPL)} icon="💵"/>
            <DataRow label="Last 7 Day Mortgage Leads" value={fmtN(c.last7DayMortgageLeads)} icon="📊"/>
            <DataRow label="Last 7 Days Mortgage CPL" value={fmtD(c.last7DayMortgageCPL)} icon="💵"/>
            <DataRow label="Lifetime Mortgage Leads" value={fmtN(c.mortgageLeads)} highlight color="text-brand-purple" icon="📊"/>
            <DataRow label="Lifetime Mortgage CPL" value={fmtD(c.mortgageCPL)} highlight icon="💵"/>
            <DataRow label="Lifetime Mortgage Spend" value={fmt(c.mortgageSpend)} icon="💰"/>
            <DataRow label="Mortgage Appts" value={fmtN(c.mortgageAppts)} highlight color="text-emerald-400" icon="📅"/>
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
};

export default ClientHealthPage;
