import { Card } from '../components';
import { QuickNotes, NotesHistory } from '../features/notes';
import { MeetingTranscript, MeetingHistory } from '../features/meetings';
import { useNotes, useMeetings, useActivities } from '../hooks';
import { getDisplayName } from '../utils/formatters';

/**
 * Combined Notes, Meetings & Activity page
 */
export const NotesActivityPage = ({ client }) => {
  const clientName = client?.client;

  const {
    notes,
    addNote,
    updateNote,
    removeNote,
    refreshNotes
  } = useNotes(clientName);

  const {
    meetings,
    analyzing,
    saving,
    analysis,
    error: meetingError,
    processTranscript,
    saveMeeting,
    removeMeeting,
    clearError: clearMeetingError
  } = useMeetings(clientName);

  const { activities } = useActivities(clientName);

  if (!client) {
    return (
      <Card className="p-12 text-center text-slate-500">
        Select a client to view notes and activity
      </Card>
    );
  }

  const handleSaveMeeting = async (meetingData) => {
    const result = await saveMeeting(meetingData, addNote);
    if (result) {
      refreshNotes();
    }
    return result;
  };

  return (
    <div className="space-y-6">
      {/* Quick Notes */}
      <QuickNotes onAddNote={(text) => addNote(text)} />

      {/* Notes History */}
      <NotesHistory
        notes={notes}
        onUpdate={updateNote}
        onDelete={removeNote}
      />

      {/* Meeting Transcript */}
      <MeetingTranscript
        onAnalyze={processTranscript}
        onSave={handleSaveMeeting}
        analyzing={analyzing}
        saving={saving}
        analysis={analysis}
        error={meetingError}
        onClearError={clearMeetingError}
      />

      {/* Meeting History */}
      <MeetingHistory
        meetings={meetings}
        onDelete={removeMeeting}
      />

      {/* Activity Log */}
      <Card>
        <h3 className="text-lg font-semibold text-white mb-4">📋 Activity Log</h3>
        {activities.length === 0 ? (
          <div className="text-slate-500 text-center py-4">No activity yet</div>
        ) : (
          <div className="space-y-2 max-h-[250px] overflow-y-auto scrollbar">
            {activities.map(a => (
              <div key={a.id} className="p-3 bg-dark-800 rounded-lg flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-brand-purple font-medium text-sm">
                      {getDisplayName(a.user_email)}
                    </span>
                    <span className="text-slate-600 text-xs">
                      {new Date(a.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-slate-400 text-sm">{a.action}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default NotesActivityPage;
