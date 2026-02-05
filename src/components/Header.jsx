import { useTheme } from '../context/ThemeContext';
import { getHealthScore, getHealthColor } from '../utils/formatters';

/**
 * Header component with client info and theme toggle
 */
export const Header = ({ client, setup, title }) => {
  const { theme, toggleTheme } = useTheme();

  const score = client ? getHealthScore(client, setup) : 0;
  const health = client ? getHealthColor(score) : null;

  return (
    <header className="header-bar backdrop-blur border-b px-8 py-4 flex items-center justify-between divider">
      <div>
        {client ? (
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-primary">{client.client}</h2>
            <span className={`px-3 py-1 rounded-full text-sm ${health.text} bg-dark-800`}>
              {health.label}
            </span>
            <span className="text-secondary">Day {client.days}</span>
            {setup?.csmRep && (
              <span className="text-brand-purple text-sm">CSM: {setup.csmRep}</span>
            )}
            {setup?.mrr && (
              <span className="text-emerald-400 text-sm">MRR: {setup.mrr}</span>
            )}
          </div>
        ) : (
          <h2 className="text-xl text-secondary">{title || 'Select a client to get started'}</h2>
        )}
      </div>
      <button
        onClick={toggleTheme}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-800 hover:bg-dark-700 transition-colors text-sm"
      >
        {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
      </button>
    </header>
  );
};

export default Header;
