import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, MessageSquare, Image as ImageIcon, Download, ExternalLink, X, Loader2 } from 'lucide-react';
import { UserProfile, ConversationItem, MessageItem } from '../../types';
import { getUserConversationsForAdmin, getUserAllMediaForAdmin, UserMediaGridItem } from '../../lib/adminApi';
import { formatTimestamp } from '../../lib/utils';
import { Avatar } from '../common/Avatar';
import { ConversationViewer } from './ConversationViewer';
import { readableMessagePreview } from '../../lib/chatExtras';

interface UserDetailViewProps {
  user: UserProfile;
  onBack: () => void;
  initialTab?: 'dms' | 'gallery';
  initialConversationId?: string;
  initialHighlightMessageId?: string;
}

export const UserDetailView: React.FC<UserDetailViewProps> = ({
  user,
  onBack,
  initialTab = 'dms',
  initialConversationId,
  initialHighlightMessageId,
}) => {
  const [activeTab, setActiveTab] = useState<'dms' | 'gallery'>(initialTab);
  
  // DMs State
  const [conversations, setConversations] = useState<
    (ConversationItem & { partnerProfile: UserProfile; messages: MessageItem[] })[]
  >([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [selectedConversation, setSelectedConversation] = useState<
    (ConversationItem & { partnerProfile: UserProfile; messages: MessageItem[] }) | null
  >(null);
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(initialHighlightMessageId || null);

  // Gallery State
  const [mediaItems, setMediaItems] = useState<UserMediaGridItem[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(true);
  const [activeMediaItem, setActiveMediaItem] = useState<UserMediaGridItem | null>(null);

  // Load Conversations for this user
  const loadConversations = useCallback(async () => {
    setLoadingConversations(true);
    try {
      const convs = await getUserConversationsForAdmin(user.id, user.id);
      setConversations(convs);

      // If deep linked to a conversation
      if (initialConversationId) {
        const found = convs.find(c => c.id === initialConversationId);
        if (found) {
          setSelectedConversation(found);
        }
      }
    } catch (err) {
      console.error('Failed to load user conversations:', err);
    } finally {
      setLoadingConversations(false);
    }
  }, [user.id, initialConversationId]);

  // Load All Media sent or received by this user
  const loadMedia = useCallback(async () => {
    setLoadingMedia(true);
    try {
      const items = await getUserAllMediaForAdmin(user.id);
      setMediaItems(items);
    } catch (err) {
      console.error('Failed to load user media:', err);
    } finally {
      setLoadingMedia(false);
    }
  }, [user.id]);

  useEffect(() => {
    void loadConversations();
    void loadMedia();
  }, [loadConversations, loadMedia]);

  // Handle "Go To Conversation" from Gallery Viewer
  const handleGoToConversation = (item: UserMediaGridItem) => {
    if (!item.conversation_id) return;
    const targetConv = conversations.find(c => c.id === item.conversation_id);
    if (targetConv) {
      setSelectedConversation(targetConv);
      setHighlightMessageId(item.message_id || null);
      setActiveTab('dms');
      setActiveMediaItem(null);
    }
  };

  // Handle direct file download
  const handleDownloadMedia = async (url: string, filename = 'media-download') => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const ext = blob.type.split('/')[1] || 'jpg';
      a.download = `${filename}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      // Fallback
      window.open(url, '_blank');
    }
  };

  return (
    <div className="space-y-4 animate-fade-in pb-12">
      {/* Header with Back Button and User summary */}
      <div className="p-4 bg-vault-900 border border-vault-800 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-xl bg-vault-950 hover:bg-vault-800 text-vault-300 hover:text-white border border-vault-800 transition-colors"
            aria-label="Back to Users list"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <Avatar
            name={user.display_name}
            seed={user.uid}
            src={user.avatar_url}
            size={48}
          />

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white m-0">{user.display_name}</h2>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                user.gender === 'Female'
                  ? 'bg-pink-950/50 text-pink-300 border-pink-700/50'
                  : 'bg-cyan-950/50 text-cyan-300 border-cyan-700/50'
              }`}>
                {user.gender || 'Male'}
              </span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                user.status === 'banned'
                  ? 'bg-rose-950/50 text-rose-300 border-rose-700/50'
                  : user.status === 'suspended'
                  ? 'bg-amber-950/50 text-amber-300 border-amber-700/50'
                  : 'bg-emerald-950/50 text-emerald-300 border-emerald-700/50'
              }`}>
                {user.status.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-vault-400 font-mono m-0 mt-0.5">
              @{user.username || user.uid}
            </p>
          </div>
        </div>

        {/* 2-Section Tabs: DMs and Gallery */}
        <div className="flex items-center bg-vault-950 border border-vault-800 p-1 rounded-xl self-stretch sm:self-auto">
          <button
            type="button"
            onClick={() => {
              setActiveTab('dms');
              setSelectedConversation(null);
            }}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'dms'
                ? 'bg-vault-800 text-white shadow'
                : 'text-vault-400 hover:text-vault-200'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>DMs ({conversations.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('gallery')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'gallery'
                ? 'bg-vault-800 text-white shadow'
                : 'text-vault-400 hover:text-vault-200'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            <span>Gallery ({mediaItems.length})</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: DMs */}
      {activeTab === 'dms' && (
        <div>
          {selectedConversation ? (
            <ConversationViewer
              conversationId={selectedConversation.id}
              partnerProfile={selectedConversation.partnerProfile}
              currentUserProfile={user}
              messages={selectedConversation.messages}
              highlightMessageId={highlightMessageId}
              onBack={() => {
                setSelectedConversation(null);
                setHighlightMessageId(null);
              }}
            />
          ) : (
            <div className="bg-vault-900 border border-vault-800 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-vault-800 bg-vault-900/80">
                <h3 className="text-sm font-bold text-white m-0">All Conversations</h3>
                <p className="text-xs text-vault-400 mt-0.5 m-0">Click any conversation to open its read-only transcript.</p>
              </div>

              {loadingConversations ? (
                <div className="p-8 flex items-center justify-center gap-2 text-vault-400 text-xs">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading conversations…</span>
                </div>
              ) : conversations.length === 0 ? (
                <div className="p-12 text-center text-vault-400 text-xs">
                  No conversations found for this user.
                </div>
              ) : (
                <div className="divide-y divide-vault-800/60">
                  {conversations.map(conv => {
                    const lastMsg = conv.messages[conv.messages.length - 1];
                    const partner = conv.partnerProfile;

                    return (
                      <button
                        key={conv.id}
                        type="button"
                        onClick={() => {
                          setSelectedConversation(conv);
                          setHighlightMessageId(null);
                        }}
                        className="w-full text-left p-4 hover:bg-vault-800/50 transition-colors flex items-center justify-between gap-3 group"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <Avatar
                            name={partner.display_name}
                            seed={partner.uid}
                            src={partner.avatar_url}
                            size={40}
                          />
                          <div className="min-w-0">
                            <h4 className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors truncate m-0">
                              {partner.display_name}
                            </h4>
                            <p className="text-xs text-vault-400 truncate m-0 mt-0.5 font-mono">
                              @{partner.username || partner.uid}
                            </p>
                            {lastMsg && (
                              <p className="text-xs text-vault-500 truncate m-0 mt-1 max-w-md">
                                {readableMessagePreview(lastMsg.content)}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          {lastMsg && (
                            <span className="text-[11px] text-vault-500 font-mono">
                              {formatTimestamp(lastMsg.created_at)}
                            </span>
                          )}
                          <div className="text-[11px] text-purple-400 mt-1 font-semibold group-hover:translate-x-0.5 transition-transform">
                            {conv.messages.length} messages →
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: GALLERY */}
      {activeTab === 'gallery' && (
        <div>
          {loadingMedia ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <div key={i} className="aspect-square rounded-2xl bg-vault-900 animate-pulse border border-vault-800" />
              ))}
            </div>
          ) : mediaItems.length === 0 ? (
            <div className="p-12 text-center bg-vault-900 border border-vault-800 rounded-2xl flex flex-col items-center justify-center gap-2 text-vault-400 text-xs">
              <ImageIcon className="w-8 h-8 text-vault-600 mb-1" />
              <p className="text-sm font-bold text-white m-0">No Media Found</p>
              <p className="m-0">No media sent or received by this user.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {mediaItems.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveMediaItem(item)}
                  className="group relative aspect-square rounded-2xl overflow-hidden bg-vault-950 border border-vault-800 hover:border-purple-500/50 shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <img
                    src={item.image_url}
                    alt="User media"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                    <span className="text-[10px] text-white/90 font-mono">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* GALLERY MEDIA VIEWER MODAL (ONLY Download and Go To Conversation buttons) */}
      {activeMediaItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Media details viewer"
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setActiveMediaItem(null)}
        >
          <div
            className="relative max-w-2xl w-full bg-vault-900 border border-vault-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Header bar */}
            <div className="p-3.5 bg-vault-950 border-b border-vault-800 flex items-center justify-between">
              <span className="text-xs font-mono text-vault-400">
                {new Date(activeMediaItem.created_at).toLocaleString()}
              </span>
              <button
                type="button"
                onClick={() => setActiveMediaItem(null)}
                className="p-1.5 rounded-xl bg-vault-900 hover:bg-vault-800 text-vault-400 hover:text-white transition-colors"
                aria-label="Close viewer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Media Image Content */}
            <div className="flex-1 bg-black flex items-center justify-center p-2 overflow-hidden min-h-[300px]">
              <img
                src={activeMediaItem.image_url}
                alt="Media preview"
                className="max-h-[60vh] max-w-full object-contain rounded-lg"
              />
            </div>

            {/* Footer with ONLY Download and Go To Conversation buttons */}
            <div className="p-4 bg-vault-950 border-t border-vault-800 flex items-center justify-end gap-3">
              {activeMediaItem.conversation_id && (
                <button
                  type="button"
                  onClick={() => handleGoToConversation(activeMediaItem)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 font-bold text-xs shadow transition-colors active:scale-95"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Go To Conversation</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => handleDownloadMedia(activeMediaItem.image_url, `user-${user.username || user.uid}-media`)}
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
