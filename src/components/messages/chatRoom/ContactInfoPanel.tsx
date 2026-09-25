import React, { useState, useEffect } from 'react';
import { X, Lock, BellRing } from 'lucide-react';
import { UserProfile } from '../../../types';
import { getAvatarUrl } from '../../../lib/utils';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';

interface ContactInfoPanelProps {
  partner: UserProfile;
  onClose: () => void;
}

type NotificationMode = 'default' | 'silent' | 'custom';
const SOUNDS = ['chime', 'arcade', 'coins', 'ping'] as const;

export const ContactInfoPanel: React.FC<ContactInfoPanelProps> = ({ partner, onClose }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [mode, setMode] = useState<NotificationMode>('default');
  const [customPhrase, setCustomPhrase] = useState('');
  const [customSound, setCustomSound] = useState<(typeof SOUNDS)[number]>('chime');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user || !isSupabaseConfigured()) return;
    supabase
      .from('contact_notification_preferences')
      .select('notification_mode, custom_phrase, custom_sound')
      .eq('owner_id', user.id)
      .eq('contact_id', partner.id)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as { notification_mode: NotificationMode; custom_phrase: string | null; custom_sound: string | null } | null;
        if (row) {
          setMode(row.notification_mode);
          if (row.custom_phrase) setCustomPhrase(row.custom_phrase);
          if (row.custom_sound && (SOUNDS as readonly string[]).includes(row.custom_sound)) {
            setCustomSound(row.custom_sound as (typeof SOUNDS)[number]);
          }
        }
      });
  }, [user, partner.id]);

  const saveMode = async (next: NotificationMode) => {
    setMode(next);
    if (!user || !isSupabaseConfigured()) return;
    setSaving(true);
    const { error } = await supabase.from('contact_notification_preferences').upsert(
      {
        owner_id: user.id,
        contact_id: partner.id,
        notification_mode: next,
        custom_phrase: customPhrase || null,
        custom_sound: customSound,
      } as unknown as Record<string, unknown>,
      { onConflict: 'owner_id,contact_id' }
    );
    setSaving(false);
    if (error) {
      console.error('Save notification preference error:', error);
      showToast('Could not save notification setting', 'error');
    } else {
      showToast('Notification setting saved', 'success');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#111111] border border-[#262626] rounded-2xl w-full max-w-sm p-6 space-y-4 animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Contact info</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-2 py-2">
          <img
            src={partner.avatar_url || getAvatarUrl(partner.uid)}
            alt={partner.display_name}
            className="w-20 h-20 rounded-2xl bg-[#171717] border border-[#262626] object-cover"
          />
          <h4 className="text-base font-bold text-white">{partner.display_name}</h4>
          <p className="text-xs font-mono text-zinc-500">{partner.uid}</p>
        </div>

        <div className="flex items-start gap-3 p-3 bg-[#171717] rounded-xl">
          <Lock className="w-4 h-4 text-[#10B981] mt-0.5 shrink-0" />
          <p className="text-xs text-zinc-400">
            Messages and calls in this chat are end-to-end encrypted. Only you and {partner.display_name} can read or
            listen to them.
          </p>
        </div>

        <div className="p-3 bg-[#171717] rounded-xl space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <BellRing className="w-4 h-4 text-amber-400" />
            <span>Notifications from {partner.display_name}</span>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {(['default', 'custom', 'silent'] as NotificationMode[]).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => saveMode(m)}
                disabled={saving}
                className={`py-1.5 rounded-lg text-[11px] font-semibold capitalize transition-colors ${
                  mode === m ? 'bg-[#10B981] text-black' : 'bg-[#0A0A0A] border border-[#262626] text-zinc-400 hover:text-white'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {mode === 'custom' && (
            <div className="space-y-2 pt-1">
              <input
                type="text"
                value={customPhrase}
                onChange={e => setCustomPhrase(e.target.value)}
                onBlur={() => saveMode('custom')}
                placeholder="Custom disguised alert text"
                maxLength={80}
                className="w-full bg-[#0A0A0A] border border-[#262626] focus:border-[#10B981] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 outline-none"
              />
              <select
                value={customSound}
                onChange={e => {
                  setCustomSound(e.target.value as (typeof SOUNDS)[number]);
                  saveMode('custom');
                }}
                className="w-full bg-[#0A0A0A] border border-[#262626] rounded-lg px-3 py-2 text-xs text-white outline-none capitalize"
              >
                {SOUNDS.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
