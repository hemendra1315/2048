import React, { useState, useRef } from 'react';
import { CheckCheck, Check, Play, Pause, Smile, CornerUpLeft, Pencil, Trash2 } from 'lucide-react';
import { MessageItem } from '../../../types';
import { formatTimestamp, handleImageError } from '../../../lib/utils';
import { ReactionPicker } from './ReactionPicker';

const EDIT_WINDOW_MS = 15 * 60 * 1000;

interface MessageBubbleProps {
  msg: MessageItem;
  isMe: boolean;
  currentUserId?: string;
  onOpenMedia?: (url: string) => void;
  playingAudioId: string | null;
  setPlayingAudioId: (id: string | null) => void;
  onPlayAudio: (audioUrl: string, msgId: string) => void;
  replyToMessage?: MessageItem;
  onReact: (emoji: string | null) => void;
  onReply: () => void;
  onEdit: () => void;
  onDeleteForEveryone: () => void;
}

const ReadReceipt: React.FC<{ isMe: boolean; isRead: boolean }> = ({ isMe, isRead }) =>
  isMe ? (
    isRead ? (
      <CheckCheck className="w-3.5 h-3.5 text-[#10B981]" />
    ) : (
      <Check className="w-3.5 h-3.5 text-zinc-500" />
    )
  ) : null;

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  msg,
  isMe,
  currentUserId,
  onOpenMedia,
  playingAudioId,
  setPlayingAudioId,
  onPlayAudio,
  replyToMessage,
  onReact,
  onReply,
  onEdit,
  onDeleteForEveryone,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const reactButtonRef = useRef<HTMLDivElement>(null);

  if (msg.content.startsWith('[SYSTEM:')) {
    return (
      <div className="flex justify-center">
        <span className="text-[10px] text-zinc-500 bg-[#111111] border border-[#262626] px-3 py-1 rounded-full">
          {msg.content.replace(/^\[SYSTEM:|\]$/g, '').replace(/:/g, ' • ')}
        </span>
      </div>
    );
  }

  if (msg.deleted_at) {
    return (
      <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
        <div className="px-3 py-2 rounded-2xl text-xs italic text-zinc-500 bg-[#111111] border border-[#262626]">
          This message was deleted
        </div>
      </div>
    );
  }

  const isImage = msg.content.startsWith('[IMAGE]');
  const isVoice = msg.content.startsWith('[VOICE_NOTE');
  const isSticker = msg.content.startsWith('[STICKER]');
  const voiceMatch = msg.content.match(/^\[VOICE_NOTE:(.*?)\](.*)$/);
  const voiceDuration = voiceMatch ? voiceMatch[1] : '0:14';
  const voiceDataUrl = voiceMatch ? voiceMatch[2] : '';

  const canModify = isMe && Date.now() - new Date(msg.created_at).getTime() < EDIT_WINDOW_MS;
  const myReaction = currentUserId ? msg.reactions?.find(r => r.user_id === currentUserId) : undefined;
  const reactionCounts = (msg.reactions ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
    return acc;
  }, {});

  const ActionBar = (
    <div
      className={`absolute top-0 ${
        isMe ? 'right-full mr-1' : 'left-full ml-1'
      } opacity-0 group-hover:opacity-100 flex items-center gap-0.5 bg-[#171717] border border-[#262626] rounded-full p-0.5 shadow-lg transition-opacity`}
    >
      <div className="relative" ref={reactButtonRef}>
        <button
          type="button"
          onClick={() => setPickerOpen(v => !v)}
          className="p-1.5 rounded-full hover:bg-[#222222] text-zinc-400 hover:text-white"
          title="React"
        >
          <Smile className="w-3.5 h-3.5" />
        </button>
        {pickerOpen && reactButtonRef.current && (
          <ReactionPicker
            anchorRect={reactButtonRef.current.getBoundingClientRect()}
            onPick={emoji => {
              onReact(myReaction?.emoji === emoji ? null : emoji);
              setPickerOpen(false);
            }}
          />
        )}
      </div>
      <button
        type="button"
        onClick={onReply}
        className="p-1.5 rounded-full hover:bg-[#222222] text-zinc-400 hover:text-white"
        title="Reply"
      >
        <CornerUpLeft className="w-3.5 h-3.5" />
      </button>
      {canModify && !isImage && !isVoice && !isSticker && (
        <button
          type="button"
          onClick={onEdit}
          className="p-1.5 rounded-full hover:bg-[#222222] text-zinc-400 hover:text-white"
          title="Edit"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}
      {canModify && (
        <button
          type="button"
          onClick={onDeleteForEveryone}
          className="p-1.5 rounded-full hover:bg-red-950 text-zinc-400 hover:text-red-400"
          title="Delete for everyone"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  if (isSticker) {
    return (
      <div className={`group flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-fade-in`}>
        <div className="relative">
          {ActionBar}
          <span className="text-5xl leading-none">{msg.content.replace('[STICKER]', '')}</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-zinc-500 mt-1 px-1">
          <span>{formatTimestamp(msg.created_at)}</span>
          <ReadReceipt isMe={isMe} isRead={msg.is_read} />
        </div>
      </div>
    );
  }

  return (
    <div className={`group flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-fade-in`}>
      <div className="relative max-w-[85%] sm:max-w-[70%]">
      {ActionBar}
      {replyToMessage && (
        <div
          className={`mb-0.5 px-2.5 py-1 rounded-lg text-[11px] border-l-2 ${
            isMe ? 'border-[#10B981]/60 bg-[#10B981]/10 text-emerald-200' : 'border-zinc-600 bg-[#171717] text-zinc-400'
          } truncate`}
        >
          {replyToMessage.deleted_at ? 'Deleted message' : replyToMessage.content.replace(/^\[(IMAGE|VOICE_NOTE[^\]]*|STICKER)\]/, 'Media')}
        </div>
      )}

      <div
        className={`rounded-2xl text-sm leading-relaxed ${
          isImage
            ? 'p-1'
            : `p-3 ${
                isMe
                  ? 'bg-[#10B981] text-black font-medium rounded-br-xs shadow-md'
                  : 'bg-[#171717] border border-[#262626] text-white rounded-bl-xs shadow-sm'
              }`
        }`}
      >
        {isImage ? (
          <div
            onClick={() => onOpenMedia && onOpenMedia(msg.content.replace('[IMAGE]', ''))}
            className="relative cursor-pointer rounded-lg overflow-hidden border border-white/10 max-w-[200px]"
          >
            <img
              src={msg.content.replace('[IMAGE]', '')}
              alt="Attachment"
              className="max-h-40 w-full object-cover"
              loading="lazy"
              onError={handleImageError}
            />
            <span className="absolute bottom-1 right-1.5 text-[10px] font-medium text-white bg-black/50 px-1.5 py-0.5 rounded-md">
              {formatTimestamp(msg.created_at)}
            </span>
          </div>
        ) : isVoice ? (
          <div className="flex items-center gap-3 min-w-[180px] py-1">
            <button
              onClick={() =>
                voiceDataUrl ? onPlayAudio(voiceDataUrl, msg.id) : setPlayingAudioId(playingAudioId === msg.id ? null : msg.id)
              }
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                isMe ? 'bg-black text-[#10B981]' : 'bg-[#10B981] text-black'
              } active:scale-90 transition-transform`}
            >
              {playingAudioId === msg.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>
            <div className="flex-1 space-y-1">
              <div className="h-2 rounded-full bg-black/20 overflow-hidden">
                <div
                  className={`h-full ${isMe ? 'bg-black' : 'bg-[#10B981]'} ${
                    playingAudioId === msg.id ? 'w-3/4 animate-pulse' : 'w-1/4'
                  }`}
                />
              </div>
              <span className={`text-[10px] font-mono ${isMe ? 'text-black/70' : 'text-zinc-400'}`}>
                Voice Note ({voiceDuration})
              </span>
            </div>
          </div>
        ) : (
          <span>{msg.content}</span>
        )}
      </div>
      </div>

      {Object.keys(reactionCounts).length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1 px-1">
          {Object.entries(reactionCounts).map(([emoji, count]) => (
            <button
              key={emoji}
              onClick={() => onReact(myReaction?.emoji === emoji ? null : emoji)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] border transition-colors ${
                myReaction?.emoji === emoji
                  ? 'bg-[#10B981]/20 border-[#10B981]/60 text-[#10B981]'
                  : 'bg-[#171717] border-[#262626] text-zinc-300 hover:border-zinc-500'
              }`}
            >
              <span>{emoji}</span>
              {count > 1 && <span>{count}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Meta info / Read receipt */}
      <div className="flex items-center gap-1 text-[10px] text-zinc-500 mt-1 px-1">
        <span>{formatTimestamp(msg.created_at)}</span>
        {msg.edited_at && <span className="italic">(edited)</span>}
        <ReadReceipt isMe={isMe} isRead={msg.is_read} />
      </div>
    </div>
  );
};
