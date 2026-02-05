import { useState } from 'react';
import { Card, Button } from '../../components';

/**
 * Quick notes input component
 */
export const QuickNotes = ({ onAddNote }) => {
  const [note, setNote] = useState('');

  const handleSubmit = () => {
    if (note.trim()) {
      onAddNote(note);
      setNote('');
    }
  };

  return (
    <Card>
      <h3 className="text-lg font-semibold text-white mb-4">📝 Quick Notes</h3>
      <div className="flex gap-3">
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && handleSubmit()}
          placeholder="Add a note..."
          className="flex-1 bg-dark-800 border border-dark-700 rounded-xl px-4 py-3 text-white"
        />
        <Button onClick={handleSubmit} className="bg-brand-cyan text-dark-900">
          Add
        </Button>
      </div>
    </Card>
  );
};

export default QuickNotes;
