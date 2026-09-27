import { resolveChatMediaUrl } from '../../lib/mediaUrls';
import { ChatImage } from '../common/ChatMedia';
import React, { useState, useEffect } from 'react';
import { ShieldCheck, Copy, Image as ImageIcon } from 'lucide-react';
import { UserProfile } from '../../types';
import { Avatar } from '../common/Avatar';
import { describePresence, usePresence } from '../../lib/presence';
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
  const partnerPresence = usePresence([partner.id])[partner.id];
  const presenceLabel = describePresence(partnerPresence, partner.last_login_at || partner.updated_at);
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

          // Only photos actually sent in this chat, by either of you. (It used to fall back to
          // your own private gallery, which showed unrelated personal photos here.)
          setSharedMedia((data ?? []).map(m => m.content.replace('[IMAGE]', '')));
        } else {
          const msgs = conversationId ? mockBackend.getMessages(conversationId) : [];
          const imgMsgs = msgs
            .filter(m => m.content.startsWith('[IMAGE]'))
            .map(m => m.content.replace('[IMAGE]', ''));

          setSharedMedia(imgMsgs);
        }
      } catch (err) {
        console.warn('Error loading shared media for dossier:', err);
      } finally {
        setLoadingMedia(false);
      }
    };

    void loadSharedMedia();
  }, [conversationId, partner.id]);

  const copyHandle = () => {
    const handle = partner.username ? `@${partner.username}` : `@${partner.uid?.toLowerCase() || 'peer'}`;
    navigator.clipboard.writeText(handle);
    showToast(`Handle ${handle} copied`, 'success');
  };

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
            online={partnerPresence?.isOnline ?? false}
          />
        </div>

        <h2 className="t-h3 font-bold text-white mt-3 mb-0.5 truncate max-w-[280px]">
          {partner.display_name}
        </h2>

        <p className="t-sm c2 font-mono m-0">
          @{partner.username || partner.uid?.toLowerCase() || 'peer'}
        </p>

        {/* Username Chip */}
        <button
          type="button"
          onClick={copyHandle}
          title="Click to copy handle"
          aria-label={`Handle @${partner.username || partner.uid?.toLowerCase() || 'peer'}, click to copy`}
          className="tag tag-em font-mono mt-2 gap-1.5 cursor-pointer hover:opacity-90 active:scale-98 transition-all"
        >
          <ShieldCheck className="w-3.5 h-3.5" aria-hidden />
          <span>@{partner.username || partner.uid?.toLowerCase() || 'peer'}</span>
          <Copy className="w-3 h-3 opacity-60" aria-hidden />
        </button>

        {/* Live Presence Status */}
        {presenceLabel && (
          <div className={`flex items-center gap-1.5 text-xs font-mono mt-2 ${partnerPresence?.isOnline ? 'text-emerald' : 'text-vault-400'}`}>
            <span className={`w-2 h-2 rounded-full ${partnerPresence?.isOnline ? 'bg-emerald animate-pulse' : 'bg-vault-600'}`} />
            <span>{presenceLabel}</span>
          </div>
        )}
      </div>

      {/* 2. SHARED MEDIA — only what the two of you have actually sent in this chat. Tap to open. */}
      <div className="flex flex-col gap-2 flex-1 mt-4">
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
              <button
                key={idx}
                type="button"
                onClick={() => void resolveChatMediaUrl(url).then(src => { if (src) onOpenMedia?.(src); })}
                className="aspect-square rounded-lg overflow-hidden bg-vault-950 border border-vault-800 cursor-pointer hover:border-emerald transition-colors p-0"
                aria-label="Open shared photo"
              >
                <ChatImage
                  url={url}
                  alt="Shared media"
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-150"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};
