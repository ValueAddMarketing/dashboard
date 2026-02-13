import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../utils/constants';

// Extract project ref from URL for localStorage key
const supabaseRef = SUPABASE_URL.match(/https:\/\/([^.]+)\./)?.[1] || '';

// Create Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Manually clear Supabase auth tokens from localStorage.
// Used when the project is unreachable and signOutLocal() itself would fail.
export const clearLocalAuthTokens = () => {
  try {
    localStorage.removeItem(`sb-${supabaseRef}-auth-token`);
  } catch {}
};

// ============ AUTH FUNCTIONS ============

export const signUpWithEmail = async (email, password) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  return { data, error };
};

export const signInWithEmail = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
};

export const signInWithGoogle = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin
    }
  });
  return { data, error };
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  return { error };
};

export const signOutLocal = async () => {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  return { error };
};

export const getSession = async () => {
  const { data: { session }, error } = await supabase.auth.getSession();
  return { session, error };
};

export const onAuthStateChange = (callback) => {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user || null);
  });
};

// ============ NOTES FUNCTIONS ============

export const getNotes = async (clientName) => {
  const { data, error } = await supabase
    .from('client_notes')
    .select('*')
    .eq('client_name', clientName)
    .order('created_at', { ascending: false });
  return { data, error };
};

export const addNote = async (note) => {
  const { data, error } = await supabase
    .from('client_notes')
    .insert(note)
    .select()
    .single();
  return { data, error };
};

export const updateNote = async (id, updates) => {
  const { data, error } = await supabase
    .from('client_notes')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  return { data, error };
};

export const deleteNote = async (id) => {
  const { error } = await supabase
    .from('client_notes')
    .delete()
    .eq('id', id);
  return { error };
};

// ============ MEETINGS FUNCTIONS ============

export const getMeetings = async (clientName) => {
  const { data, error } = await supabase
    .from('meeting_notes')
    .select('*')
    .eq('client_name', clientName)
    .order('meeting_date', { ascending: false });
  return { data, error };
};

export const addMeeting = async (meeting) => {
  const { data, error } = await supabase
    .from('meeting_notes')
    .insert(meeting)
    .select()
    .single();
  return { data, error };
};

export const deleteMeeting = async (id) => {
  const { error } = await supabase
    .from('meeting_notes')
    .delete()
    .eq('id', id);
  return { error };
};

// ============ ACTIVITY LOG FUNCTIONS ============

export const getActivities = async (clientName, limit = 50) => {
  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .eq('client_name', clientName)
    .order('created_at', { ascending: false })
    .limit(limit);
  return { data, error };
};

export const logActivity = async (activity) => {
  const { data, error } = await supabase
    .from('activity_log')
    .insert(activity);
  return { data, error };
};

// ============ STRATEGY FUNCTIONS ============

export const getStrategy = async (clientName) => {
  const { data, error } = await supabase
    .from('client_strategy')
    .select('*')
    .eq('client_name', clientName)
    .single();
  return { data, error };
};

export const upsertStrategy = async (strategy) => {
  const { data, error } = await supabase
    .from('client_strategy')
    .upsert(strategy, { onConflict: 'client_name' });
  return { data, error };
};

// ============ AI FUNCTIONS (via Edge Functions) ============

export const analyzeTranscript = async (transcript, clientName) => {
  const { data, error } = await supabase.functions.invoke('analyze-transcript', {
    body: { transcript, clientName }
  });
  return { data, error };
};

export const getLiveCallHelp = async (situation, clientInfo) => {
  const { data, error } = await supabase.functions.invoke('live-call-help', {
    body: { situation, ...clientInfo }
  });
  return { data, error };
};
