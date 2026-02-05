import Papa from 'papaparse';
import { SHEET_URLS, CACHE_DURATION, CACHE_KEYS } from '../utils/constants';
import { mapClient, mapSetupTiming } from '../utils/mappers';

/**
 * Fetch and parse CSV data from Google Sheets
 */
const fetchCSV = async (url, skipRow = false) => {
  const response = await fetch(url);
  const csv = await response.text();
  const lines = csv.split('\n');

  // Handle different header configurations
  // Client Ads Performance: headers in row 2, skip row 1
  // Setup Timing: headers in row 1, skip row 2
  const processedCsv = skipRow
    ? [lines[1], ...lines.slice(2)].join('\n')  // Skip row 1, headers in row 2
    : [lines[0], ...lines.slice(2)].join('\n'); // Headers in row 1, skip row 2

  return Papa.parse(processedCsv, {
    header: true,
    skipEmptyLines: true
  }).data;
};

/**
 * Get cached data if valid, otherwise null
 */
const getCachedData = (key) => {
  try {
    const cached = localStorage.getItem(key);
    const cacheTime = localStorage.getItem(CACHE_KEYS.cacheTime);
    const cacheAge = cacheTime ? Date.now() - parseInt(cacheTime) : Infinity;

    if (cached && cacheAge < CACHE_DURATION) {
      return JSON.parse(cached);
    }
  } catch (e) {
    console.warn('Cache read error:', e);
  }
  return null;
};

/**
 * Save data to cache
 */
const setCachedData = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem(CACHE_KEYS.cacheTime, Date.now().toString());
  } catch (e) {
    console.warn('Cache write error:', e);
  }
};

/**
 * Fetch client ads performance data
 */
export const fetchClients = async (useCache = true) => {
  // Try cache first
  if (useCache) {
    const cached = getCachedData(CACHE_KEYS.clients);
    if (cached) return cached;
  }

  try {
    const data = await fetchCSV(SHEET_URLS.clientAdsPerformance, true);
    const clients = data.map(mapClient).filter(r => r.client);
    setCachedData(CACHE_KEYS.clients, clients);
    return clients;
  } catch (error) {
    console.error('Error fetching clients:', error);
    throw error;
  }
};

/**
 * Fetch setup timing data
 */
export const fetchSetupData = async (useCache = true) => {
  // Try cache first
  if (useCache) {
    const cached = getCachedData(CACHE_KEYS.setup);
    if (cached) return cached;
  }

  try {
    const data = await fetchCSV(SHEET_URLS.setupTiming, false);
    const setup = data.map(mapSetupTiming).filter(r => r.client);
    setCachedData(CACHE_KEYS.setup, setup);
    return setup;
  } catch (error) {
    console.error('Error fetching setup data:', error);
    throw error;
  }
};

/**
 * Fetch all data (clients and setup)
 */
export const fetchAllData = async (useCache = true) => {
  const [clients, setupData] = await Promise.all([
    fetchClients(useCache),
    fetchSetupData(useCache)
  ]);
  return { clients, setupData };
};

/**
 * Get setup info for a specific client
 */
export const getSetupInfoForClient = (client, setupData) => {
  if (!client) return null;
  const name = client.client.toLowerCase().trim();
  return setupData.find(s => {
    const sn = (s.client || '').toLowerCase().trim();
    return sn === name ||
           sn.includes(name) ||
           name.includes(sn) ||
           name.split(' ').filter(p => p.length > 2).some(p => sn.includes(p));
  });
};

/**
 * Clear all cached data
 */
export const clearCache = () => {
  localStorage.removeItem(CACHE_KEYS.clients);
  localStorage.removeItem(CACHE_KEYS.setup);
  localStorage.removeItem(CACHE_KEYS.cacheTime);
};
