import { useState, useEffect } from 'react';
import { Card } from '../components';
import { useMetaAds } from '../hooks/useMetaAds';

/**
 * Admin page for managing Meta ad account to client mappings
 */
export const MetaAdSettingsPage = ({ clients }) => {
  const {
    adAccounts,
    mappings,
    loading,
    loadAdAccounts,
    loadMappings,
    saveMappingForClient,
    refreshMetaData
  } = useMetaAds();

  const [savingClient, setSavingClient] = useState(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [statusMessage, setStatusMessage] = useState(null);

  // Load ad accounts and mappings when page opens
  useEffect(() => {
    loadAdAccounts();
    loadMappings();
  }, [loadAdAccounts, loadMappings]);

  // Get current mapping for a client
  const getMappingForClient = (clientName) => {
    return mappings.find(m => m.client_name === clientName);
  };

  // Handle mapping change
  const handleMappingChange = async (clientName, adAccountId) => {
    setSavingClient(clientName);
    setStatusMessage(null);
    try {
      await saveMappingForClient(clientName, adAccountId || null);
      setStatusMessage({ type: 'success', text: `${clientName} ${adAccountId ? 'linked' : 'unlinked'} successfully` });
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Failed to save: ${err.message}` });
    } finally {
      setSavingClient(null);
    }
  };

  // Filter clients by search
  const filteredClients = clients.filter(c =>
    !searchFilter || c.client.toLowerCase().includes(searchFilter.toLowerCase())
  );

  // Count mapped vs unmapped
  const mappedCount = clients.filter(c => getMappingForClient(c.client)).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Meta Ad Account Mappings</h2>
          <p className="text-sm text-slate-400 mt-1">
            Link clients to their Meta ad accounts for real-time spend, leads, and CPL data
          </p>
        </div>
        <button
          onClick={refreshMetaData}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-brand-cyan/20 border border-brand-cyan/30 text-brand-cyan text-sm font-medium hover:bg-brand-cyan/30 disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh Meta Data'}
        </button>
      </div>

      {/* Status message */}
      {statusMessage && (
        <div className={`p-3 rounded-lg text-sm ${
          statusMessage.type === 'success'
            ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400'
            : 'bg-red-500/20 border border-red-500/30 text-red-400'
        }`}>
          {statusMessage.text}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="text-center">
          <div className="text-2xl font-bold text-brand-cyan">{adAccounts.length}</div>
          <div className="text-xs text-slate-400">Ad Accounts Available</div>
        </Card>
        <Card className="text-center">
          <div className="text-2xl font-bold text-emerald-400">{mappedCount}</div>
          <div className="text-xs text-slate-400">Clients Linked</div>
        </Card>
        <Card className="text-center">
          <div className="text-2xl font-bold text-amber-400">{clients.length - mappedCount}</div>
          <div className="text-xs text-slate-400">Clients Unlinked</div>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <div className="p-4">
          <input
            type="text"
            value={searchFilter}
            onChange={e => setSearchFilter(e.target.value)}
            placeholder="Search clients..."
            className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500"
          />
        </div>
      </Card>

      {/* Mapping Table */}
      <Card>
        <div className="p-4 border-b border-dark-700">
          <h3 className="text-lg font-semibold text-white">Client Mappings</h3>
          {adAccounts.length === 0 && (
            <p className="text-sm text-amber-400 mt-2">
              No ad accounts found. Make sure your Meta access token is configured in Vercel environment variables
              and your System User has ad accounts assigned.
            </p>
          )}
        </div>
        <div className="divide-y divide-dark-700">
          {filteredClients.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-sm">No clients found</div>
          ) : (
            filteredClients.map(client => {
              const currentMapping = getMappingForClient(client.client);
              const isSaving = savingClient === client.client;

              return (
                <div
                  key={client.client}
                  className="p-4 flex items-center justify-between hover:bg-dark-800 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      currentMapping ? 'bg-emerald-500' : 'bg-slate-600'
                    }`} />
                    <div>
                      <div className="font-medium text-white">{client.client}</div>
                      <div className="text-xs text-slate-500">
                        {client.adAccount || 'No ad account name'} · {client.state || 'No state'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {currentMapping && (
                      <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full">
                        Live
                      </span>
                    )}
                    <select
                      value={currentMapping?.meta_ad_account_id || ''}
                      onChange={e => handleMappingChange(client.client, e.target.value)}
                      disabled={isSaving}
                      className="bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white min-w-[250px] disabled:opacity-50"
                    >
                      <option value="">Not linked</option>
                      {adAccounts.map(account => (
                        <option key={account.id} value={account.id.replace('act_', '')}>
                          {account.name} ({account.id})
                        </option>
                      ))}
                    </select>
                    {isSaving && (
                      <span className="text-xs text-brand-cyan">Saving...</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
};

export default MetaAdSettingsPage;
