import React from 'react';
import { CheckCheck, Check, Play, Pause } from 'lucide-react';
import { MessageItem } from '../../../types';
import { formatTimestamp, handleImageError } from '../../../lib/utils';

interface MessageBubbleProps {
  msg: MessageItem;
  isMe: boolean;
  onOpenMedia?: (url: string) => void;
  playingAudioId: string | null;
  setPlayingAudioId: (id: string | null) => void;
  onPlayAudio: (audioUrl: string, msgId: string) => void;
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
  onOpenMedia,
  playingAudioId,
  setPlayingAudioId,
  onPlayAudio,
}) => {
  const isImage = msg.content.startsWith('[IMAGE]');
  const isVoice = msg.content.startsWith('[VOICE_NOTE');
  const isSticker = msg.content.startsWith('[STICKER]');
  const voiceMatch = msg.content.match(/^\[VOICE_NOTE:(.*?)\](.*)$/);
  const voiceDuration = voiceMatch ? voiceMatch[1] : '0:14';
  const voiceDataUrl = voiceMatch ? voiceMatch[2] : '';

  if (isSticker) {
    return (
      <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-fade-in`}>
        <span className="text-5xl leading-none">{msg.content.replace('[STICKER]', '')}</span>
        <div className="flex items-center gap-1 text-[10px] text-zinc-500 mt-1 px-1">
          <span>{formatTimestamp(msg.created_at)}</span>
          <ReadReceipt isMe={isMe} isRead={msg.is_read} />
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-fade-in`}>
      <div
        className={`max-w-[85%] sm:max-w-[70%] rounded-2xl text-sm leading-relaxed ${
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

      {/* Meta info / Read receipt */}
      <div className="flex items-center gap-1 text-[10px] text-zinc-500 mt-1 px-1">
        <span>{formatTimestamp(msg.created_at)}</span>
        <ReadReceipt isMe={isMe} isRead={msg.is_read} />
      </div>
    </div>
  );
};
