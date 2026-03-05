import { META_ADS_API, CACHE_DURATION, CACHE_KEYS } from '../utils/constants';

/**
 * Get cached Meta ads data if valid
 */
const getCachedMetaData = () => {
  try {
    const cached = localStorage.getItem(CACHE_KEYS.metaAds);
    const cacheTime = localStorage.getItem(CACHE_KEYS.metaAdsCacheTime);
    const cacheAge = cacheTime ? Date.now() - parseInt(cacheTime) : Infinity;

    if (cached && cacheAge < CACHE_DURATION) {
      return JSON.parse(cached);
    }
  } catch (e) {
    console.warn('Meta ads cache read error:', e);
  }
  return null;
};

/**
 * Save Meta ads data to cache
 */
const setCachedMetaData = (data) => {
  try {
    localStorage.setItem(CACHE_KEYS.metaAds, JSON.stringify(data));
    localStorage.setItem(CACHE_KEYS.metaAdsCacheTime, Date.now().toString());
  } catch (e) {
    console.warn('Meta ads cache write error:', e);
  }
};

/**
 * Fetch real-time ad data from Meta Marketing API via Vercel proxy
 */
export const fetchMetaAdData = async (useCache = true) => {
  if (useCache) {
    const cached = getCachedMetaData();
    if (cached) return cached;
  }

  try {
    const response = await fetch(META_ADS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'fetchAll' })
    });

    if (!response.ok) throw new Error('Meta ads fetch failed');

    const data = await response.json();
    const results = data.results || {};
    setCachedMetaData(results);
    return results;
  } catch (err) {
    console.error('Error fetching Meta ad data:', err);
    return {};
  }
};

/**
 * Fetch ad account list from Meta (for admin UI)
 */
export const fetchAdAccountsList = async () => {
  try {
    const response = await fetch(META_ADS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'listAdAccounts' })
    });

    if (!response.ok) throw new Error('Ad accounts fetch failed');

    const data = await response.json();
    return data.accounts || [];
  } catch (err) {
    console.error('Error fetching ad accounts:', err);
    return [];
  }
};

/**
 * Fetch daily spend data for billing audit (30-min cache)
 */
const DAILY_SPEND_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

export const fetchDailySpendData = async (clientDates) => {
  // Check cache
  try {
    const cached = localStorage.getItem(CACHE_KEYS.dailySpend);
    const cacheTime = localStorage.getItem(CACHE_KEYS.dailySpendCacheTime);
    const cacheAge = cacheTime ? Date.now() - parseInt(cacheTime) : Infinity;
    if (cached && cacheAge < DAILY_SPEND_CACHE_DURATION) {
      return JSON.parse(cached);
    }
  } catch (e) {
    console.warn('Daily spend cache read error:', e);
  }

  try {
    const response = await fetch(META_ADS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'fetchDailySpend', clientDates })
    });

    if (!response.ok) throw new Error('Daily spend fetch failed');

    const data = await response.json();
    const results = data.results || {};

    // Cache results
    try {
      localStorage.setItem(CACHE_KEYS.dailySpend, JSON.stringify(results));
      localStorage.setItem(CACHE_KEYS.dailySpendCacheTime, Date.now().toString());
    } catch (e) {
      console.warn('Daily spend cache write error:', e);
    }

    return results;
  } catch (err) {
    console.error('Error fetching daily spend data:', err);
    return {};
  }
};

/**
 * Clear Meta ads cache
 */
export const clearMetaAdsCache = () => {
  localStorage.removeItem(CACHE_KEYS.metaAds);
  localStorage.removeItem(CACHE_KEYS.metaAdsCacheTime);
};
