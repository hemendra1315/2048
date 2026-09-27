import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  FolderLock,
  Download,
  ExternalLink,
  Play,
  Pause,
  X,
  Quote,
  Mic,
} from 'lucide-react';
import { SharedVaultItem, UserProfile } from '../../types';
import { listSharedVaultItems } from '../../lib/sharedVaultApi';
import { formatTimestamp } from '../../lib/utils';
import { Avatar } from '../common/Avatar';
import { ChatImage } from '../common/ChatMedia';
import { resolveChatMediaUrl } from '../../lib/mediaUrls';
import { useToast } from '../../context/ToastContext';
import { lightImpact } from '../../lib/haptics';

interface AdminSharedVaultDetailProps {
  conversationId: string;
  userA: UserProfile;
  userB: UserProfile;
  onBack: () => void;
  onGoToConversation?: (conversationId: string, messageId?: string) => void;
}

export const AdminSharedVaultDetail: React.FC<AdminSharedVaultDetailProps> = ({
  conversationId,
  userA,
  userB,
  onBack,
  onGoToConversation,
}) => {
  const { showToast } = useToast();
  const [items, setItems] = useState<SharedVaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'media' | 'audio' | 'text'>('all');
  const [activeViewerItem, setActiveViewerItem] = useState<SharedVaultItem | null>(null);

  // Audio Playback
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listSharedVaultItems(conversationId);
      setItems(data);
    } catch (err) {
      console.error('Failed to load shared vault:', err);
      showToast('Could not load vault items', 'error');
    } finally {
      setLoading(false);
    }
  }, [conversationId, showToast]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const handleDownload = async (item: SharedVaultItem) => {
    try {
      const resolved = (await resolveChatMediaUrl(item.media_url)) || item.media_url;
      const res = await fetch(resolved);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const ext = item.media_type === 'audio' ? 'webm' : 'jpg';
      a.download = `admin-vault-${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      const fallback = (await resolveChatMediaUrl(item.media_url)) || item.media_url;
      window.open(fallback, '_blank');
    }
  };

  const handleToggleAudio = async (e: React.MouseEvent, item: SharedVaultItem) => {
    e.stopPropagation();
    lightImpact();
    if (playingAudioId === item.id) {
      if (audioRef.current) audioRef.current.pause();
      setPlayingAudioId(null);
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    const resolvedUrl = (await resolveChatMediaUrl(item.media_url)) || item.media_url;
    const audio = new Audio(resolvedUrl);
    audioRef.current = audio;
    setPlayingAudioId(item.id);
    audio.onended = () => setPlayingAudioId(null);
    audio.onerror = () => {
      showToast('Audio playback failed', 'error');
      setPlayingAudioId(null);
    };
    void audio.play();
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  const filteredItems = items.filter(i => {
    if (activeTab === 'media') return i.media_type === 'image' || i.media_type === 'video';
    if (activeTab === 'audio') return i.media_type === 'audio';
    if (activeTab === 'text') return i.media_type === 'text_memory';
    return true;
  });

  return (
    <div className="space-y-4 animate-fade-in pb-12">
      {/* Header bar */}
      <div className="p-4 bg-vault-900 border border-vault-800 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-xl bg-vault-950 hover:bg-vault-800 text-vault-300 hover:text-white border border-vault-800 transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center -space-x-3">
            <Avatar name={userA.display_name} seed={userA.uid} src={userA.avatar_url} size={40} />
            <Avatar name={userB.display_name} seed={userB.uid} src={userB.avatar_url} size={40} />
          </div>

          <div>
            <h2 className="text-base font-bold text-white m-0 flex items-center gap-2">
              <span>{userA.display_name}</span>
              <span className="text-purple-400 font-mono">⟷</span>
              <span>{userB.display_name}</span>
            </h2>
            <p className="text-xs text-vault-400 font-mono m-0 mt-0.5">
              Shared Vault Archive · {items.length} Total Keepsakes
            </p>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center bg-vault-950 border border-vault-800 p-1 rounded-xl shrink-0 overflow-x-auto">
          {(
            [
              { id: 'all', label: `All (${items.length})` },
              { id: 'media', label: `Photos & Videos (${items.filter(i => i.media_type === 'image' || i.media_type === 'video').length})` },
              { id: 'audio', label: `Audio (${items.filter(i => i.media_type === 'audio').length})` },
              { id: 'text', label: `Words (${items.filter(i => i.media_type === 'text_memory').length})` },
            ] as const
          ).map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                activeTab === tab.id
                  ? 'bg-vault-800 text-white shadow'
                  : 'text-vault-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Vault Items */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="aspect-square rounded-2xl bg-vault-900 animate-pulse border border-vault-800" />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p-12 text-center bg-vault-900 border border-vault-800 rounded-2xl flex flex-col items-center justify-center gap-2 text-vault-400 text-xs">
          <FolderLock className="w-8 h-8 text-vault-600 mb-1" />
          <p className="text-sm font-bold text-white m-0">No Vault Items Found</p>
          <p className="m-0">No items match the selected category in this shared vault.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filteredItems.map(item => {
            if (item.media_type === 'text_memory') {
              return (
                <div
                  key={item.id}
                  onClick={() => setActiveViewerItem(item)}
                  className="group relative p-3.5 aspect-square rounded-2xl bg-vault-900/90 hover:bg-vault-850 border border-purple-900/30 shadow-md flex flex-col justify-between cursor-pointer transition-all"
                >
                  <Quote className="w-4 h-4 text-purple-400 opacity-80" />
                  <p className="text-xs text-vault-200 line-clamp-4 font-serif italic m-0">
                    "{item.media_url}"
                  </p>
                  <span className="text-[10px] text-vault-500 font-mono">
                    {formatTimestamp(item.created_at)}
                  </span>
                </div>
              );
            }

            if (item.media_type === 'audio') {
              const isPlaying = playingAudioId === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => setActiveViewerItem(item)}
                  className="group relative p-3.5 aspect-square rounded-2xl bg-vault-900 hover:bg-vault-850 border border-emerald/20 shadow-md flex flex-col justify-between cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-1 text-[11px] font-mono text-emerald">
                    <Mic className="w-3.5 h-3.5" />
                    <span>Voice Note</span>
                  </div>
                  <div className="flex items-center justify-center my-auto">
                    <button
                      type="button"
                      onClick={e => handleToggleAudio(e, item)}
                      className="w-12 h-12 rounded-full bg-emerald text-vault-950 flex items-center justify-center shadow-lg active:scale-95 transition-transform"
                    >
                      {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                    </button>
                  </div>
                  <span className="text-[10px] text-vault-500 font-mono">
                    {formatTimestamp(item.created_at)}
                  </span>
                </div>
              );
            }

            return (
              <div
                key={item.id}
                onClick={() => setActiveViewerItem(item)}
                className="group relative aspect-square rounded-2xl overflow-hidden bg-vault-950 border border-vault-800 hover:border-purple-500/50 shadow-md cursor-pointer transition-all"
              >
                <ChatImage url={item.media_url} alt="Shared vault item" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2 pointer-events-none">
                  <span className="text-[10px] text-white/90 font-mono">
                    {new Date(item.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Media Viewer Modal */}
      {activeViewerItem && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setActiveViewerItem(null)}
        >
          <div
            className="relative max-w-2xl w-full bg-vault-900 border border-vault-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-3.5 bg-vault-950 border-b border-vault-800 flex items-center justify-between">
              <span className="text-xs font-mono text-vault-400">
                {new Date(activeViewerItem.created_at).toLocaleString()} · Shared Memory
              </span>
              <button
                type="button"
                onClick={() => setActiveViewerItem(null)}
                className="p-1.5 rounded-xl bg-vault-900 hover:bg-vault-800 text-vault-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 bg-black flex items-center justify-center p-2 overflow-hidden min-h-[300px]">
              {activeViewerItem.media_type === 'text_memory' ? (
                <div className="p-6 text-center space-y-3 max-w-md">
                  <Quote className="w-8 h-8 text-purple-400 mx-auto opacity-80" />
                  <p className="text-base text-white font-serif italic leading-relaxed m-0">
                    "{activeViewerItem.media_url}"
                  </p>
                </div>
              ) : (
                <ChatImage
                  url={activeViewerItem.media_url}
                  allowFullscreen
                  alt="Preview"
                  className="max-h-[60vh] max-w-full object-contain rounded-lg"
                />
              )}
            </div>

            <div className="p-4 bg-vault-950 border-t border-vault-800 flex items-center justify-end gap-3">
              {activeViewerItem.message_id && onGoToConversation && (
                <button
                  type="button"
                  onClick={() => {
                    onGoToConversation(conversationId, activeViewerItem.message_id!);
                    setActiveViewerItem(null);
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 font-bold text-xs shadow transition-colors active:scale-95"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Go To Conversation</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => handleDownload(activeViewerItem)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold text-xs shadow-lg transition-transform active:scale-95"
              >
                <Download className="w-4 h-4" />
                <span>Download</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
