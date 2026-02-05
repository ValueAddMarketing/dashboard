import { Card, Badge } from '../components';
import { fmtD, fmtN } from '../utils/formatters';
import { SEVERITY_COLORS } from '../utils/constants';

/**
 * Red Flags Dashboard - shows clients needing attention
 */
export const RedFlagsPage = ({ clients, setupData, onSelectClient }) => {
  // Helper to get setup info for a client
  const getSetupInfo = (client) => {
    const name = client.client.toLowerCase().trim();
    return setupData.find(s => {
      const sn = (s.client || '').toLowerCase().trim();
      return sn === name || sn.includes(name) || name.includes(sn);
    });
  };

  // Analyze all clients for red flags
  const analyzeClient = (c) => {
    const s = getSetupInfo(c);
    const flags = [];

    // Payment Issues
    if (s?.duePayment?.toUpperCase().includes('OVERDUE')) {
      flags.push({ type: 'payment', severity: 'high', icon: '💳', text: 'Payment Overdue', detail: s.duePayment });
    }

    // No Leads Recently
    if (c.days >= 3 && c.last3DayLeads === 0) {
      flags.push({ type: 'leads', severity: 'high', icon: '📉', text: 'No Leads (3 Days)', detail: '0 leads in the last 3 days' });
    }

    if (c.days >= 7 && c.last7DayLeads === 0) {
      flags.push({ type: 'leads', severity: 'high', icon: '🚨', text: 'No Leads (7 Days)', detail: '0 leads in the last 7 days' });
    }

    // High CPL
    if (c.cpl > 50) {
      flags.push({ type: 'performance', severity: 'medium', icon: '📈', text: 'High CPL', detail: fmtD(c.cpl) + ' (above $50 threshold)' });
    }

    // Missing Lead Sync
    if (!c.leadySync || c.leadySync.trim() === '') {
      flags.push({ type: 'setup', severity: 'medium', icon: '🔄', text: 'Missing Leady Sync', detail: 'Lead sync not configured' });
    }

    // Missing Campaign Type
    if (!c.campaign || c.campaign.trim() === '') {
      flags.push({ type: 'setup', severity: 'low', icon: '🎯', text: 'Missing Campaign Type', detail: 'Campaign type not specified' });
    }

    // No Appointments
    if (c.leads >= 20 && c.appts === 0) {
      flags.push({ type: 'performance', severity: 'medium', icon: '📞', text: 'No Appointments', detail: c.leads + ' leads but 0 appointments' });
    }

    // Red Flags from Setup Timing
    if (s?.redFlags?.trim()) {
      flags.push({ type: 'manual', severity: 'high', icon: '🚩', text: 'Manual Red Flag', detail: s.redFlags });
    }

    // Missing from Setup Timing
    if (!s) {
      flags.push({ type: 'setup', severity: 'low', icon: '📋', text: 'Not in Setup Timing', detail: 'Client not found in Setup Timing sheet' });
    }

    return flags;
  };

  // Get all clients with their flags
  const clientsWithFlags = clients.map(c => ({
    client: c,
    setup: getSetupInfo(c),
    flags: analyzeClient(c)
  })).filter(c => c.flags.length > 0);

  // Sort by severity
  clientsWithFlags.sort((a, b) => {
    const aHigh = a.flags.filter(f => f.severity === 'high').length;
    const bHigh = b.flags.filter(f => f.severity === 'high').length;
    if (aHigh !== bHigh) return bHigh - aHigh;
    return b.flags.length - a.flags.length;
  });

  // Count by severity
  const highCount = clientsWithFlags.filter(c => c.flags.some(f => f.severity === 'high')).length;
  const mediumCount = clientsWithFlags.filter(c => c.flags.some(f => f.severity === 'medium') && !c.flags.some(f => f.severity === 'high')).length;
  const lowCount = clientsWithFlags.filter(c => !c.flags.some(f => f.severity === 'high') && !c.flags.some(f => f.severity === 'medium')).length;

  // Count by type
  const paymentIssues = clientsWithFlags.filter(c => c.flags.some(f => f.type === 'payment')).length;
  const leadIssues = clientsWithFlags.filter(c => c.flags.some(f => f.type === 'leads')).length;
  const setupIssues = clientsWithFlags.filter(c => c.flags.some(f => f.type === 'setup')).length;
  const perfIssues = clientsWithFlags.filter(c => c.flags.some(f => f.type === 'performance')).length;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-red-500">
          <div className="text-3xl font-bold text-red-400">{highCount}</div>
          <div className="text-xs text-slate-400">Critical Issues</div>
        </Card>
        <Card className="border-l-4 border-amber-500">
          <div className="text-3xl font-bold text-amber-400">{mediumCount}</div>
          <div className="text-xs text-slate-400">Warnings</div>
        </Card>
        <Card className="border-l-4 border-slate-500">
          <div className="text-3xl font-bold text-slate-400">{lowCount}</div>
          <div className="text-xs text-slate-400">Minor Issues</div>
        </Card>
        <Card className="border-l-4 border-emerald-500">
          <div className="text-3xl font-bold text-emerald-400">{clients.length - clientsWithFlags.length}</div>
          <div className="text-xs text-slate-400">Healthy Clients</div>
        </Card>
      </div>

      {/* Issue Type Breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: '💳', count: paymentIssues, label: 'Payment Issues' },
          { icon: '📉', count: leadIssues, label: 'Lead Issues' },
          { icon: '⚙️', count: setupIssues, label: 'Setup Issues' },
          { icon: '📊', count: perfIssues, label: 'Performance Issues' }
        ].map((item, i) => (
          <Card key={i} className="flex items-center gap-3">
            <span className="text-2xl">{item.icon}</span>
            <div>
              <div className="text-xl font-bold text-white">{item.count}</div>
              <div className="text-xs text-slate-400">{item.label}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Client List with Flags */}
      <Card>
        <div className="p-4 border-b border-dark-700">
          <h3 className="text-lg font-semibold text-white">
            🚩 Clients Needing Attention ({clientsWithFlags.length})
          </h3>
        </div>
        <div className="divide-y divide-dark-700">
          {clientsWithFlags.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <span className="text-4xl">✅</span>
              <p className="mt-2">No red flags detected! All clients look healthy.</p>
            </div>
          ) : (
            clientsWithFlags.map(({ client, setup, flags }) => (
              <div
                key={client.client}
                className="p-4 hover:bg-dark-800 cursor-pointer transition-colors"
                onClick={() => onSelectClient(client)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-semibold text-white">{client.client}</div>
                    <div className="text-xs text-slate-500">
                      {client.state || 'No state'} • Day {client.days} • {fmtN(client.leads)} leads • {fmtD(client.cpl)} CPL
                      {setup?.csmRep && ` • CSM: ${setup.csmRep}`}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {flags.some(f => f.severity === 'high') && (
                      <Badge variant="danger">Critical</Badge>
                    )}
                    {flags.some(f => f.severity === 'medium') && !flags.some(f => f.severity === 'high') && (
                      <Badge variant="warning">Warning</Badge>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {flags.map((flag, i) => (
                    <div
                      key={i}
                      className={`px-2 py-1 rounded border text-xs ${SEVERITY_COLORS[flag.severity]}`}
                      title={flag.detail}
                    >
                      {flag.icon} {flag.text}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
};

export default RedFlagsPage;
