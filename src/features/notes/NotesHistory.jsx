import { useState } from 'react';
import { Card, Badge, Button } from '../../components';
import { getDisplayName } from '../../utils/formatters';

/**
 * Notes history with edit functionality
 */
export const NotesHistory = ({ notes, onUpdate, onDelete }) => {
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');

  const startEdit = (note) => {
    setEditingId(note.id);
    setEditText(note.note_text);
  };

  const saveEdit = async (id) => {
    if (editText.trim()) {
      await onUpdate(id, editText);
      setEditingId(null);
      setEditText('');
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  return (
    <Card>
      <h3 className="text-lg font-semibold text-white mb-4">📚 Notes History</h3>
      {notes.length === 0 ? (
        <div className="text-slate-500 text-center py-4">No notes yet</div>
      ) : (
        <div className="space-y-3 max-h-[400px] overflow-y-auto scrollbar">
          {notes.map(note => (
            <div
              key={note.id}
              className={`p-4 bg-dark-800 rounded-xl group ${
                note.is_important ? 'border-l-4 border-amber-500' : ''
              } ${
                note.source === 'ai_extracted' ? 'bg-gradient-to-r from-dark-800 to-purple-900/20' : ''
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-brand-purple text-sm font-medium">
                    {getDisplayName(note.user_email)}
                  </span>
                  <span className="text-slate-600 text-sm">
                    {new Date(note.created_at).toLocaleString()}
                  </span>
                  {note.source === 'ai_extracted' && (
                    <Badge variant="purple">AI Extracted</Badge>
                  )}
                  {note.is_important && (
                    <Badge variant="warning">Important</Badge>
                  )}
                  {note.edited_at && (
                    <span className="text-slate-500 text-xs">
                      (edited by {getDisplayName(note.edited_by)} on {new Date(note.edited_at).toLocaleString()})
                    </span>
                  )}
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => startEdit(note)}
                    className="text-slate-500 hover:text-brand-cyan text-sm"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => onDelete(note.id)}
                    className="text-slate-500 hover:text-red-400 text-sm"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {editingId === note.id ? (
                <div className="mt-3">
                  <textarea
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    className="w-full bg-dark-700 border border-dark-600 rounded-lg p-3 text-white min-h-[80px]"
                  />
                  <div className="flex gap-2 mt-2">
                    <Button
                      variant="success"
                      size="sm"
                      onClick={() => saveEdit(note.id)}
                    >
                      Save
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={cancelEdit}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-white mt-2 whitespace-pre-wrap">{note.note_text}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

export default NotesHistory;
