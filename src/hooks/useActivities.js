import { useState, useEffect, useCallback } from 'react';
import { getActivities } from '../services/supabase';

/**
 * Hook for managing activity log
 */
export const useActivities = (clientName, limit = 50) => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadActivities = useCallback(async () => {
    if (!clientName) return;
    setLoading(true);
    try {
      const { data, error: err } = await getActivities(clientName, limit);
      if (err) throw err;
      setActivities(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [clientName, limit]);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  return {
    activities,
    loading,
    error,
    refreshActivities: loadActivities
  };
};

export default useActivities;
