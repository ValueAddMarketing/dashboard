import { getHealthScore, getHealthColor } from '../utils/formatters';

/**
 * Health score visualization card
 */
export const HealthScoreCard = ({ client, setup }) => {
  const score = getHealthScore(client, setup);
  const health = getHealthColor(score);

  // Calculate issues
  const issues = [];
  if (client?.cpl > 35) issues.push('High CPL');
  if (client?.appts7 === 0 && client?.days > 7) issues.push('No recent appts');
  if (setup?.duePayment?.includes('OVERDUE')) issues.push('Payment overdue');

  return (
    <div className="card p-6 relative overflow-hidden">
      {/* Background gradient based on health */}
      <div className={`absolute inset-0 ${health.bg} opacity-10`} />

      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Health Score</h3>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${health.text} bg-dark-800`}>
            {health.label}
          </span>
        </div>

        {/* Score display */}
        <div className="flex items-center gap-6">
          <div className="relative w-24 h-24">
            <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="currentColor"
                strokeWidth="10"
                className="text-dark-700"
              />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="currentColor"
                strokeWidth="10"
                strokeDasharray={`${score * 2.83} 283`}
                strokeLinecap="round"
                className={health.text}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-2xl font-bold ${health.text}`}>{score}</span>
            </div>
          </div>

          <div className="flex-1">
            {issues.length > 0 ? (
              <div className="space-y-1">
                <p className="text-sm text-slate-400 mb-2">Issues detected:</p>
                {issues.map((issue, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-amber-400">
                    <span>⚠️</span>
                    <span>{issue}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-emerald-400">No issues detected</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HealthScoreCard;
