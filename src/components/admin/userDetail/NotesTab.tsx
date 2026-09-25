import React, { useState, useEffect, useCallback } from 'react';
import { StickyNote, Trash2, Loader2 } from 'lucide-react';
import { UserProfile } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { supabase } from '../../../lib/supabase';
import { formatDetailedDate } from '../../../lib/utils';

interface AdminNote {
  id: string;
  user_id: string;
  admin_id: string | null;
  category: string;
  note: string;
  created_at: string;
}

const CATEGORIES = ['general', 'moderation', 'support', 'security'] as const;

interface NotesTabProps {
  currentUser: UserProfile;
}

export const NotesTab: React.FC<NotesTabProps> = ({ currentUser }) => {
  const { user: currentAdmin } = useAuth();
  const { showToast } = useToast();
  const [notes, setNotes] = useState<AdminNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('general');
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('admin_user_notes')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });
    if (error) {
      showToast('Could not load notes', 'error');
    } else {
      setNotes((data ?? []) as unknown as AdminNote[]);
    }
    setLoading(false);
  }, [currentUser.id, showToast]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const handleAddNote = async () => {
    if (!draft.trim() || !currentAdmin) return;
    setSubmitting(true);
    const { error } = await supabase.from('admin_user_notes').insert({
      user_id: currentUser.id,
      admin_id: currentAdmin.id,
      category,
      note: draft.trim(),
    } as unknown as Record<string, unknown>);
    setSubmitting(false);
    if (error) {
      showToast('Could not save note', 'error');
    } else {
      setDraft('');
      showToast('Note added', 'success');
      await loadNotes();
    }
  };

  const handleDeleteNote = async (note: AdminNote) => {
    if (!confirm('Delete this note?')) return;
    const { error } = await supabase.from('admin_user_notes').delete().eq('id', note.id);
    if (error) {
      showToast('Could not delete note', 'error');
    } else {
      setNotes(prev => prev.filter(n => n.id !== note.id));
    }
  };

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="bg-vault-900 border border-vault-800 rounded-3xl p-4.5 space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-vault-400 border-b border-vault-800 pb-2 flex items-center gap-2">
          <StickyNote className="w-3.5 h-3.5" />
          Admin Notes
        </h4>

        <div className="space-y-2">
          <div className="flex gap-1.5">
            {CATEGORIES.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold capitalize transition-colors ${
                  category === c
                    ? 'bg-arcade-gold text-vault-950'
                    : 'bg-vault-950 border border-vault-800 text-vault-400 hover:text-white'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Add an internal note about this user..."
            rows={2}
            className="w-full bg-vault-950 border border-vault-800 focus:border-arcade-gold rounded-xl px-3 py-2 text-xs text-white placeholder-vault-600 outline-none resize-none"
          />
          <button
            onClick={handleAddNote}
            disabled={!draft.trim() || submitting}
            className="w-full py-2 bg-arcade-gold hover:bg-amber-400 disabled:opacity-40 text-vault-950 rounded-xl text-xs font-bold transition-colors"
          >
            {submitting ? 'Saving...' : 'Add Note'}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 text-arcade-gold animate-spin" />
          </div>
        ) : notes.length === 0 ? (
          <p className="text-xs text-vault-500 text-center py-4">No notes yet for this user.</p>
        ) : (
          <div className="space-y-2">
            {notes.map(n => (
              <div key={n.id} className="bg-vault-950 border border-vault-800 rounded-xl p-3 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="px-1.5 py-0.5 bg-vault-900 border border-vault-800 rounded text-[9px] font-bold uppercase text-amber-300">
                    {n.category}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-vault-500 font-mono">{formatDetailedDate(n.created_at)}</span>
                    <button
                      onClick={() => handleDeleteNote(n)}
                      className="text-vault-600 hover:text-rose-400 transition-colors"
                      title="Delete note"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <p className="text-vault-200">{n.note}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
