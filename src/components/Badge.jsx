/**
 * Reusable Badge component for status indicators
 */
const variants = {
  success: 'bg-emerald-500/20 text-emerald-400',
  warning: 'bg-amber-500/20 text-amber-400',
  danger: 'bg-red-500/20 text-red-400',
  info: 'bg-brand-cyan/20 text-brand-cyan',
  purple: 'bg-purple-500/20 text-purple-400',
  slate: 'bg-slate-500/20 text-slate-400',
  default: 'bg-dark-700 text-slate-300'
};

export const Badge = ({ children, variant = 'default', className = '' }) => {
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
};

export default Badge;
