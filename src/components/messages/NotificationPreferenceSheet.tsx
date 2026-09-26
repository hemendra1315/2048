import React, { useState, useEffect, useCallback } from 'react';
import { Bell, Sparkles, Send, Check, Volume2, X } from 'lucide-react';
import { UserProfile, NotificationMode } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useVault } from '../../context/VaultContext';
import { useToast } from '../../context/ToastContext';
import {
  getContactNotificationPreference,
  saveContactNotificationPreference,
  sendTestNotification,
  DEFAULT_DISGUISED_TITLE,
  disguisedBody,
  NOTIFICATION_SOUND_OPTIONS,
} from '../../lib/notifications';

interface NotificationPreferenceSheetProps {
  partner: UserProfile;
  onClose: () => void;
}

const PRESET_PHRASES = [
  '🏆 New high score unlocked!',
  '⚡ Bonus round available',
  '🎁 Reward waiting',
  '⭐ Level 40 cleared!',
];

/** Per-contact disguised notification style — moved out of the profile/media panel
 *  so it lives on its own, reached from the chat's "..." options menu. */
export const NotificationPreferenceSheet: React.FC<NotificationPreferenceSheetProps> = ({ partner, onClose }) => {
  const { user } = useAuth();
  const { preferences } = useVault();
  const { showToast } = useToast();

  const [notificationMode, setNotificationMode] = useState<NotificationMode>('default');
  const [customPhrase, setCustomPhrase] = useState('');
  const [customSound, setCustomSound] = useState('default');
  const [isSavingPref, setIsSavingPref] = useState(false);
  const [isTestingNotification, setIsTestingNotification] = useState(false);
  const [phraseError, setPhraseError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !partner.id) return;
    let isMounted = true;
    const loadPref = async () => {
      const pref = await getContactNotificationPreference(user.id, partner.id);
      if (!isMounted) return;
      setNotificationMode(pref.notification_mode);
      setCustomPhrase(pref.custom_phrase || '');
      setCustomSound(pref.custom_sound || 'default');
    };
    void loadPref();
    return () => { isMounted = false; };
  }, [user, partner.id]);

  const handleSavePreferences = useCallback(
    async (mode: NotificationMode, phrase: string, sound: string) => {
      if (!user) return;
      const trimmed = phrase.trim();
      if (mode === 'custom') {
        if (!trimmed) {
          setPhraseError('Custom phrase cannot be empty');
          return;
        }
        if (trimmed.length > 60) {
          setPhraseError('Phrase must be 60 characters or less');
          return;
        }
      }
      setPhraseError(null);
      setIsSavingPref(true);
      try {
        await saveContactNotificationPreference(user.id, partner.id, {
          notification_mode: mode,
          custom_phrase: mode === 'custom' ? trimmed : null,
          custom_sound: sound,
        });
        showToast('Notification settings saved', 'success');
      } catch (err) {
        console.error('Failed to save notification preference:', err);
        showToast('Failed to save notification settings', 'error');
      } finally {
        setIsSavingPref(false);
      }
    },
    [user, partner.id, showToast]
  );

  const handleModeChange = (newMode: NotificationMode) => {
    setNotificationMode(newMode);
    if (newMode === 'custom' && !customPhrase) {
      setCustomPhrase('🏆 New high score unlocked!');
      void handleSavePreferences('custom', '🏆 New high score unlocked!', customSound);
    } else {
      void handleSavePreferences(newMode, customPhrase, customSound);
    }
  };

  const handleTestNotification = async () => {
    if (notificationMode === 'silent') {
      showToast('Notifications are set to Silent for this contact', 'info');
      return;
    }
    const titleToUse =
      notificationMode === 'custom' ? customPhrase.trim() || DEFAULT_DISGUISED_TITLE : DEFAULT_DISGUISED_TITLE;
    setIsTestingNotification(true);
    try {
      await sendTestNotification({
        title: titleToUse,
        body: disguisedBody(preferences.custom_app_name),
        sound: customSound,
      });
      showToast('Disguised test notification sent to device', 'success');
    } catch (err) {
      console.error('Test notification error:', err);
      showToast('Test notification triggered (check system banner)', 'info');
    } finally {
      setIsTestingNotification(false);
    }
  };

  const previewTitle =
    notificationMode === 'silent'
      ? '(No notification sent)'
      : notificationMode === 'custom'
      ? customPhrase.trim() || '🏆 New high score unlocked!'
      : DEFAULT_DISGUISED_TITLE;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Notification settings"
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center anim-fade"
      onClick={onClose}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
    >
      <div
        className="w-full sm:max-w-sm bg-vault-900 border border-vault-800 rounded-t-2xl sm:rounded-2xl p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl anim-sheet max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-emerald" aria-hidden />
            <h3 className="t-body font-bold text-white m-0">Notification Style</h3>
          </div>
          <button type="button" onClick={onClose} className="ib ib-s rounded-full" aria-label="Close">
            <X className="i" aria-hidden />
          </button>
        </div>
        <p className="text-xs text-vault-400 mb-3">
          Choose how notifications for {partner.display_name} appear on your lock screen.
        </p>

        <div className="grid grid-cols-3 gap-1.5 p-1 bg-vault-950 border border-vault-800 rounded-xl" role="radiogroup" aria-label="Notification Style Options">
          <button
            type="button"
            role="radio"
            aria-checked={notificationMode === 'default'}
            onClick={() => handleModeChange('default')}
            className={`py-1.5 rounded-lg text-xs font-semibold text-center transition-all cursor-pointer ${
              notificationMode === 'default' ? 'bg-emerald text-[#04120C] shadow-sm font-bold' : 'text-vault-400 hover:text-white'
            }`}
          >
            Default
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={notificationMode === 'custom'}
            onClick={() => handleModeChange('custom')}
            className={`py-1.5 rounded-lg text-xs font-semibold text-center transition-all cursor-pointer ${
              notificationMode === 'custom' ? 'bg-emerald text-[#04120C] shadow-sm font-bold' : 'text-vault-400 hover:text-white'
            }`}
          >
            Custom
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={notificationMode === 'silent'}
            onClick={() => handleModeChange('silent')}
            className={`py-1.5 rounded-lg text-xs font-semibold text-center transition-all cursor-pointer ${
              notificationMode === 'silent' ? 'bg-vault-700 text-white shadow-sm font-bold' : 'text-vault-400 hover:text-white'
            }`}
          >
            Silent
          </button>
        </div>

        {notificationMode === 'custom' && (
          <div className="flex flex-col gap-2.5 pt-3 anim-fade">
            <div className="field">
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="custom-phrase-input" className="lab text-xs font-medium text-vault-200">
                  Custom Notification Text
                </label>
                <span className={`text-[10px] font-mono ${customPhrase.length > 55 ? 'text-amber-400' : 'text-vault-500'}`}>
                  {customPhrase.length}/60
                </span>
              </div>
              <input
                id="custom-phrase-input"
                type="text"
                maxLength={60}
                value={customPhrase}
                onChange={e => { setCustomPhrase(e.target.value); setPhraseError(null); }}
                onBlur={() => handleSavePreferences('custom', customPhrase, customSound)}
                placeholder="e.g. 🏆 New high score unlocked!"
                className={`inp text-xs py-2 ${phraseError ? 'inp-err' : ''}`}
              />
              {phraseError && <p className="t-err text-[11px] mt-1">{phraseError}</p>}
            </div>

            <div className="flex flex-wrap gap-1">
              {PRESET_PHRASES.map(phrase => (
                <button
                  key={phrase}
                  type="button"
                  onClick={() => { setCustomPhrase(phrase); void handleSavePreferences('custom', phrase, customSound); }}
                  className="chip !text-[10px] !py-0.5 !px-2 hover:!border-emerald hover:!text-white transition-colors"
                >
                  <Sparkles className="w-2.5 h-2.5 text-emerald mr-1 shrink-0" />
                  <span className="truncate max-w-[130px]">{phrase}</span>
                </button>
              ))}
            </div>

            <div className="field">
              <label htmlFor="sound-select" className="lab text-xs font-medium text-vault-200 mb-1 flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-vault-400" />
                <span>Notification Sound</span>
              </label>
              <select
                id="sound-select"
                value={customSound}
                onChange={e => { setCustomSound(e.target.value); void handleSavePreferences('custom', customPhrase, e.target.value); }}
                className="bg-vault-950 text-xs font-medium text-vault-100 px-3 py-2 rounded-xl border border-vault-750 focus:outline-none focus:border-emerald w-full"
              >
                {NOTIFICATION_SOUND_OPTIONS.map(opt => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="mt-3 p-2.5 rounded-xl bg-vault-950/90 border border-vault-800 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-vault-500 font-mono">
            <span className="flex items-center gap-1">
              <span>🎮</span>
              <span>{preferences.custom_app_name || 'Games'} • lock screen preview</span>
            </span>
            <span>now</span>
          </div>
          <p className="text-xs font-bold text-white m-0 leading-tight truncate">{previewTitle}</p>
          {notificationMode !== 'silent' && (
            <p className="text-[11px] text-vault-400 m-0 leading-tight">{disguisedBody(preferences.custom_app_name)}</p>
          )}
        </div>

        <div className="flex gap-2 pt-3">
          <button
            type="button"
            onClick={handleTestNotification}
            disabled={isTestingNotification}
            className="btn btn-s btn-sm flex-1 text-xs justify-center"
            title="Trigger a local notification to verify lock screen appearance"
          >
            <Send className="w-3.5 h-3.5 text-emerald" />
            <span>{isTestingNotification ? 'Sending...' : 'Test Notification'}</span>
          </button>
          {notificationMode === 'custom' && (
            <button
              type="button"
              onClick={() => handleSavePreferences('custom', customPhrase, customSound)}
              disabled={isSavingPref}
              className="btn btn-p btn-sm px-3 text-xs"
              title="Save custom disguise"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isSavingPref ? 'Saving' : 'Save'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
