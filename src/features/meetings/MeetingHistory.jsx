import { useState } from 'react';
import { Card, Badge, ErrorBoundary } from '../../components';
import { getDisplayName } from '../../utils/formatters';

/**
 * Parse extra analysis data stored in ad_performance_notes JSON
 */
const getExtra = (meeting) => {
  if (!meeting.ad_performance_notes) return {};
  try {
    return typeof meeting.ad_performance_notes === 'string'
      ? JSON.parse(meeting.ad_performance_notes)
      : meeting.ad_performance_notes;
  } catch {
    return {};
  }
};

/**
 * Safely convert any value to a renderable string
 */
const safe = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
};

/**
 * Parse a field that may be a JSON string, array, or other type.
 * Always returns an array.
 */
const toArray = (value) => {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

/**
 * Pick the first non-empty array from multiple sources
 */
const pick = (...sources) => {
  for (const s of sources) {
    const a = toArray(s);
    if (a.length > 0) return a;
  }
  return [];
};

/**
 * Expanded meeting details - separate component so ErrorBoundary can catch render errors
 */
const MeetingDetails = ({ meeting, onDelete }) => {
  const m = meeting;
  const extra = getExtra(m);

  const title = safe(m.meeting_title || extra.title || m.meeting_type || 'Meeting');
  const riskLevel = safe(m.risk_level || extra.riskLevel || 'medium');
  const keyPoints = pick(m.key_points, extra.keyPoints);
  const actionItems = pick(m.action_items, extra.actionItems);
  const nextSteps = pick(m.next_steps, extra.nextSteps);
  const concerns = pick(m.client_concerns, m.concerns, extra.concerns);
  const participants = pick(m.participants, extra.participants);
  const topics = pick(m.topics, extra.topics);
  const duration = m.duration || extra.duration;
  const decisions = pick(m.decisions, extra.decisions);
  const riskFactors = pick(m.risk_factors, extra.riskFactors);
  const warningSignals = pick(m.warning_signals, extra.warningSignals);
  const positiveSignals = pick(m.positive_signals, extra.positiveSignals);
  const sentimentExplanation = m.sentiment_explanation || extra.sentimentExplanation;

  return (
    <div className="p-4 pt-0 border-t border-dark-700 space-y-4">
      {/* Participants & Topics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {participants.length > 0 && (
          <div>
            <span className="text-brand-cyan text-xs font-medium">👥 Participants</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {participants.map((p, i) => (
                <Badge key={i} variant="default" className="text-xs">{safe(p)}</Badge>
              ))}
            </div>
          </div>
        )}
        {topics.length > 0 && (
          <div>
            <span className="text-brand-cyan text-xs font-medium">📋 Topics</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {topics.map((t, i) => (
                <Badge key={i} variant="purple" className="text-xs">{safe(t)}</Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Key Points */}
      {keyPoints.length > 0 && (
        <div>
          <span className="text-brand-cyan text-xs font-medium">🔑 Key Points</span>
          <ul className="mt-1 space-y-1">
            {keyPoints.map((kp, i) => (
              <li key={i} className="text-slate-300 text-xs">• {safe(kp)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Action Items */}
      {actionItems.length > 0 && (
        <div>
          <span className="text-brand-cyan text-xs font-medium">✅ Action Items</span>
          <div className="mt-1 space-y-1">
            {actionItems.map((ai, i) => {
              if (typeof ai === 'string') return <div key={i} className="p-2 rounded bg-dark-700 text-slate-300 text-xs">{ai}</div>;
              const item = ai || {};
              return (
                <div
                  key={i}
                  className={`p-2 rounded ${
                    item.priority === 'high' ? 'bg-red-500/10' :
                    item.priority === 'medium' ? 'bg-amber-500/10' :
                    'bg-dark-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300 text-xs">{safe(item.task || ai)}</span>
                    <div className="flex items-center gap-2">
                      {item.owner && <span className="text-slate-500 text-xs">👤 {safe(item.owner)}</span>}
                      {item.priority && (
                        <Badge
                          variant={item.priority === 'high' ? 'danger' : item.priority === 'medium' ? 'warning' : 'slate'}
                          className="text-[10px]"
                        >
                          {item.priority}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Decisions */}
      {decisions.length > 0 && (
        <div>
          <span className="text-brand-cyan text-xs font-medium">🎯 Decisions Made</span>
          <ul className="mt-1 space-y-1">
            {decisions.map((d, i) => (
              <li key={i} className="text-slate-300 text-xs">✓ {safe(d)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Concerns & Risk Factors */}
      {(concerns.length > 0 || riskFactors.length > 0 || warningSignals.length > 0) && (
        <div className="p-2 bg-red-500/10 rounded">
          <span className="text-red-400 text-xs font-medium">⚠️ Concerns & Risks</span>
          <ul className="mt-1 space-y-0.5">
            {concerns.map((c, i) => <li key={`c-${i}`} className="text-red-300 text-xs">• {safe(c)}</li>)}
            {riskFactors.map((r, i) => <li key={`r-${i}`} className="text-amber-300 text-xs">• {safe(r)}</li>)}
            {warningSignals.map((w, i) => <li key={`w-${i}`} className="text-amber-300 text-xs">• {safe(w)}</li>)}
          </ul>
        </div>
      )}

      {/* Positive Signals */}
      {positiveSignals.length > 0 && (
        <div className="p-2 bg-emerald-500/10 rounded">
          <span className="text-emerald-400 text-xs font-medium">✨ Positive Signals</span>
          <ul className="mt-1 space-y-0.5">
            {positiveSignals.map((p, i) => <li key={i} className="text-emerald-300 text-xs">• {safe(p)}</li>)}
          </ul>
        </div>
      )}

      {/* Next Steps */}
      {nextSteps.length > 0 && (
        <div>
          <span className="text-brand-cyan text-xs font-medium">➡️ Next Steps</span>
          <ul className="mt-1 space-y-0.5">
            {nextSteps.map((ns, i) => <li key={i} className="text-slate-300 text-xs">{i + 1}. {safe(ns)}</li>)}
          </ul>
        </div>
      )}

      {/* Full Transcript */}
      {m.transcript && (
        <details className="mt-2">
          <summary className="text-brand-cyan text-xs font-medium cursor-pointer hover:text-brand-purple">
            📜 View Full Transcript
          </summary>
          <div className="mt-2 p-3 bg-dark-700 rounded-lg max-h-[200px] overflow-y-auto scrollbar">
            <pre className="text-slate-400 text-xs whitespace-pre-wrap font-sans">{m.transcript}</pre>
          </div>
        </details>
      )}

      {/* Sentiment Explanation */}
      {sentimentExplanation && (
        <div className="text-xs text-slate-500 italic">
          💭 Sentiment note: {safe(sentimentExplanation)}
        </div>
      )}

      {/* Delete Button */}
      <div className="flex justify-end pt-2 border-t border-dark-700">
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm('Delete this meeting record?')) onDelete(m.id);
          }}
          className="text-xs text-slate-500 hover:text-red-400 transition-colors"
        >
          🗑️ Delete Meeting
        </button>
      </div>
    </div>
  );
};

/**
 * Meeting history with expandable details
 */
export const MeetingHistory = ({ meetings, onDelete }) => {
  const [expandedId, setExpandedId] = useState(null);

  const getSentimentStyle = (sentiment) => {
    if (['positive', 'excited'].includes(sentiment)) return 'bg-emerald-500/20 text-emerald-400';
    if (['negative', 'frustrated'].includes(sentiment)) return 'bg-red-500/20 text-red-400';
    if (sentiment === 'concerned') return 'bg-amber-500/20 text-amber-400';
    return 'bg-slate-500/20 text-slate-400';
  };

  const getRiskBorderColor = (level) => {
    if (level === 'high') return 'border-l-4 border-red-500';
    if (level === 'medium') return 'border-l-4 border-amber-500';
    return 'border-l-4 border-emerald-500';
  };

  return (
    <Card>
      <h3 className="text-lg font-semibold text-white mb-4">📅 Meeting History</h3>
      {meetings.length === 0 ? (
        <div className="text-slate-500 text-center py-4">No meetings recorded</div>
      ) : (
        <div className="space-y-4 max-h-[600px] overflow-y-auto scrollbar">
          {meetings.map(m => {
            const extra = getExtra(m);
            const title = safe(m.meeting_title || extra.title || m.meeting_type || 'Meeting');
            const summary = safe(m.summary || extra.summary || 'No summary');
            const riskLevel = safe(m.risk_level || extra.riskLevel || 'medium');
            const clientSentiment = safe(m.client_sentiment || extra.clientSentiment || 'neutral');
            const actionItems = pick(m.action_items, extra.actionItems);
            const participants = pick(m.participants, extra.participants);
            const duration = m.duration || extra.duration;
            const followUpNeeded = m.follow_up_needed || extra.followUpNeeded || false;
            const createdByName = m.created_by_name || extra.createdByName;

            return (
            <div
              key={m.id}
              className={`bg-dark-800 rounded-xl overflow-hidden ${getRiskBorderColor(riskLevel)}`}
            >
              {/* Meeting Header - Always Visible */}
              <div
                className="p-4 cursor-pointer hover:bg-dark-700/50 transition-colors"
                onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
              >
                <div className="flex flex-wrap justify-between items-start gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-white font-semibold">{title}</span>
                      <span className="text-slate-400 text-sm">
                        {new Date(m.meeting_date).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-slate-400 text-sm mt-1 line-clamp-2">{summary}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {clientSentiment && (
                      <span className={`px-2 py-1 rounded text-xs ${getSentimentStyle(clientSentiment)}`}>
                        {clientSentiment}
                      </span>
                    )}
                    <Badge variant={riskLevel === 'high' ? 'danger' : riskLevel === 'medium' ? 'warning' : 'success'}>
                      {riskLevel}
                    </Badge>
                    <span className="text-slate-600 text-xs">▼</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-slate-500">
                  <span>📝 Added by: <span className="text-brand-purple">{safe(createdByName || getDisplayName(m.user_email))}</span></span>
                  {duration && <span>⏱️ {safe(duration)}</span>}
                  {participants.length > 0 && <span>👥 {participants.length} participants</span>}
                  {actionItems.length > 0 && <span>✅ {actionItems.length} action items</span>}
                  {followUpNeeded && <span className="text-amber-400">📞 Follow-up needed</span>}
                </div>
              </div>

              {/* Expanded Meeting Details - wrapped in ErrorBoundary */}
              {expandedId === m.id && (
                <ErrorBoundary>
                  <MeetingDetails meeting={m} onDelete={onDelete} />
                </ErrorBoundary>
              )}
            </div>
          );
          })}
        </div>
      )}
    </Card>
  );
};

export default MeetingHistory;
