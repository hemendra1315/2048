import React, { useState } from 'react';
import { Flag, X } from 'lucide-react';

const CATEGORIES: { id: string; label: string }[] = [
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'hate_speech', label: 'Hate speech' },
  { id: 'spam', label: 'Spam' },
  { id: 'inappropriate_media', label: 'Inappropriate media' },
  { id: 'impersonation', label: 'Impersonation' },
  { id: 'underage', label: 'Underage user' },
];

interface ReportUserModalProps {
  partnerName: string;
  onClose: () => void;
  onSubmit: (category: string, reason: string) => Promise<void>;
}

export const ReportUserModal: React.FC<ReportUserModalProps> = ({ partnerName, onClose, onSubmit }) => {
  const [category, setCategory] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category) return;
    setSubmitting(true);
    try {
      await onSubmit(category, reason);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        className="bg-[#111111] border border-[#262626] rounded-2xl p-5 max-w-sm w-full space-y-4 animate-fade-in"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
            <Flag className="w-4 h-4" />
            <span>Report {partnerName}</span>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-1.5">
          {CATEGORIES.map(c => (
            <label
              key={c.id}
              className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                category === c.id ? 'border-red-600/60 bg-red-950/30' : 'border-[#262626] bg-[#171717] hover:border-zinc-600'
              }`}
            >
              <input
                type="radio"
                name="category"
                value={c.id}
                checked={category === c.id}
                onChange={() => setCategory(c.id)}
                className="accent-red-500"
              />
              <span className="text-xs text-white">{c.label}</span>
            </label>
          ))}
        </div>

        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Additional details (optional)"
          rows={3}
          className="w-full bg-[#0A0A0A] border border-[#262626] focus:border-red-600/60 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-600 outline-none resize-none"
        />

        <button
          type="submit"
          disabled={!category || submitting}
          className="w-full bg-red-600 hover:bg-red-500 active:scale-98 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl text-xs transition-all"
        >
          {submitting ? 'Submitting...' : 'Submit Report'}
        </button>
      </form>
    </div>
  );
};
