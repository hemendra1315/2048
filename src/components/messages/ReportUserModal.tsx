import React, { useState } from 'react';
import { Flag, X } from 'lucide-react';
import { MessageItem, UserProfile } from '../../types';
import { ReportCategory, submitReport } from '../../lib/safetyApi';
import { useToast } from '../../context/ToastContext';

const CATEGORY_LABELS: { id: ReportCategory; label: string; hint: string }[] = [
  { id: 'harassment', label: 'Harassment or bullying', hint: 'Threats, insults, unwanted contact' },
  { id: 'hate_speech', label: 'Hate speech', hint: 'Attacks on a group or identity' },
  { id: 'inappropriate_media', label: 'Inappropriate photos or media', hint: 'Explicit or disturbing content' },
  { id: 'spam', label: 'Spam or scam', hint: 'Unwanted links, fake offers' },
  { id: 'impersonation', label: 'Pretending to be someone else', hint: 'Fake identity' },
  { id: 'underage', label: 'May be under 18', hint: 'Safety concern about a minor' },
];

interface ReportUserModalProps {
  partner: UserProfile;
  conversationId: string;
  /** The partner's recent messages; the reporter may attach one as evidence. */
  partnerMessages: MessageItem[];
  onClose: () => void;
  /** Offer "also block" (hidden if you've already blocked them). */
  canBlock?: boolean;
  onBlock?: () => Promise<void>;
}

export const ReportUserModal: React.FC<ReportUserModalProps> = ({
  partner,
  conversationId,
  partnerMessages,
  onClose,
  canBlock,
  onBlock,
}) => {
  const { showToast } = useToast();
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [reason, setReason] = useState('');
  const [messageId, setMessageId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [alsoBlock, setAlsoBlock] = useState(false);
  const recent = partnerMessages.slice(-5).reverse();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category || submitting) return;
    setSubmitting(true);
    try {
      await submitReport({
        reportedUserId: partner.id,
        category,
        reason,
        conversationId,
        messageId: messageId ?? undefined,
      });
      if (alsoBlock && onBlock) {
        try {
          await onBlock();
        } catch {
          showToast('Report sent, but blocking failed. Try again from the chat menu.', 'error');
          onClose();
          return;
        }
      }
      showToast(alsoBlock ? 'Report sent and user blocked.' : 'Report sent. Our team will review it.', 'success');
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not send report', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-title"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center anim-fade"
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
    >
      <form
        onSubmit={submit}
        className="w-full sm:max-w-md max-h-[90vh] bg-vault-900 border border-vault-800 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
      >
        <div className="p-3 border-b border-vault-800 flex items-center justify-between">
          <span id="report-title" className="t-body font-bold text-white flex items-center gap-2">
            <Flag className="w-4 h-4 text-rose-400" aria-hidden /> Report {partner.display_name}
          </span>
          <button type="button" onClick={onClose} className="ib ib-s rounded-full" aria-label="Close report">
            <X className="i" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto min-h-0">
          <fieldset className="space-y-2">
            <legend className="text-xs text-vault-400 mb-1">What's the problem?</legend>
            {CATEGORY_LABELS.map(c => (
              <label
                key={c.id}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer min-h-[44px] ${
                  category === c.id ? 'border-rose-400 bg-vault-850' : 'border-vault-750 bg-vault-950'
                }`}
              >
                <input
                  type="radio"
                  name="report-category"
                  value={c.id}
                  checked={category === c.id}
                  onChange={() => setCategory(c.id)}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm text-white">{c.label}</span>
                  <span className="block text-xs text-vault-400">{c.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {recent.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-xs text-vault-400 mb-1">Attach one of their messages (optional)</legend>
              {recent.map(m => (
                <label
                  key={m.id}
                  className={`flex items-start gap-3 p-2 rounded-xl border cursor-pointer min-h-[44px] ${
                    messageId === m.id ? 'border-rose-400 bg-vault-850' : 'border-vault-750 bg-vault-950'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={messageId === m.id}
                    onChange={() => setMessageId(prev => (prev === m.id ? null : m.id))}
                    className="mt-1"
                  />
                  <span className="text-xs text-vault-200 break-words line-clamp-2">
                    {m.content.startsWith('data:') || m.content.startsWith('http') ? 'Photo or attachment' : m.content}
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          <label className="block">
            <span className="text-xs text-vault-400">Anything else we should know? (optional)</span>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value.slice(0, 1000))}
              rows={3}
              className="mt-1 w-full rounded-xl bg-vault-950 border border-vault-750 p-2 text-sm text-white"
            />
          </label>

          {canBlock && onBlock && (
            <label className="flex items-center gap-3 p-3 rounded-xl border border-vault-750 bg-vault-950 cursor-pointer min-h-[44px]">
              <input type="checkbox" checked={alsoBlock} onChange={e => setAlsoBlock(e.target.checked)} />
              <span className="text-sm text-white">Also block {partner.display_name}</span>
            </label>
          )}

          <p className="text-xs text-vault-500">
            {partner.display_name} won't be told who reported them.
          </p>
        </div>

        <div className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-vault-800 flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="btn btn-s min-h-[44px]">Cancel</button>
          <button type="submit" disabled={!category || submitting} className="btn btn-p min-h-[44px] disabled:opacity-50">
            {submitting ? 'Sending…' : 'Send report'}
          </button>
        </div>
      </form>
    </div>
  );
};
