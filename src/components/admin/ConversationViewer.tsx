import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Lock,
  Edit2,
  Trash2,
  Check,
  Play,
  Pause,
  Loader2,
} from 'lucide-react';
import { MessageItem, UserProfile } from '../../types';
import { formatTimestamp } from '../../lib/utils';
import { Avatar } from '../common/Avatar';
import { readableMessagePreview, parseVoiceNote } from '../../lib/chatExtras';
import { ChatImage } from '../common/ChatMedia';
import { editMessageAsAdmin, deleteMessageAsAdmin } from '../../lib/adminApi';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { lightImpact, mediumImpact } from '../../lib/haptics';
import { resolveChatMediaUrl } from '../../lib/mediaUrls';

interface ConversationViewerProps {
  conversationId: string;
  partnerProfile: UserProfile;
  currentUserProfile: UserProfile;
  messages: MessageItem[];
  highlightMessageId?: string | null;
  onBack: () => void;
}

export const ConversationViewer: React.FC<ConversationViewerProps> = ({
  conversationId,
  partnerProfile,
  currentUserProfile,
  messages: initialMessages,
  highlightMessageId,
  onBack,
}) => {
  const { user: currentAdmin } = useAuth();
  const { showToast } = useToast();
  const [messages, setMessages] = useState<MessageItem[]>(initialMessages);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Audio Playback State
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState(0);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (highlightMessageId) {
        const el = document.getElementById(`admin-msg-${highlightMessageId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('ring-2', 'ring-purple-500', 'bg-purple-950/40');
          setTimeout(() => {
            el.classList.remove('ring-2', 'ring-purple-500', 'bg-purple-950/40');
          }, 3000);
          return;
        }
      }
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [messages.length, highlightMessageId]);

  // Handle Editing
  const startEditing = (msg: MessageItem) => {
    lightImpact();
    setEditingMessageId(msg.id);
    setEditingContent(msg.content);
  };

  const handleSaveEdit = async (msgId: string) => {
    if (!currentAdmin || !editingContent.trim()) return;
    setSavingEdit(true);
    lightImpact();
    try {
      await editMessageAsAdmin(currentAdmin.id, msgId, editingContent.trim(), conversationId);
      setMessages(prev =>
        prev.map(m => (m.id === msgId ? { ...m, content: editingContent.trim() } : m))
      );
      setEditingMessageId(null);
      showToast('Message text updated successfully', 'success');
    } catch (err) {
      console.error('Failed to edit message:', err);
      showToast('Failed to edit message', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  // Handle Deletion
  const handleDeleteMessage = async (msgId: string) => {
    if (!currentAdmin) return;
    if (!window.confirm('Delete this message permanently from the database?')) return;

    setDeletingId(msgId);
    mediumImpact();
    try {
      await deleteMessageAsAdmin(currentAdmin.id, msgId, conversationId);
      setMessages(prev => prev.filter(m => m.id !== msgId));
      showToast('Message deleted permanently', 'info');
    } catch (err) {
      console.error('Failed to delete message:', err);
      showToast('Failed to delete message', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // Handle Voice Audio Playback
  const handleToggleAudio = async (msgId: string, rawUrl: string) => {
    lightImpact();
    if (playingAudioId === msgId) {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
      }
      setPlayingAudioId(null);
      return;
    }

    if (audioElementRef.current) {
      audioElementRef.current.pause();
    }

    const resolvedUrl = (await resolveChatMediaUrl(rawUrl)) || rawUrl;
    const audio = new Audio(resolvedUrl);
    audioElementRef.current = audio;
    setPlayingAudioId(msgId);
    setAudioProgress(0);

    audio.ontimeupdate = () => {
      if (audio.duration) {
        setAudioProgress(audio.currentTime / audio.duration);
      }
    };

    audio.onended = () => {
      setPlayingAudioId(null);
      setAudioProgress(0);
    };

    audio.onerror = () => {
      showToast('Failed to play audio note', 'error');
      setPlayingAudioId(null);
      setAudioProgress(0);
    };

    void audio.play();
  };

  useEffect(() => {
    return () => {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-[#050505] text-vault-100 flex flex-col h-full w-full animate-fade-in select-none">
      {/* Immersive Full-Screen DM Header */}
      <header className="px-4 py-3 bg-vault-950/95 backdrop-blur-md border-b border-vault-800 flex items-center justify-between shrink-0 shadow-lg">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-xl bg-vault-900 hover:bg-vault-800 text-vault-300 hover:text-white border border-vault-800 transition-colors"
            aria-label="Back to conversations list"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <Avatar
            name={partnerProfile.display_name}
            seed={partnerProfile.uid}
            src={partnerProfile.avatar_url}
            size={40}
          />

          <div>
            <h2 className="text-sm font-bold text-white m-0 truncate">
              {partnerProfile.display_name}
            </h2>
            <p className="text-[11px] text-vault-400 font-mono m-0">
              @{partnerProfile.username || partnerProfile.uid} · Full DM Inspection
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-vault-400 px-3 py-1 rounded-full bg-vault-900 border border-vault-800">
            <Lock className="w-3.5 h-3.5 text-emerald" />
            <span>Admin Console</span>
          </div>
        </div>
      </header>

      {/* Message Stream */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-3.5 bg-[#060606]"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-xs text-vault-500 gap-2">
            <Lock className="w-8 h-8 text-vault-600 mb-1" />
            <span className="font-bold text-white text-sm">No Messages</span>
            <p className="text-vault-400 m-0 max-w-xs">
              No recorded chat transcript exists for this conversation yet.
            </p>
          </div>
        ) : (
          messages.map(msg => {
            const isMe = msg.sender_id === currentUserProfile.id;
            const isHighlighted = msg.id === highlightMessageId;
            const voice = parseVoiceNote(msg.content);
            const isVoice = Boolean(voice);
            const isImage =
              !isVoice &&
              (msg.content.startsWith('[IMAGE') ||
                msg.content.includes('[IMAGE') ||
                msg.content.startsWith('data:image/'));

            const imageUrl = isImage
              ? msg.content.replace(
                  /^\[(IMAGE:VIEW_ONCE|IMAGE:view_once|IMAGE:ALLOW_REPLAY|IMAGE:SPOILER|IMAGE:spoiler|IMAGE)\]/,
                  ''
                )
              : '';

            const isEditing = editingMessageId === msg.id;
            const isDeleting = deletingId === msg.id;
            const isAudioPlaying = playingAudioId === msg.id;

            return (
              <div
                key={msg.id}
                id={`admin-msg-${msg.id}`}
                className={`group relative flex flex-col transition-all duration-300 rounded-2xl p-1.5 ${
                  isMe ? 'items-end' : 'items-start'
                } ${isHighlighted ? 'ring-2 ring-purple-500 bg-purple-950/40' : ''}`}
              >
                {/* Sender & Timestamp meta */}
                <div className="text-[10px] text-vault-400 font-mono mb-1 px-1 flex items-center gap-2">
                  <span>{isMe ? currentUserProfile.display_name : partnerProfile.display_name}</span>
                  <span>·</span>
                  <span>{formatTimestamp(msg.created_at)}</span>
                </div>

                {/* Message Bubble + Action Buttons */}
                <div className="flex items-center gap-2 max-w-[85%] sm:max-w-[75%]">
                  {/* Action controls (left if sender, right if partner) */}
                  {isMe && !isEditing && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shrink-0">
                      {!isImage && !isVoice && (
                        <button
                          type="button"
                          onClick={() => startEditing(msg)}
                          className="p-1.5 rounded-lg bg-vault-900 hover:bg-vault-800 text-vault-400 hover:text-white border border-vault-800 shadow"
                          title="Edit message text"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => handleDeleteMessage(msg.id)}
                        className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-400 hover:text-rose-200 border border-rose-800/50 shadow"
                        title="Delete message"
                      >
                        {isDeleting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  )}

                  <div
                    className={`rounded-2xl px-4 py-3 text-sm shadow-md ${
                      isMe
                        ? 'bg-gradient-to-br from-purple-600 to-pink-600 text-white rounded-br-sm'
                        : 'bg-vault-900 border border-vault-800 text-vault-100 rounded-bl-sm'
                    } ${isEditing ? 'w-full min-w-[280px]' : ''}`}
                  >
                    {/* INLINE EDIT MODE */}
                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          value={editingContent}
                          onChange={e => setEditingContent(e.target.value)}
                          className="w-full bg-vault-950 border border-vault-700 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-400 resize-none"
                          rows={3}
                          autoFocus
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingMessageId(null)}
                            className="px-2.5 py-1 rounded-lg bg-vault-800 text-vault-300 hover:text-white text-xs font-semibold"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={savingEdit}
                            onClick={() => handleSaveEdit(msg.id)}
                            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow"
                          >
                            {savingEdit ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            <span>Save</span>
                          </button>
                        </div>
                      </div>
                    ) : isVoice ? (
                      /* VOICE NOTE PLAYBACK */
                      <div className="flex items-center gap-3 min-w-[220px]">
                        <button
                          type="button"
                          onClick={() => handleToggleAudio(msg.id, voice?.url || '')}
                          className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${
                            isMe
                              ? 'bg-black/70 text-white border border-white/20'
                              : 'bg-emerald text-vault-950'
                          } active:scale-95 transition-transform shadow`}
                          aria-label={isAudioPlaying ? 'Pause audio note' : 'Play audio note'}
                        >
                          {isAudioPlaying ? (
                            <Pause className="w-4 h-4 fill-current" />
                          ) : (
                            <Play className="w-4 h-4 fill-current ml-0.5" />
                          )}
                        </button>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-1 h-6">
                            {(
                              voice?.levels ??
                              Array.from({ length: 24 }, (_, i) => 0.3 + 0.3 * Math.sin(i * 1.5))
                            ).map((_, i, all) => {
                              const played = isAudioPlaying && i / all.length < audioProgress;
                              return (
                                <span
                                  key={i}
                                  className={`flex-1 rounded-full transition-all ${
                                    isMe
                                      ? played
                                        ? 'bg-white h-5'
                                        : 'bg-white/40 h-2'
                                      : played
                                      ? 'bg-emerald h-5'
                                      : 'bg-vault-600 h-2'
                                  }`}
                                />
                              );
                            })}
                          </div>
                          <div className="flex justify-between text-[10px] font-mono opacity-80">
                            <span>{voice?.duration || '0:00'}</span>
                            {voice?.isViewOnce && <span>1 View Once</span>}
                          </div>
                        </div>
                      </div>
                    ) : isImage ? (
                      /* IMAGE ATTACHMENT */
                      <div className="space-y-1.5">
                        <div className="rounded-xl overflow-hidden max-h-72 max-w-full">
                          <ChatImage
                            url={imageUrl}
                            allowFullscreen
                            alt="Chat media"
                            className="rounded-xl max-h-72 max-w-full object-cover"
                          />
                        </div>
                        {msg.content.startsWith('[IMAGE:VIEW_ONCE]') && (
                          <span className="text-[10px] block opacity-80 font-mono">
                            1 View Once Photo
                          </span>
                        )}
                      </div>
                    ) : (
                      /* NORMAL TEXT MESSAGE */
                      <span className="whitespace-pre-wrap leading-relaxed">
                        {readableMessagePreview(msg.content)}
                      </span>
                    )}
                  </div>

                  {/* Action controls (right if partner) */}
                  {!isMe && !isEditing && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shrink-0">
                      {!isImage && !isVoice && (
                        <button
                          type="button"
                          onClick={() => startEditing(msg)}
                          className="p-1.5 rounded-lg bg-vault-900 hover:bg-vault-800 text-vault-400 hover:text-white border border-vault-800 shadow"
                          title="Edit message text"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => handleDeleteMessage(msg.id)}
                        className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-400 hover:text-rose-200 border border-rose-800/50 shadow"
                        title="Delete message"
                      >
                        {isDeleting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Bar Indicator */}
      <footer className="px-4 py-2.5 bg-vault-950/95 border-t border-vault-800 flex items-center justify-between text-xs text-vault-400">
        <span className="font-mono">Total {messages.length} messages</span>
        <span className="text-[11px] text-vault-500">
          Admin edit & delete permissions active
        </span>
      </footer>
    </div>
  );
};
