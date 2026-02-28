import { useState, useEffect, useCallback } from 'react';
import { fetchMetaAdData, fetchAdAccountsList, clearMetaAdsCache } from '../services/metaAds';
import { getAdMappings, saveAdMapping } from '../services/supabase';

/**
 * Hook for managing Meta ads data and account mappings
 */
export const useMetaAds = () => {
  const [metaData, setMetaData] = useState({});
  const [adAccounts, setAdAccounts] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch real-time Meta ad data
  const loadMetaData = useCallback(async (useCache = true) => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchMetaAdData(useCache);
      setMetaData(data);
    } catch (err) {
      setError(err.message);
      console.error('Error loading Meta ad data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch available ad accounts from Meta Business Manager
  const loadAdAccounts = useCallback(async () => {
    try {
      const accounts = await fetchAdAccountsList();
      setAdAccounts(accounts);
    } catch (err) {
      console.error('Error loading ad accounts:', err);
    }
  }, []);

  // Fetch current client-to-ad-account mappings from Supabase
  const loadMappings = useCallback(async () => {
    try {
      const { data, error: err } = await getAdMappings();
      if (err) throw err;
      setMappings(data || []);
    } catch (err) {
      console.error('Error loading ad mappings:', err);
    }
  }, []);

  // Save a client-to-ad-account mapping
  const saveMappingForClient = useCallback(async (clientName, adAccountId) => {
    try {
      const { error: err } = await saveAdMapping(clientName, adAccountId);
      if (err) throw err;
      await loadMappings();
      // Clear cache so next fetch gets fresh data
      clearMetaAdsCache();
    } catch (err) {
      console.error('Error saving mapping:', err);
      throw err;
    }
  }, [loadMappings]);

  // Refresh all Meta data (clear cache + refetch)
  const refreshMetaData = useCallback(() => {
    clearMetaAdsCache();
    return loadMetaData(false);
  }, [loadMetaData]);

  // Load Meta data on mount
  useEffect(() => {
    loadMetaData(true);
  }, [loadMetaData]);

  return {
    metaData,
    adAccounts,
    mappings,
    loading,
    error,
    loadMetaData,
    loadAdAccounts,
    loadMappings,
    saveMappingForClient,
    refreshMetaData
  };
};

export default useMetaAds;
