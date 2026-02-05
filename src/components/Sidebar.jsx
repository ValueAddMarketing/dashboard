import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getDisplayName } from '../utils/formatters';
import { signOut } from '../services/supabase';

/**
 * Sidebar navigation component
 */
export const Sidebar = ({ clients, setupData, selectedClient, onSelectClient, tabs }) => {
  const location = useLocation();
  const { user } = useAuth();
  const currentTab = location.pathname.split('/').pop() || 'redflags';

  const handleLogout = async () => {
    await signOut();
  };

  // Check which clients are in ads performance
  const getClientStatus = (setupClient) => {
    return clients.some(c => {
      const cn = c.client.toLowerCase().trim();
      const sn = setupClient.client.toLowerCase().trim();
      return cn === sn || cn.includes(sn) || sn.includes(cn);
    });
  };

  const getAdsClient = (setupClient) => {
    return clients.find(c => {
      const cn = c.client.toLowerCase().trim();
      const sn = setupClient.client.toLowerCase().trim();
      return cn === sn || cn.includes(sn) || sn.includes(cn);
    });
  };

  return (
    <aside className="w-72 sidebar border-r flex flex-col divider">
      {/* Header */}
      <div className="p-5 border-b divider">
        <h1 className="text-xl font-bold bg-gradient-to-r from-brand-cyan to-brand-purple bg-clip-text text-transparent">
          VAM Client Success Hub
        </h1>
        <div className="flex items-center gap-2 mt-2">
          <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
          <span className="text-xs text-secondary">{getDisplayName(user?.email, user)}</span>
        </div>
      </div>

      {/* Client Selector */}
      <div className="p-4">
        <select
          value={selectedClient?.client || ''}
          onChange={e => {
            const client = clients.find(c => c.client === e.target.value);
            onSelectClient(client);
          }}
          className="w-full input-field border rounded-xl px-4 py-3 text-sm"
        >
          <option value="">Select a client...</option>
          {clients.map(c => (
            <option key={c.client} value={c.client}>{c.client}</option>
          ))}
        </select>
      </div>

      {/* Tab Navigation */}
      <nav className="py-2">
        {tabs.map(t => (
          <Link
            key={t.id}
            to={`/client/${t.id}`}
            className={`w-full flex items-start gap-3 px-5 py-3 text-left ${
              currentTab === t.id ? 'tab-active text-primary' : 'text-secondary hover-bg'
            }`}
          >
            <span className="text-lg">{t.icon}</span>
            <div>
              <div className="text-sm font-medium">{t.name}</div>
              <div className="text-xs text-muted">{t.desc}</div>
            </div>
          </Link>
        ))}
      </nav>

      {/* Client List */}
      <div className="flex-1 overflow-y-auto border-t border-dark-700">
        <div className="p-4">
          <h3 className="text-xs font-semibold text-slate-500 uppercase mb-3">All Clients</h3>
          <div className="space-y-1 max-h-[400px] overflow-y-auto scrollbar">
            {setupData.map(setup => {
              const inAdsPerf = getClientStatus(setup);
              const adsClient = getAdsClient(setup);
              return (
                <div
                  key={setup.client}
                  onClick={() => { if (adsClient) onSelectClient(adsClient); }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                    selectedClient && adsClient && selectedClient.client === adsClient.client
                      ? 'bg-brand-cyan/20 text-white'
                      : inAdsPerf
                        ? 'hover:bg-dark-800 text-slate-300'
                        : 'hover:bg-dark-800 text-slate-500'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${inAdsPerf ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                  <span className="truncate flex-1">{setup.client}</span>
                  {!inAdsPerf && <span className="text-xs text-red-400">Missing</span>}
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-dark-700 text-xs text-slate-500">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span> In Ads Performance
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500"></span> Missing from Ads
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-dark-700 space-y-2">
        <Link
          to="/dashboard"
          className="block w-full text-center py-2 bg-dark-800 hover:bg-dark-700 text-slate-300 rounded-lg text-sm"
        >
          → Media Buyer Overview
        </Link>
        <button
          onClick={handleLogout}
          className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-sm"
        >
          Logout
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
