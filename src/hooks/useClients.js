import { useState, useEffect } from 'react';
import { fetchAllData, getSetupInfoForClient, clearCache } from '../services/googleSheets';

/**
 * Hook for managing client data from Google Sheets
 */
export const useClients = () => {
  const [clients, setClients] = useState([]);
  const [setupData, setSetupData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = async (useCache = true) => {
    try {
      setLoading(true);
      setError(null);
      const { clients: c, setupData: s } = await fetchAllData(useCache);
      setClients(c);
      setSetupData(s);
    } catch (err) {
      setError(err.message);
      console.error('Error loading client data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(true);
  }, []);

  const getSetupInfo = (client) => getSetupInfoForClient(client, setupData);

  const refreshData = () => {
    clearCache();
    loadData(false);
  };

  const findClientByName = (name) => {
    if (!name) return null;
    const lowerName = name.toLowerCase();
    return clients.find(c => c.client.toLowerCase() === lowerName);
  };

  return {
    clients,
    setupData,
    loading,
    error,
    getSetupInfo,
    refreshData,
    findClientByName
  };
};

export default useClients;
