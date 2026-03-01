import { useState } from 'react';
import { Card, Badge, ErrorBoundary } from '../components';
import { useAllMeetings } from '../hooks/useAllMeetings';

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

const safe = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
};

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

const pick = (...sources) => {
  for (const s of sources) {
    const a = toArray(s);
    if (a.length > 0) return a;
  }
  return [];
};

/**
 * Sentiment style helper
 */
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

/**
 * Month selector component
 */
const MonthSelector = ({ dateRange, onSetMonth }) => {
  const now = new Date();
  const months = [];
  // Show current month plus last 6 months
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleString('default', { month: 'long', year: 'numeric' }) });
  }

  return (
    <select
      value={dateRange.label}
      onChange={e => {
        const selected = months.find(m => m.label === e.target.value);
        if (selected) onSetMonth(selected.year, selected.month);
      }}
      className="bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-slate-300"
    >
      {months.map(m => (
        <option key={m.label} value={m.label}>{m.label}</option>
      ))}
    </select>
  );
};

/**
 * Stats overview cards
 */
const StatsBar = ({ stats }) => {
  const items = [
    { label: 'Total Meetings', value: stats.totalMeetings, color: 'text-white' },
    { label: 'Clients', value: stats.totalClients, color: 'text-brand-cyan' },
    { label: 'Fathom Synced', value: stats.fathomMeetings, color: 'text-brand-purple' },
    { label: 'Manual', value: stats.manualMeetings, color: 'text-slate-400' },
    { label: 'With Action Items', value: stats.withActionItems, color: 'text-amber-400' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {items.map(item => (
        <div key={item.label} className="bg-dark-800 rounded-xl p-4 text-center">
          <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
          <div className="text-xs text-slate-500 mt-1">{item.label}</div>
        </div>
      ))}
    </div>
  );
};

/**
 * Single expanded meeting detail — Fathom-style layout
 */
const MeetingDetail = ({ meeting }) => {
  const [activeTab, setActiveTab] = useState('summary');
  const extra = getExtra(meeting);

  const title = safe(meeting.meeting_title || extra.title || meeting.meeting_type || 'Meeting');
  const summary = safe(meeting.summary || extra.summary || 'No summary available');
  const riskLevel = safe(meeting.risk_level || extra.riskLevel || 'medium');
  const clientSentiment = safe(meeting.client_sentiment || extra.clientSentiment || 'neutral');
  const keyPoints = pick(meeting.key_points, extra.keyPoints);
  const actionItems = pick(meeting.action_items, extra.actionItems);
  const nextSteps = pick(meeting.next_steps, extra.nextSteps);
  const concerns = pick(meeting.client_concerns, meeting.concerns, extra.concerns);
  const participants = pick(meeting.participants, extra.participants);
  const topics = pick(meeting.topics, extra.topics);
  const decisions = pick(meeting.decisions, extra.decisions);
  const riskFactors = pick(meeting.risk_factors, extra.riskFactors);
  const warningSignals = pick(meeting.warning_signals, extra.warningSignals);
  const positiveSignals = pick(meeting.positive_signals, extra.positiveSignals);
  const sentimentExplanation = meeting.sentiment_explanation || extra.sentimentExplanation;
  const followUpItems = pick(extra.followUpItems);
  const clientRequests = pick(extra.clientRequests);
  const fathomUrl = extra.fathomUrl;
  const duration = meeting.duration || extra.duration;
  const source = meeting.source || 'manual';

  const tabs = [
    { id: 'summary', label: 'AI Summary' },
    { id: 'actions', label: `Action Items${actionItems.length ? ` (${actionItems.length})` : ''}` },
    { id: 'transcript', label: 'Transcript' },
    { id: 'details', label: 'Details' },
  ];

  return (
    <div className="border-t border-dark-700 mt-1">
      {/* Tab navigation */}
      <div className="flex border-b border-dark-700">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={(e) => { e.stopPropagation(); setActiveTab(tab.id); }}
            className={`px-4 py-2.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-brand-cyan border-b-2 border-brand-cyan'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-4 space-y-4">

        {/* ===== AI SUMMARY TAB ===== */}
        {activeTab === 'summary' && (
          <div className="space-y-4">
            {/* Summary */}
            <div>
              <h4 className="text-brand-cyan text-xs font-semibold uppercase tracking-wide mb-2">Summary</h4>
              <p className="text-slate-300 text-sm leading-relaxed">{summary}</p>
            </div>

            {/* Participants & Meta */}
            {(participants.length > 0 || duration) && (
              <div className="flex flex-wrap gap-4">
                {participants.length > 0 && (
                  <div>
                    <span className="text-slate-500 text-xs">Participants</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {participants.map((p, i) => (
                        <Badge key={i} variant="default" className="text-xs">{safe(p)}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {duration && (
                  <div>
                    <span className="text-slate-500 text-xs">Duration</span>
                    <div className="text-slate-300 text-sm mt-1">{safe(duration)}</div>
                  </div>
                )}
              </div>
            )}

            {/* Topics */}
            {topics.length > 0 && (
              <div>
                <span className="text-slate-500 text-xs">Topics Discussed</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {topics.map((t, i) => (
                    <Badge key={i} variant="purple" className="text-xs">{safe(t)}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Key Points */}
            {keyPoints.length > 0 && (
              <div>
                <h4 className="text-brand-cyan text-xs font-semibold uppercase tracking-wide mb-2">Key Points</h4>
                <ul className="space-y-1.5">
                  {keyPoints.map((kp, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-300">
                      <span className="text-brand-cyan mt-0.5 shrink-0">-</span>
                      <span>{safe(kp)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Decisions */}
            {decisions.length > 0 && (
              <div>
                <h4 className="text-brand-cyan text-xs font-semibold uppercase tracking-wide mb-2">Decisions Made</h4>
                <ul className="space-y-1.5">
                  {decisions.map((d, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-300">
                      <span className="text-emerald-400 mt-0.5 shrink-0">&#10003;</span>
                      <span>{safe(d)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Sentiment */}
            {sentimentExplanation && (
              <div className="p-3 bg-dark-700 rounded-lg">
                <span className="text-slate-500 text-xs">Client Sentiment</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded text-xs ${getSentimentStyle(clientSentiment)}`}>
                    {clientSentiment}
                  </span>
                  <span className="text-slate-400 text-xs italic">{safe(sentimentExplanation)}</span>
                </div>
              </div>
            )}

            {/* Positive Signals */}
            {positiveSignals.length > 0 && (
              <div className="p-3 bg-emerald-500/10 rounded-lg">
                <span className="text-emerald-400 text-xs font-medium">Positive Signals</span>
                <ul className="mt-1.5 space-y-1">
                  {positiveSignals.map((p, i) => (
                    <li key={i} className="text-emerald-300 text-xs">+ {safe(p)}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Concerns & Risks */}
            {(concerns.length > 0 || riskFactors.length > 0 || warningSignals.length > 0) && (
              <div className="p-3 bg-red-500/10 rounded-lg">
                <span className="text-red-400 text-xs font-medium">Concerns & Risks</span>
                <ul className="mt-1.5 space-y-1">
                  {concerns.map((c, i) => <li key={`c-${i}`} className="text-red-300 text-xs">- {safe(c)}</li>)}
                  {riskFactors.map((r, i) => <li key={`r-${i}`} className="text-amber-300 text-xs">- {safe(r)}</li>)}
                  {warningSignals.map((w, i) => <li key={`w-${i}`} className="text-amber-300 text-xs">- {safe(w)}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ===== ACTION ITEMS TAB ===== */}
        {activeTab === 'actions' && (
          <div className="space-y-4">
            {actionItems.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-6">No action items recorded for this meeting.</p>
            ) : (
              <>
                <h4 className="text-brand-cyan text-xs font-semibold uppercase tracking-wide">Action Items</h4>
                <div className="space-y-2">
                  {actionItems.map((ai, i) => {
                    if (typeof ai === 'string') {
                      return (
                        <div key={i} className="flex items-start gap-3 p-3 bg-dark-700 rounded-lg">
                          <div className="w-5 h-5 rounded border border-slate-600 shrink-0 mt-0.5" />
                          <span className="text-slate-300 text-sm">{ai}</span>
                        </div>
                      );
                    }
                    const item = ai || {};
                    return (
                      <div
                        key={i}
                        className={`p-3 rounded-lg ${
                          item.priority === 'high' ? 'bg-red-500/10 border border-red-500/20' :
                          item.priority === 'medium' ? 'bg-amber-500/10 border border-amber-500/20' :
                          'bg-dark-700'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-5 h-5 rounded border border-slate-600 shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <div className="text-slate-300 text-sm">{safe(item.task || ai)}</div>
                            <div className="flex items-center gap-3 mt-1.5">
                              {item.owner && (
                                <span className="text-slate-500 text-xs">Owner: {safe(item.owner)}</span>
                              )}
                              {item.deadline && (
                                <span className="text-slate-500 text-xs">Due: {safe(item.deadline)}</span>
                              )}
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
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Next Steps */}
            {nextSteps.length > 0 && (
              <div>
                <h4 className="text-brand-cyan text-xs font-semibold uppercase tracking-wide mb-2">Next Steps</h4>
                <ol className="space-y-1.5">
                  {nextSteps.map((ns, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-300">
                      <span className="text-brand-purple font-medium shrink-0">{i + 1}.</span>
                      <span>{safe(ns)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Follow-up Items */}
            {followUpItems.length > 0 && (
              <div>
                <h4 className="text-brand-cyan text-xs font-semibold uppercase tracking-wide mb-2">Follow-up Items</h4>
                <ul className="space-y-1.5">
                  {followUpItems.map((f, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-300">
                      <span className="text-amber-400 shrink-0">-</span>
                      <span>{safe(f)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Client Requests */}
            {clientRequests.length > 0 && (
              <div>
                <h4 className="text-brand-cyan text-xs font-semibold uppercase tracking-wide mb-2">Client Requests</h4>
                <ul className="space-y-1.5">
                  {clientRequests.map((r, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-300">
                      <span className="text-brand-cyan shrink-0">-</span>
                      <span>{safe(r)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ===== TRANSCRIPT TAB ===== */}
        {activeTab === 'transcript' && (
          <div>
            {meeting.transcript ? (
              <div className="bg-dark-700 rounded-lg p-4 max-h-[400px] overflow-y-auto scrollbar">
                <pre className="text-slate-400 text-sm whitespace-pre-wrap font-sans leading-relaxed">
                  {meeting.transcript}
                </pre>
              </div>
            ) : (
              <p className="text-slate-500 text-sm text-center py-6">No transcript available for this meeting.</p>
            )}
          </div>
        )}

        {/* ===== DETAILS TAB ===== */}
        {activeTab === 'details' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-dark-700 rounded-lg p-3">
                <span className="text-slate-500 text-xs">Client</span>
                <div className="text-white text-sm mt-0.5">{meeting.client_name || 'Unknown'}</div>
              </div>
              <div className="bg-dark-700 rounded-lg p-3">
                <span className="text-slate-500 text-xs">Date</span>
                <div className="text-white text-sm mt-0.5">
                  {new Date(meeting.meeting_date).toLocaleDateString('en-US', {
                    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
                  })}
                </div>
              </div>
              <div className="bg-dark-700 rounded-lg p-3">
                <span className="text-slate-500 text-xs">Source</span>
                <div className="text-sm mt-0.5">
                  {source === 'manual' ? (
                    <span className="text-slate-400">Manual Entry</span>
                  ) : (
                    <span className="text-brand-cyan">
                      {source === 'fathom_webhook' ? 'Fathom (Live)' : 'Fathom (Sync)'}
                    </span>
                  )}
                </div>
              </div>
              <div className="bg-dark-700 rounded-lg p-3">
                <span className="text-slate-500 text-xs">Risk Level</span>
                <div className="mt-0.5">
                  <Badge variant={riskLevel === 'high' ? 'danger' : riskLevel === 'medium' ? 'warning' : 'success'}>
                    {riskLevel}
                  </Badge>
                </div>
              </div>
              {duration && (
                <div className="bg-dark-700 rounded-lg p-3">
                  <span className="text-slate-500 text-xs">Duration</span>
                  <div className="text-white text-sm mt-0.5">{safe(duration)}</div>
                </div>
              )}
              <div className="bg-dark-700 rounded-lg p-3">
                <span className="text-slate-500 text-xs">Sentiment</span>
                <div className="mt-0.5">
                  <span className={`px-2 py-0.5 rounded text-xs ${getSentimentStyle(clientSentiment)}`}>
                    {clientSentiment}
                  </span>
                </div>
              </div>
            </div>
            {fathomUrl && (
              <a
                href={fathomUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-sm text-brand-cyan hover:text-brand-purple transition-colors"
              >
                Open in Fathom &rarr;
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Single meeting card in the list
 */
const MeetingCard = ({ meeting, isExpanded, onToggle }) => {
  const extra = getExtra(meeting);
  const title = safe(meeting.meeting_title || extra.title || meeting.meeting_type || 'Meeting');
  const summary = safe(meeting.summary || extra.summary || 'No summary');
  const riskLevel = safe(meeting.risk_level || extra.riskLevel || 'medium');
  const clientSentiment = safe(meeting.client_sentiment || extra.clientSentiment || 'neutral');
  const actionItems = pick(meeting.action_items, extra.actionItems);
  const participants = pick(meeting.participants, extra.participants);
  const duration = meeting.duration || extra.duration;
  const source = meeting.source || 'manual';

  return (
    <div className={`bg-dark-800 rounded-xl overflow-hidden ${getRiskBorderColor(riskLevel)} transition-all`}>
      {/* Header — always visible */}
      <div
        className="p-4 cursor-pointer hover:bg-dark-700/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex flex-wrap justify-between items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-white font-semibold truncate">{title}</span>
              <span className="text-slate-500 text-sm">
                {new Date(meeting.meeting_date).toLocaleDateString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric'
                })}
              </span>
            </div>
            <p className="text-slate-400 text-sm mt-1 line-clamp-2">{summary}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {clientSentiment && (
              <span className={`px-2 py-1 rounded text-xs ${getSentimentStyle(clientSentiment)}`}>
                {clientSentiment}
              </span>
            )}
            <Badge variant={riskLevel === 'high' ? 'danger' : riskLevel === 'medium' ? 'warning' : 'success'}>
              {riskLevel}
            </Badge>
            <span className={`text-slate-600 text-xs transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
              &#9660;
            </span>
          </div>
        </div>

        {/* Quick meta row */}
        <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-slate-500">
          {source !== 'manual' && (
            <span className="px-1.5 py-0.5 rounded bg-brand-cyan/20 text-brand-cyan text-[10px] font-medium">
              Fathom
            </span>
          )}
          {duration && <span>&#9201; {safe(duration)}</span>}
          {participants.length > 0 && <span>&#128101; {participants.length} participants</span>}
          {actionItems.length > 0 && <span>&#9989; {actionItems.length} action items</span>}
        </div>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <ErrorBoundary>
          <MeetingDetail meeting={meeting} />
        </ErrorBoundary>
      )}
    </div>
  );
};

/**
 * Aggregated action items view across all meetings
 */
const AllActionItems = ({ meetings }) => {
  const items = [];

  meetings.forEach(meeting => {
    const extra = getExtra(meeting);
    const title = safe(meeting.meeting_title || extra.title || meeting.meeting_type || 'Meeting');
    const actionItemsRaw = pick(meeting.action_items, extra.actionItems);

    actionItemsRaw.forEach(ai => {
      items.push({
        meeting: title,
        client: meeting.client_name,
        date: meeting.meeting_date,
        ...(typeof ai === 'string' ? { task: ai } : ai),
      });
    });
  });

  // Sort by priority (high first)
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2));

  if (items.length === 0) {
    return (
      <Card>
        <h3 className="text-lg font-semibold text-white mb-4">All Action Items</h3>
        <p className="text-slate-500 text-sm text-center py-6">No action items found for this period.</p>
      </Card>
    );
  }

  return (
    <Card>
      <h3 className="text-lg font-semibold text-white mb-4">
        All Action Items <span className="text-slate-500 text-sm font-normal">({items.length})</span>
      </h3>
      <div className="space-y-2 max-h-[500px] overflow-y-auto scrollbar">
        {items.map((item, i) => (
          <div
            key={i}
            className={`p-3 rounded-lg ${
              item.priority === 'high' ? 'bg-red-500/10 border border-red-500/20' :
              item.priority === 'medium' ? 'bg-amber-500/10 border border-amber-500/20' :
              'bg-dark-800'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-slate-300 text-sm">{safe(item.task || item)}</div>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                  <span className="text-brand-purple">{item.client}</span>
                  <span>{item.meeting}</span>
                  {item.owner && <span>Owner: {safe(item.owner)}</span>}
                </div>
              </div>
              {item.priority && (
                <Badge
                  variant={item.priority === 'high' ? 'danger' : item.priority === 'medium' ? 'warning' : 'slate'}
                  className="text-[10px] shrink-0"
                >
                  {item.priority}
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};


/**
 * Main Fathom Meetings Dashboard Page
 */
export const FathomMeetingsPage = () => {
  const { meetings, meetingsByClient, loading, error, dateRange, stats, setMonth, refresh } = useAllMeetings();
  const [expandedId, setExpandedId] = useState(null);
  const [viewMode, setViewMode] = useState('timeline'); // 'timeline' | 'by-client' | 'actions'
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClient, setFilterClient] = useState('');

  // Filter meetings
  const filteredMeetings = meetings.filter(m => {
    const matchesSearch = !searchQuery || [
      m.meeting_title,
      m.meeting_type,
      m.summary,
      m.client_name,
      m.transcript,
    ].some(field => field && field.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesClient = !filterClient || m.client_name === filterClient;

    return matchesSearch && matchesClient;
  });

  const clientNames = [...new Set(meetings.map(m => m.client_name).filter(Boolean))].sort();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">&#128260;</div>
          <p className="text-slate-400 text-sm">Loading meetings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Fathom Meetings</h1>
          <p className="text-slate-400 text-sm mt-1">{dateRange.label}</p>
        </div>
        <div className="flex items-center gap-3">
          <MonthSelector dateRange={dateRange} onSetMonth={setMonth} />
          <button
            onClick={refresh}
            className="px-3 py-2 bg-dark-800 hover:bg-dark-700 text-slate-300 rounded-lg text-sm transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Stats */}
      <StatsBar stats={stats} />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* View mode */}
        <div className="flex rounded-lg overflow-hidden border border-dark-700">
          {[
            { id: 'timeline', label: 'Timeline' },
            { id: 'by-client', label: 'By Client' },
            { id: 'actions', label: 'Action Items' },
          ].map(mode => (
            <button
              key={mode.id}
              onClick={() => setViewMode(mode.id)}
              className={`px-4 py-2 text-xs font-medium transition-colors ${
                viewMode === mode.id
                  ? 'bg-brand-cyan/20 text-brand-cyan'
                  : 'bg-dark-800 text-slate-400 hover:text-slate-300'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search meetings..."
          className="flex-1 min-w-[200px] bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500"
        />

        {/* Client filter */}
        <select
          value={filterClient}
          onChange={e => setFilterClient(e.target.value)}
          className="bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-slate-300"
        >
          <option value="">All Clients</option>
          {clientNames.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      {/* ===== TIMELINE VIEW ===== */}
      {viewMode === 'timeline' && (
        <div className="space-y-3">
          {filteredMeetings.length === 0 ? (
            <Card>
              <p className="text-slate-500 text-center py-8">
                No meetings found for {dateRange.label}.
              </p>
            </Card>
          ) : (
            filteredMeetings.map(meeting => (
              <MeetingCard
                key={meeting.id}
                meeting={meeting}
                isExpanded={expandedId === meeting.id}
                onToggle={() => setExpandedId(expandedId === meeting.id ? null : meeting.id)}
              />
            ))
          )}
        </div>
      )}

      {/* ===== BY CLIENT VIEW ===== */}
      {viewMode === 'by-client' && (
        <div className="space-y-6">
          {Object.keys(meetingsByClient).length === 0 ? (
            <Card>
              <p className="text-slate-500 text-center py-8">
                No meetings found for {dateRange.label}.
              </p>
            </Card>
          ) : (
            Object.entries(meetingsByClient)
              .filter(([client]) => !filterClient || client === filterClient)
              .sort(([, a], [, b]) => b.length - a.length)
              .map(([client, clientMeetings]) => {
                const filtered = clientMeetings.filter(m => {
                  if (!searchQuery) return true;
                  return [m.meeting_title, m.meeting_type, m.summary, m.transcript]
                    .some(field => field && field.toLowerCase().includes(searchQuery.toLowerCase()));
                });
                if (filtered.length === 0) return null;

                return (
                  <div key={client}>
                    <div className="flex items-center gap-3 mb-3">
                      <h2 className="text-lg font-semibold text-white">{client}</h2>
                      <Badge variant="info" className="text-xs">{filtered.length} meetings</Badge>
                    </div>
                    <div className="space-y-3">
                      {filtered.map(meeting => (
                        <MeetingCard
                          key={meeting.id}
                          meeting={meeting}
                          isExpanded={expandedId === meeting.id}
                          onToggle={() => setExpandedId(expandedId === meeting.id ? null : meeting.id)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })
          )}
        </div>
      )}

      {/* ===== ACTION ITEMS VIEW ===== */}
      {viewMode === 'actions' && (
        <AllActionItems meetings={filteredMeetings} />
      )}
    </div>
  );
};

export default FathomMeetingsPage;
