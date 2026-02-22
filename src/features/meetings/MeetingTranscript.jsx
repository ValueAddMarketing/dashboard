import { useState } from 'react';
import { Card, Button, Badge } from '../../components';

/**
 * Meeting transcript input and AI analysis component
 */
export const MeetingTranscript = ({
  onAnalyze,
  onSave,
  analyzing,
  saving,
  analysis,
  error,
  onClearError
}) => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [title, setTitle] = useState('');
  const [transcript, setTranscript] = useState('');

  const handleAnalyze = async () => {
    if (onClearError) onClearError();
    const result = await onAnalyze(transcript);
    if (result?.title && !title) {
      setTitle(result.title);
    }
  };

  const handleSave = async () => {
    if (onClearError) onClearError();
    const result = await onSave({ date, title, transcript });
    if (result) {
      setTranscript('');
      setTitle('');
    }
  };

  const getSentimentStyle = (sentiment) => {
    if (['positive', 'excited'].includes(sentiment)) return 'bg-emerald-500/20 text-emerald-400';
    if (['negative', 'frustrated'].includes(sentiment)) return 'bg-red-500/20 text-red-400';
    if (sentiment === 'concerned') return 'bg-amber-500/20 text-amber-400';
    return 'bg-slate-500/20 text-slate-400';
  };

  const getSentimentEmoji = (sentiment) => {
    const emojis = {
      positive: '😊', negative: '😟', excited: '🎉',
      frustrated: '😤', concerned: '😟', neutral: '😐'
    };
    return emojis[sentiment] || '😐';
  };

  return (
    <Card>
      <h3 className="text-lg font-semibold text-white mb-4">🎙️ Meeting Transcript Summary</h3>

      {/* Input Section */}
      <div className="flex flex-wrap gap-4 mb-4">
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="bg-dark-800 border border-dark-700 rounded-xl px-4 py-2 text-white"
        />
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Meeting title (optional - AI will suggest)"
          className="flex-1 min-w-[200px] bg-dark-800 border border-dark-700 rounded-xl px-4 py-2 text-white"
        />
      </div>

      <textarea
        value={transcript}
        onChange={e => setTranscript(e.target.value)}
        placeholder="Paste transcript from Fathom, Otter, Zoom, etc..."
        className="w-full bg-dark-800 border border-dark-700 rounded-xl p-4 text-white min-h-[150px]"
      />

      <div className="flex flex-wrap gap-3 mt-3">
        <Button
          onClick={handleAnalyze}
          disabled={!transcript.trim() || analyzing}
          loading={analyzing}
        >
          🤖 Analyze with AI
        </Button>
        <Button
          variant="success"
          onClick={handleSave}
          disabled={!transcript.trim() || saving}
          loading={saving}
        >
          💾 Save Meeting
        </Button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-center justify-between">
          <span>Failed to save meeting: {error}</span>
          {onClearError && (
            <button onClick={onClearError} className="text-red-400 hover:text-red-300 ml-3 text-xs">
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* Analysis Display */}
      {analysis && (
        <div className="mt-4 p-5 bg-dark-800 rounded-xl space-y-4">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-dark-700">
            <div>
              <h4 className="text-lg font-semibold text-white">{analysis.title || 'Meeting Analysis'}</h4>
              {analysis.duration && <span className="text-slate-400 text-sm">Duration: {analysis.duration}</span>}
            </div>
            <div className="flex items-center gap-2">
              {analysis.clientSentiment && (
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getSentimentStyle(analysis.clientSentiment)}`}>
                  {getSentimentEmoji(analysis.clientSentiment)} {analysis.clientSentiment}
                </span>
              )}
              {analysis.riskLevel && (
                <Badge variant={analysis.riskLevel === 'high' ? 'danger' : analysis.riskLevel === 'medium' ? 'warning' : 'success'}>
                  Risk: {analysis.riskLevel}
                </Badge>
              )}
            </div>
          </div>

          {/* Summary */}
          <div>
            <span className="text-brand-cyan text-sm font-medium">Summary</span>
            <p className="text-white mt-1">{analysis.summary}</p>
          </div>

          {/* Participants & Topics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {analysis.participants?.length > 0 && (
              <div>
                <span className="text-brand-cyan text-sm font-medium">👥 Participants</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {analysis.participants.map((p, i) => (
                    <Badge key={i} variant="default">{p}</Badge>
                  ))}
                </div>
              </div>
            )}
            {analysis.topics?.length > 0 && (
              <div>
                <span className="text-brand-cyan text-sm font-medium">📋 Topics Discussed</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {analysis.topics.map((t, i) => (
                    <Badge key={i} variant="purple">{t}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Key Points */}
          {analysis.keyPoints?.length > 0 && (
            <div>
              <span className="text-brand-cyan text-sm font-medium">🔑 Key Points</span>
              <ul className="mt-1 space-y-1">
                {analysis.keyPoints.map((kp, i) => (
                  <li key={i} className="text-slate-300 text-sm flex items-start gap-2">
                    <span className="text-brand-cyan">•</span> {kp}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action Items */}
          {analysis.actionItems?.length > 0 && (
            <div>
              <span className="text-brand-cyan text-sm font-medium">✅ Action Items</span>
              <div className="mt-2 space-y-2">
                {analysis.actionItems.map((ai, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-lg ${
                      ai.priority === 'high' ? 'bg-red-500/10 border border-red-500/30' :
                      ai.priority === 'medium' ? 'bg-amber-500/10 border border-amber-500/30' :
                      'bg-dark-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-white text-sm">{ai.task}</span>
                      {ai.priority && (
                        <Badge variant={ai.priority === 'high' ? 'danger' : ai.priority === 'medium' ? 'warning' : 'slate'}>
                          {ai.priority}
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-4 mt-1 text-xs text-slate-400">
                      <span>👤 {ai.owner}</span>
                      {ai.dueDate && <span>📅 {ai.dueDate}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Concerns & Warning Signals */}
          {(analysis.concerns?.length > 0 || analysis.warningSignals?.length > 0) && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <span className="text-red-400 text-sm font-medium">⚠️ Concerns & Warning Signals</span>
              <ul className="mt-1 space-y-1">
                {analysis.concerns?.map((c, i) => (
                  <li key={`c-${i}`} className="text-red-300 text-sm">• {c}</li>
                ))}
                {analysis.warningSignals?.map((w, i) => (
                  <li key={`w-${i}`} className="text-amber-300 text-sm">• {w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Positive Signals */}
          {analysis.positiveSignals?.length > 0 && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
              <span className="text-emerald-400 text-sm font-medium">✨ Positive Signals</span>
              <ul className="mt-1 space-y-1">
                {analysis.positiveSignals.map((p, i) => (
                  <li key={i} className="text-emerald-300 text-sm">• {p}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Next Steps */}
          {analysis.nextSteps?.length > 0 && (
            <div>
              <span className="text-brand-cyan text-sm font-medium">➡️ Next Steps</span>
              <ul className="mt-1 space-y-1">
                {analysis.nextSteps.map((ns, i) => (
                  <li key={i} className="text-slate-300 text-sm">{i + 1}. {ns}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Important Notes Alert */}
          {analysis.importantNotes?.length > 0 && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <span className="text-amber-400 text-sm font-medium">📌 Important Notes (will be added to Notes History)</span>
              <ul className="mt-1 space-y-1">
                {analysis.importantNotes.map((n, i) => (
                  <li key={i} className="text-amber-200 text-sm">• {n}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Follow-up indicator */}
          {analysis.followUpNeeded && (
            <div className="flex items-center gap-2 p-2 bg-brand-purple/20 rounded-lg">
              <span className="text-brand-purple">📞</span>
              <span className="text-brand-purple text-sm font-medium">Follow-up Required</span>
              {analysis.followUpItems?.length > 0 && (
                <span className="text-slate-400 text-sm">({analysis.followUpItems.join(', ')})</span>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

export default MeetingTranscript;
