import { useState, useEffect, useCallback } from 'react';
import {
  getMeetings,
  addMeeting as addMeetingService,
  deleteMeeting as deleteMeetingService,
  analyzeTranscript,
  logActivity
} from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { getDisplayName } from '../utils/formatters';

/**
 * Hook for managing client meetings
 */
export const useMeetings = (clientName) => {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(null);

  const loadMeetings = useCallback(async () => {
    if (!clientName) return;
    setLoading(true);
    try {
      const { data, error: err } = await getMeetings(clientName);
      if (err) throw err;
      setMeetings(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [clientName]);

  useEffect(() => {
    loadMeetings();
  }, [loadMeetings]);

  const processTranscript = async (transcript) => {
    if (!transcript?.trim()) return null;

    setAnalyzing(true);
    setError(null);

    try {
      const { data, error: err } = await analyzeTranscript(transcript, clientName);

      if (err) throw new Error(err.message || 'Analysis failed');
      if (data?.error) throw new Error(data.error);

      setAnalysis(data);
      return data;
    } catch (err) {
      setError(err.message);
      const fallback = {
        summary: `Transcript saved (AI analysis failed: ${err.message}). Please ensure the Supabase Edge Function is deployed with ANTHROPIC_API_KEY.`,
        keyPoints: [],
        actionItems: [],
        riskLevel: 'medium',
        importantNotes: [],
        participants: [],
        topics: []
      };
      setAnalysis(fallback);
      return fallback;
    } finally {
      setAnalyzing(false);
    }
  };

  const saveMeeting = async (meetingData, addNoteCallback) => {
    if (!meetingData.transcript?.trim() && !analysis) return null;

    try {
      const fullMeetingData = {
        client_name: clientName,
        meeting_date: meetingData.date,
        meeting_title: meetingData.title || analysis?.title || 'Meeting Notes',
        transcript: meetingData.transcript,
        summary: analysis?.summary || 'Manual entry',
        duration: analysis?.duration || null,
        participants: analysis?.participants || [],
        topics: analysis?.topics || [],
        client_sentiment: analysis?.clientSentiment || 'neutral',
        sentiment_explanation: analysis?.sentimentExplanation || null,
        key_points: analysis?.keyPoints || [],
        action_items: analysis?.actionItems || [],
        decisions: analysis?.decisions || [],
        concerns: analysis?.concerns || [],
        follow_up_needed: analysis?.followUpNeeded || false,
        follow_up_items: analysis?.followUpItems || [],
        risk_level: analysis?.riskLevel || 'medium',
        risk_factors: analysis?.riskFactors || [],
        next_steps: analysis?.nextSteps || [],
        client_requests: analysis?.clientRequests || [],
        positive_signals: analysis?.positiveSignals || [],
        warning_signals: analysis?.warningSignals || [],
        user_email: user?.email,
        user_id: user?.id,
        created_by_name: getDisplayName(user?.email, user)
      };

      const { data, error: err } = await addMeetingService(fullMeetingData);
      if (err) throw err;

      setMeetings(prev => [data, ...prev]);

      // Add important notes if callback provided
      if (addNoteCallback && analysis) {
        // Add important notes
        if (analysis.importantNotes?.length > 0) {
          for (const note of analysis.importantNotes) {
            await addNoteCallback(
              `📌 [From ${fullMeetingData.meeting_title} on ${meetingData.date}] ${note}`,
              'ai_extracted'
            );
          }
        }

        // Add high-priority action items
        const highPriorityActions = (analysis.actionItems || []).filter(a => a.priority === 'high');
        for (const action of highPriorityActions) {
          await addNoteCallback(
            `⚠️ HIGH PRIORITY ACTION [${meetingData.date}]: ${action.task} (Owner: ${action.owner})`,
            'ai_extracted'
          );
        }

        // Add concerns if risk is high
        if (analysis.riskLevel === 'high' && analysis.concerns?.length > 0) {
          await addNoteCallback(
            `🚨 CLIENT CONCERNS [${meetingData.date}]: ${analysis.concerns.join('; ')}`,
            'ai_extracted'
          );
        }
      }

      await logActivity({
        user_email: user?.email,
        client_name: clientName,
        action: 'Added meeting notes',
        details: `${fullMeetingData.meeting_title}: ${(analysis?.summary || 'Manual entry').substring(0, 100)}`
      });

      setAnalysis(null);
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    }
  };

  const removeMeeting = async (id) => {
    try {
      const { error: err } = await deleteMeetingService(id);
      if (err) throw err;

      setMeetings(prev => prev.filter(m => m.id !== id));

      await logActivity({
        user_email: user?.email,
        client_name: clientName,
        action: 'Deleted meeting record',
        details: ''
      });

      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  };

  const clearAnalysis = () => setAnalysis(null);

  return {
    meetings,
    loading,
    analyzing,
    analysis,
    error,
    processTranscript,
    saveMeeting,
    removeMeeting,
    clearAnalysis,
    refreshMeetings: loadMeetings
  };
};

export default useMeetings;
