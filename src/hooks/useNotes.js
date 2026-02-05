import { useState, useEffect, useCallback } from 'react';
import {
  getNotes,
  addNote as addNoteService,
  updateNote as updateNoteService,
  deleteNote as deleteNoteService,
  logActivity
} from '../services/supabase';
import { useAuth } from '../context/AuthContext';

/**
 * Hook for managing client notes
 */
export const useNotes = (clientName) => {
  const { user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadNotes = useCallback(async () => {
    if (!clientName) return;
    setLoading(true);
    try {
      const { data, error: err } = await getNotes(clientName);
      if (err) throw err;
      setNotes(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [clientName]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const addNote = async (noteText, source = 'manual', isImportant = false) => {
    if (!noteText?.trim() || !clientName) return null;

    try {
      const { data, error: err } = await addNoteService({
        client_name: clientName,
        note_text: noteText,
        user_email: user?.email,
        user_id: user?.id,
        source,
        is_important: isImportant || source === 'ai_extracted'
      });

      if (err) throw err;

      setNotes(prev => [data, ...prev]);

      await logActivity({
        user_email: user?.email,
        client_name: clientName,
        action: source === 'ai_extracted' ? 'AI extracted important note' : 'Added note',
        details: noteText.substring(0, 50)
      });

      return data;
    } catch (err) {
      setError(err.message);
      return null;
    }
  };

  const updateNote = async (id, newText) => {
    if (!newText?.trim()) return false;

    try {
      const { data, error: err } = await updateNoteService(id, {
        note_text: newText,
        edited_at: new Date().toISOString(),
        edited_by: user?.email
      });

      if (err) throw err;

      setNotes(prev => prev.map(n => n.id === id ? data : n));

      await logActivity({
        user_email: user?.email,
        client_name: clientName,
        action: 'Edited note',
        details: newText.substring(0, 50)
      });

      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  };

  const removeNote = async (id) => {
    try {
      const { error: err } = await deleteNoteService(id);
      if (err) throw err;

      setNotes(prev => prev.filter(n => n.id !== id));

      await logActivity({
        user_email: user?.email,
        client_name: clientName,
        action: 'Deleted note',
        details: ''
      });

      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  };

  return {
    notes,
    loading,
    error,
    addNote,
    updateNote,
    removeNote,
    refreshNotes: loadNotes
  };
};

export default useNotes;
