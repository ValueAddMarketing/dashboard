// API URLs
export const SUPABASE_URL = 'https://ecmhhonjazfbletyvncw.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjbWhob25qYXpmYmxldHl2bmN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5NDMwMjYsImV4cCI6MjA4MTUxOTAyNn0.3LZ8dAOX_ZpoUNkgY_jSeC10SaCknfPfBaZsDRjFt7c';

// Google Sheets CSV URLs
export const SHEET_URLS = {
  clientAdsPerformance: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR4LTw-15NE0j25eIOpY_bTPSAipW7-F2eXnL0xtdXMWCZtK9z3MYWxHr6ltnMChLk-YDLzwiXAfvwE/pub?gid=964722332&single=true&output=csv',
  setupTiming: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR4LTw-15NE0j25eIOpY_bTPSAipW7-F2eXnL0xtdXMWCZtK9z3MYWxHr6ltnMChLk-YDLzwiXAfvwE/pub?gid=646836237&single=true&output=csv'
};

// Cache settings
export const CACHE_DURATION = 300000; // 5 minutes in milliseconds
export const CACHE_KEYS = {
  clients: 'vam_clients',
  setup: 'vam_setup',
  cacheTime: 'vam_cache_time'
};

// Health color mapping
export const HEALTH_COLORS = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500',
  gray: 'bg-slate-500'
};

// Tab definitions for Client Success Hub
export const CLIENT_HUB_TABS = [
  { id: 'redflags', name: 'Red Flags', icon: '🚩', desc: 'Clients needing attention' },
  { id: 'health', name: 'Client Health', icon: '❤️', desc: 'Overview of client status and metrics' },
  { id: 'notes', name: 'Notes & Activity', icon: '📝', desc: 'Notes, meetings, and activity log' },
];

// Severity colors for flags
export const SEVERITY_COLORS = {
  high: 'bg-red-500/20 border-red-500/50 text-red-400',
  medium: 'bg-amber-500/20 border-amber-500/50 text-amber-400',
  low: 'bg-slate-500/20 border-slate-500/50 text-slate-400'
};
