import { useState, useEffect, useCallback } from 'react';
import { getAllMeetings } from '../services/supabase';

/**
 * Hook for fetching all meetings across all clients within a date range.
 * Defaults to the previous month.
 */
export const useAllMeetings = () => {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Calculate previous month date range
  const getDateRange = useCallback(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0); // last day of previous month
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
      label: start.toLocaleString('default', { month: 'long', year: 'numeric' }),
    };
  }, []);

  const [dateRange, setDateRange] = useState(getDateRange);

  const loadMeetings = useCallback(async (start, end) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await getAllMeetings(start, end);
      if (err) throw err;
      setMeetings(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMeetings(dateRange.startDate, dateRange.endDate);
  }, [dateRange, loadMeetings]);

  const setMonth = (year, month) => {
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    setDateRange({
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
      label: start.toLocaleString('default', { month: 'long', year: 'numeric' }),
    });
  };

  // Group meetings by client
  const meetingsByClient = meetings.reduce((acc, m) => {
    const client = m.client_name || 'Unknown';
    if (!acc[client]) acc[client] = [];
    acc[client].push(m);
    return acc;
  }, {});

  // Compute stats
  const stats = {
    totalMeetings: meetings.length,
    totalClients: Object.keys(meetingsByClient).length,
    fathomMeetings: meetings.filter(m => m.source && m.source !== 'manual').length,
    manualMeetings: meetings.filter(m => !m.source || m.source === 'manual').length,
    withActionItems: meetings.filter(m => {
      try {
        const extra = m.ad_performance_notes
          ? (typeof m.ad_performance_notes === 'string' ? JSON.parse(m.ad_performance_notes) : m.ad_performance_notes)
          : {};
        const items = extra.actionItems || m.action_items;
        return items && (Array.isArray(items) ? items.length > 0 : true);
      } catch { return false; }
    }).length,
  };

  return {
    meetings,
    meetingsByClient,
    loading,
    error,
    dateRange,
    stats,
    setMonth,
    refresh: () => loadMeetings(dateRange.startDate, dateRange.endDate),
  };
};

export default useAllMeetings;
