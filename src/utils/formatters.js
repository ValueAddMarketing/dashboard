/**
 * Parse number from string (handles currency and percentage formatting)
 */
export const pn = (v) => parseFloat(String(v || '0').replace(/[$,%]/g, '').replace(/,/g, '')) || 0;

/**
 * Format as currency (no decimals)
 */
export const fmt = (v) => '$' + pn(v).toLocaleString('en-US', { maximumFractionDigits: 0 });

/**
 * Format as currency (2 decimals)
 */
export const fmtD = (v) => '$' + pn(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Format as number with commas
 */
export const fmtN = (v) => pn(v).toLocaleString('en-US', { maximumFractionDigits: 0 });

/**
 * Format as percentage
 */
export const fmtP = (v) => pn(v).toFixed(1) + '%';

/**
 * Clean value - returns '—' for empty values
 */
export const clean = (v) => (v && v.toString().trim()) ? v.toString().trim() : '—';

/**
 * Get display name from email or user metadata
 */
export const getDisplayName = (email, user) => {
  // First try to get full_name from user metadata
  if (user?.user_metadata?.full_name) return user.user_metadata.full_name;
  if (user?.user_metadata?.name) return user.user_metadata.name;
  // Fall back to email parsing
  return email
    ? email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : 'Unknown';
};

/**
 * Get health color based on CPL
 */
export const getHealth = (cpl) => {
  if (!cpl) return 'gray';
  if (cpl <= 25) return 'green';
  if (cpl <= 50) return 'yellow';
  return 'red';
};

/**
 * Calculate health score for a client
 */
export const getHealthScore = (c, s) => {
  if (!c) return 0;
  let score = 50;

  // CPL scoring
  if (c.cpl <= 15) score += 25;
  else if (c.cpl <= 25) score += 20;
  else if (c.cpl <= 35) score += 10;
  else if (c.cpl <= 50) score += 5;

  // Appointments scoring
  if (c.appts7 >= 5) score += 15;
  else if (c.appts7 >= 3) score += 10;
  else if (c.appts7 >= 1) score += 5;

  // Deals scoring
  if (c.deals > 0 || c.listings > 0) score += 10;

  // Penalties
  if (s?.duePayment?.includes('OVERDUE')) score -= 15;
  if (s?.redFlags) score -= 10;

  return Math.max(0, Math.min(100, score));
};

/**
 * Get health color configuration based on score
 */
export const getHealthColor = (score) => {
  if (score >= 80) return { text: 'text-emerald-400', bg: 'bg-emerald-500', label: 'Healthy' };
  if (score >= 60) return { text: 'text-amber-400', bg: 'bg-amber-500', label: 'Needs Attention' };
  return { text: 'text-red-400', bg: 'bg-red-500', label: 'At Risk' };
};
