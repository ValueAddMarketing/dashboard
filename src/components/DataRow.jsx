import { clean } from '../utils/formatters';

/**
 * Data row component for displaying label-value pairs
 */
export const DataRow = ({
  label,
  value,
  icon,
  highlight = false,
  color = 'text-white'
}) => {
  const displayValue = clean(value);

  return (
    <div className="flex items-center justify-between py-2 border-b border-dark-700/50 last:border-0">
      <span className="text-slate-400 text-sm flex items-center gap-2">
        {icon && <span>{icon}</span>}
        {label}
      </span>
      <span className={`text-sm ${highlight ? `font-semibold ${color}` : 'text-slate-300'}`}>
        {displayValue}
      </span>
    </div>
  );
};

export default DataRow;
