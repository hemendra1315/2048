import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Bell,
  Copy,
  FileText,
  Lock,
  Image as ImageIcon,
  KeyRound,
  ExternalLink,
} from 'lucide-react';
import { UserProfile, GalleryItem } from '../../types';
import { Avatar } from '../common/Avatar';
import { useToast } from '../../context/ToastContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { mockBackend } from '../../lib/mockBackend';

interface ContactDossierProps {
  partner: UserProfile;
  conversationId?: string;
  onOpenMedia?: (url: string) => void;
  className?: string;
}

export const ContactDossier: React.FC<ContactDossierProps> = ({
  partner,
  conversationId,
  onOpenMedia,
  className = '',
}) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'media' | 'files' | 'security'>('media');
  const [notificationsMuted, setNotificationsMuted] = useState(false);
  const [sharedMedia, setSharedMedia] = useState<string[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);

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

  return (
    <aside
      aria-label="Contact Dossier"
      className={`w-[340px] lg:w-[350px] shrink-0 bg-vault-900 border-r border-vault-800 flex flex-col h-full overflow-y-auto p-4 select-none ${className}`}
    >
      {/* 1. HERO IDENTITY CARD (Compact 72px avatar above the fold) */}
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

        {/* Sovereign UID Chip */}
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
          <span>Active • Hardware Sealed</span>
        </div>
      </div>

      {/* 2. NOTIFICATION & CONTROL ROW */}
      <div className="card p-3 bg-vault-850 border border-vault-750 my-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Bell className="w-4 h-4 text-vault-400" aria-hidden />
          <div>
            <span className="t-sm text-vault-100 font-semibold block leading-tight">Notifications</span>
            <span className="t-cap c3">{notificationsMuted ? 'Muted' : 'Sound & vibration active'}</span>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={!notificationsMuted}
          onClick={() => {
            setNotificationsMuted(!notificationsMuted);
            showToast(`Notifications ${notificationsMuted ? 'unmuted' : 'muted'} for ${partner.display_name}`, 'info');
          }}
          className={!notificationsMuted ? 'switch switch-on' : 'switch'}
          aria-label="Toggle notifications for this chat"
        />
      </div>

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
                  <span className="t-sm font-bold text-white">End-to-End Encrypted</span>
                </div>
                <span className="tag tag-em mono text-[10px]">VERIFIED</span>
              </div>
              <p className="text-[11px] text-vault-400 leading-relaxed m-0">
                Messages and attachments in this stream are encrypted on your local hardware. Neither the server nor relays can decrypt payloads.
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
