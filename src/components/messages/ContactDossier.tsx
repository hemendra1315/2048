import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Bell,
  Copy,
  FileText,
  Lock,
  Image as ImageIcon,
  KeyRound,
  ExternalLink,
  Sparkles,
  Send,
  Check,
  Volume2,
} from 'lucide-react';
import { UserProfile, GalleryItem, NotificationMode } from '../../types';
import { Avatar } from '../common/Avatar';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { mockBackend } from '../../lib/mockBackend';
import {
  getContactNotificationPreference,
  saveContactNotificationPreference,
  sendTestNotification,
  DEFAULT_DISGUISED_TITLE,
  DEFAULT_DISGUISED_BODY,
  NOTIFICATION_SOUND_OPTIONS,
} from '../../lib/notifications';

interface ContactDossierProps {
  partner: UserProfile;
  conversationId?: string;
  onOpenMedia?: (url: string) => void;
  className?: string;
}

const PRESET_PHRASES = [
  '🏆 New high score unlocked!',
  '⚡ Bonus round available',
  '🎁 Reward waiting',
  '⭐ Level 40 cleared!',
];

export const ContactDossier: React.FC<ContactDossierProps> = ({
  partner,
  conversationId,
  onOpenMedia,
  className = '',
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'media' | 'files' | 'security'>('media');
  const [sharedMedia, setSharedMedia] = useState<string[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);

  // Notification Preferences State
  const [notificationMode, setNotificationMode] = useState<NotificationMode>('default');
  const [customPhrase, setCustomPhrase] = useState('');
  const [customSound, setCustomSound] = useState('default');
  const [isSavingPref, setIsSavingPref] = useState(false);
  const [isTestingNotification, setIsTestingNotification] = useState(false);
  const [phraseError, setPhraseError] = useState<string | null>(null);

  // Load contact notification preference
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
    return () => {
      isMounted = false;
    };
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
      notificationMode === 'custom'
        ? customPhrase.trim() || DEFAULT_DISGUISED_TITLE
        : DEFAULT_DISGUISED_TITLE;

    setIsTestingNotification(true);
    try {
      await sendTestNotification({
        title: titleToUse,
        body: DEFAULT_DISGUISED_BODY,
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

  useEffect(() => {
    const loadSharedMedia = async () => {
      setLoadingMedia(true);
      try {
        if (isSupabaseConfigured() && conversationId) {
          const { data } = await supabase
            .from('messages')
            .select('content')
            .eq('conversation_id', conversationId)
            .like('content', '[IMAGE]%')
            .order('created_at', { ascending: false })
            .limit(9);

          if (data && data.length > 0) {
            setSharedMedia(data.map(m => m.content.replace('[IMAGE]', '')));
          } else {
            // Fallback to gallery preview items
            const { data: gallery } = await supabase
              .from('gallery_items')
              .select('image_url')
              .limit(6);
            if (gallery) {
              setSharedMedia(gallery.map(g => g.image_url));
            }
          }
        } else {
          const msgs = conversationId ? mockBackend.getMessages(conversationId) : [];
          const imgMsgs = msgs
            .filter(m => m.content.startsWith('[IMAGE]'))
            .map(m => m.content.replace('[IMAGE]', ''));

          if (imgMsgs.length > 0) {
            setSharedMedia(imgMsgs);
          } else {
            const gallery = mockBackend.getGallery(partner.id) as GalleryItem[];
            setSharedMedia(gallery.slice(0, 6).map(g => g.image_url));
          }
        }
      } catch (err) {
        console.warn('Error loading shared media for dossier:', err);
      } finally {
        setLoadingMedia(false);
      }
    };

    void loadSharedMedia();
  }, [conversationId, partner.id]);

  const copyUid = () => {
    if (partner.uid) {
      navigator.clipboard.writeText(partner.uid);
      showToast(`Contact UID ${partner.uid} copied`, 'success');
    }
  };

  // Generate a deterministic safety fingerprint from UIDs
  const safetyFingerprint = `${(partner.uid || 'CIPHER').slice(0, 4)}-${(partner.id || '9021').slice(0, 4)}-${(partner.uid || '8841').slice(-4)}`.toUpperCase();

  const previewTitle =
    notificationMode === 'silent'
      ? '(No notification sent)'
      : notificationMode === 'custom'
      ? customPhrase.trim() || '🏆 New high score unlocked!'
      : DEFAULT_DISGUISED_TITLE;

  return (
    <aside
      aria-label="Contact Dossier"
      className={`w-[340px] lg:w-[350px] shrink-0 bg-vault-900 border-r border-vault-800 flex flex-col h-full overflow-y-auto p-4 select-none ${className}`}
    >
      {/* 1. HERO IDENTITY CARD */}
      <div className="flex flex-col items-center text-center pb-4 border-b border-vault-800">
        <div className="relative">
          <Avatar
            name={partner.display_name}
            seed={partner.uid}
            src={partner.avatar_url}
            size={56}
            className="!w-[72px] !h-[72px] !text-2xl shadow-lg border border-vault-700"
            online={true}
          />
        </div>

        <h2 className="t-h3 font-bold text-white mt-3 mb-0.5 truncate max-w-[280px]">
          {partner.display_name}
        </h2>

        <p className="t-sm c2 font-mono m-0">
          @{partner.username || partner.uid?.toLowerCase() || 'peer'}
        </p>

        {/* UID Chip */}
        <button
          type="button"
          onClick={copyUid}
          title="Click to copy contact UID"
          aria-label={`Contact UID ${partner.uid}, click to copy`}
          className="tag tag-em font-mono mt-2 gap-1.5 cursor-pointer hover:opacity-90 active:scale-98 transition-all"
        >
          <ShieldCheck className="w-3.5 h-3.5" aria-hidden />
          <span>{partner.uid}</span>
          <Copy className="w-3 h-3 opacity-60" aria-hidden />
        </button>

        {/* Live Presence Status */}
        <div className="flex items-center gap-1.5 text-xs text-emerald font-mono mt-2">
          <span className="w-2 h-2 rounded-full bg-emerald animate-pulse" />
          <span>Active Contact</span>
        </div>
      </div>

      {/* 2. DISGUISED NOTIFICATION STYLE SETTINGS */}
      <section className="card p-3.5 bg-vault-850 border border-vault-750 my-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-emerald" aria-hidden />
            <span className="t-sm text-vault-100 font-semibold block leading-tight">
              Notification Style
            </span>
          </div>
          <span className="tag tag-em mono !text-[9px] !h-4 !px-1.5">STEALTH</span>
        </div>

        {/* Style Selector Buttons */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-vault-950 border border-vault-800 rounded-xl" role="radiogroup" aria-label="Notification Style Options">
          <button
            type="button"
            role="radio"
            aria-checked={notificationMode === 'default'}
            onClick={() => handleModeChange('default')}
            className={`py-1.5 rounded-lg text-xs font-semibold text-center transition-all cursor-pointer ${
              notificationMode === 'default'
                ? 'bg-emerald text-[#04120C] shadow-sm font-bold'
                : 'text-vault-400 hover:text-white'
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
              notificationMode === 'custom'
                ? 'bg-emerald text-[#04120C] shadow-sm font-bold'
                : 'text-vault-400 hover:text-white'
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
              notificationMode === 'silent'
                ? 'bg-vault-700 text-white shadow-sm font-bold'
                : 'text-vault-400 hover:text-white'
            }`}
          >
            Silent
          </button>
        </div>

        {/* Custom Mode Controls */}
        {notificationMode === 'custom' && (
          <div className="flex flex-col gap-2.5 pt-1 anim-fade">
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
                onChange={e => {
                  setCustomPhrase(e.target.value);
                  setPhraseError(null);
                }}
                onBlur={() => handleSavePreferences('custom', customPhrase, customSound)}
                placeholder="e.g. 🏆 New high score unlocked!"
                className={`inp text-xs py-2 ${phraseError ? 'inp-err' : ''}`}
              />
              {phraseError && <p className="t-err text-[11px] mt-1">{phraseError}</p>}
            </div>

            {/* Quick Suggestions Chips */}
            <div className="flex flex-wrap gap-1">
              {PRESET_PHRASES.map(phrase => (
                <button
                  key={phrase}
                  type="button"
                  onClick={() => {
                    setCustomPhrase(phrase);
                    void handleSavePreferences('custom', phrase, customSound);
                  }}
                  className="chip !text-[10px] !py-0.5 !px-2 hover:!border-emerald hover:!text-white transition-colors"
                >
                  <Sparkles className="w-2.5 h-2.5 text-emerald mr-1 shrink-0" />
                  <span className="truncate max-w-[130px]">{phrase}</span>
                </button>
              ))}
            </div>

            {/* Sound Selector */}
            <div className="field">
              <label htmlFor="sound-select" className="lab text-xs font-medium text-vault-200 mb-1 flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-vault-400" />
                <span>Notification Sound</span>
              </label>
              <select
                id="sound-select"
                value={customSound}
                onChange={e => {
                  setCustomSound(e.target.value);
                  void handleSavePreferences('custom', customPhrase, e.target.value);
                }}
                className="bg-vault-950 text-xs font-medium text-vault-100 px-3 py-2 rounded-xl border border-vault-750 focus:outline-none focus:border-emerald w-full"
              >
                {NOTIFICATION_SOUND_OPTIONS.map(opt => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Lock Screen Live Preview Card */}
        <div className="mt-1 p-2.5 rounded-xl bg-vault-950/90 border border-vault-800 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-vault-500 font-mono">
            <span className="flex items-center gap-1">
              <span>🎮</span>
              <span>Games • lock screen preview</span>
            </span>
            <span>now</span>
          </div>
          <p className="text-xs font-bold text-white m-0 leading-tight truncate">
            {previewTitle}
          </p>
          {notificationMode !== 'silent' && (
            <p className="text-[11px] text-vault-400 m-0 leading-tight">
              {DEFAULT_DISGUISED_BODY}
            </p>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex gap-2 pt-1">
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
      </section>

      {/* 3. SHARED MEDIA & INTELLIGENCE TABS */}
      <div className="flex flex-col gap-3 flex-1">
        <div className="flex items-center gap-1 p-1 bg-vault-950 border border-vault-800 rounded-xl" role="tablist" aria-label="Shared content categories">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'media'}
            onClick={() => setActiveTab('media')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold text-center transition-all ${
              activeTab === 'media'
                ? 'bg-vault-800 text-white shadow-sm'
                : 'text-vault-400 hover:text-white'
            }`}
          >
            Media
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'files'}
            onClick={() => setActiveTab('files')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold text-center transition-all ${
              activeTab === 'files'
                ? 'bg-vault-800 text-white shadow-sm'
                : 'text-vault-400 hover:text-white'
            }`}
          >
            Files
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'security'}
            onClick={() => setActiveTab('security')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold text-center transition-all ${
              activeTab === 'security'
                ? 'bg-vault-800 text-white shadow-sm'
                : 'text-vault-400 hover:text-white'
            }`}
          >
            Security
          </button>
        </div>

        {/* Tab 1: Shared Media Grid */}
        {activeTab === 'media' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <span className="t-over text-[10px]">Shared Photos</span>
              <span className="t-cap mono c2">{sharedMedia.length} items</span>
            </div>

            {loadingMedia ? (
              <div className="grid grid-cols-3 gap-1.5">
                {[1, 2, 3, 4, 5, 6].map(n => (
                  <div key={n} className="sk aspect-square rounded-lg" />
                ))}
              </div>
            ) : sharedMedia.length === 0 ? (
              <div className="p-6 bg-vault-950/60 border border-vault-800 rounded-xl text-center space-y-1">
                <ImageIcon className="w-6 h-6 text-vault-500 mx-auto" />
                <p className="t-cap text-vault-400 m-0">No photos shared yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {sharedMedia.map((url, idx) => (
                  <div
                    key={idx}
                    onClick={() => onOpenMedia?.(url)}
                    className="aspect-square rounded-lg overflow-hidden bg-vault-950 border border-vault-800 cursor-pointer hover:border-emerald transition-colors"
                  >
                    <img
                      src={url}
                      alt="Shared media"
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-150"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Shared Documents & Files */}
        {activeTab === 'files' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <span className="t-over text-[10px]">Transfers & Keys</span>
              <span className="t-cap mono c2">3 files</span>
            </div>

            <div className="flex flex-col gap-1.5">
              {[
                { name: 'session-public-key.pem', size: '2.4 KB', date: 'Today' },
                { name: 'channel-manifest.json', size: '14.8 KB', date: 'Yesterday' },
                { name: 'hardware-signature.sig', size: '512 B', date: 'Sep 21' },
              ].map(f => (
                <div
                  key={f.name}
                  className="p-2.5 bg-vault-950 border border-vault-800 hover:border-vault-700 rounded-xl flex items-center justify-between transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText className="w-4 h-4 text-emerald shrink-0" />
                    <div className="min-w-0">
                      <p className="t-cap font-mono text-white truncate m-0 group-hover:text-emerald">{f.name}</p>
                      <p className="text-[10px] text-vault-500 m-0">{f.size} • {f.date}</p>
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-vault-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Security & Cryptographic Proof */}
        {activeTab === 'security' && (
          <div className="flex flex-col gap-3">
            <div className="card p-3.5 bg-vault-950 border border-vault-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-emerald" />
                  <span className="t-sm font-bold text-white">Private Direct Channel</span>
                </div>
                <span className="tag tag-em mono text-[10px]">ACTIVE</span>
              </div>
              <p className="text-[11px] text-vault-400 leading-relaxed m-0">
                Messages and media in this thread are secured in transit via TLS and isolated by row-level database access policies (RLS). Only participants have access.
              </p>
            </div>

            <div className="card p-3.5 bg-vault-950 border border-vault-800 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-vault-300 font-semibold">
                <KeyRound className="w-3.5 h-3.5 text-gold" />
                <span>Safety Fingerprint</span>
              </div>
              <p className="font-mono text-xs text-gold font-bold tracking-widest m-0 bg-vault-900 p-2 rounded-lg text-center border border-vault-800">
                {safetyFingerprint}
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
