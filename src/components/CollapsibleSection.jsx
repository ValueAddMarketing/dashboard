import { useState } from 'react';

/**
 * Collapsible section component
 */
export const CollapsibleSection = ({
  title,
  icon,
  summary,
  defaultOpen = false,
  children
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-dark-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {icon && <span className="text-xl">{icon}</span>}
          <div>
            <h4 className="font-semibold text-white">{title}</h4>
            {summary && !isOpen && (
              <p className="text-sm text-slate-400 mt-1">{summary}</p>
            )}
          </div>
        </div>
        <span className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>
      {isOpen && (
        <div className="p-4 pt-0 border-t border-dark-700">
          {children}
        </div>
      )}
    </div>
  );
};

export default CollapsibleSection;
