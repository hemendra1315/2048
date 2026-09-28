import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Maximize2,
  Minimize2,
  Download,
  FolderHeart,
  ExternalLink,
  Trash2,
  RotateCcw,
  Calendar,
  Quote,
  Play,
  Pause,
  Folder,
  ChevronDown,
  Check,
  FileText,
  Link2,
} from 'lucide-react';
import { SharedVaultItem, SharedVaultAlbum, UserProfile } from '../../types';
import { lightImpact, mediumImpact, selectionChange } from '../../lib/haptics';
import { useToast } from '../../context/ToastContext';
import { cloneToPersonalVault, moveItemsToAlbum, deleteSharedVaultItem, softDeleteSharedVaultItem, restoreSharedVaultItem } from '../../lib/sharedVaultApi';

interface SharedVaultInspectorSheetProps {
  item: SharedVaultItem | null;
  albums: SharedVaultAlbum[];
  currentUserProfile: UserProfile;
  partnerProfile: UserProfile;
  /** True when opened from the Trash tab -- swaps "Move to Trash" for "Restore" + "Delete Forever". */
  isTrash?: boolean;
  onClose: () => void;
  onGoToMessage?: (messageId: string) => void;
  onItemUpdated: (updated: SharedVaultItem) => void;
  onItemDeleted: (itemId: string) => void;
}

export const SharedVaultInspectorSheet: React.FC<SharedVaultInspectorSheetProps> = ({
  item,
  albums,
  currentUserProfile,
  partnerProfile,
  isTrash,
  onClose,
  onGoToMessage,
  onItemUpdated,
  onItemDeleted,
}) => {
  const { showToast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [showAlbumMenu, setShowAlbumMenu] = useState(false);
  const [isCloning, setIsCloning] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setIsPlayingAudio(false);
    setAudioProgress(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, [item?.id]);

  if (!item) return null;

  const isSavedByMe = item.saved_by === currentUserProfile.id;
  const currentAlbum = albums.find(a => a.id === item.album_id);

  const handleMoveToAlbum = async (albumId: string | null) => {
    selectionChange();
    setShowAlbumMenu(false);
    await moveItemsToAlbum([item.id], albumId);
    onItemUpdated({ ...item, album_id: albumId });
    showToast(albumId ? 'Moved to album' : 'Removed from album', 'success');
  };

  const handleClone = async () => {
    if (isCloning) return;
    setIsCloning(true);
    mediumImpact();
    const cloned = await cloneToPersonalVault(item, currentUserProfile.id);
    setIsCloning(false);
    if (cloned) {
      showToast('Saved to your Personal Gallery', 'success');
    } else {
      showToast('Could not save to gallery', 'error');
    }
  };

  const handleDelete = async () => {
    if (!isSavedByMe) {
      showToast('Only the person who saved this memory can delete it', 'error');
      return;
    }

    if (isTrash) {
      if (!window.confirm('Permanently delete this memory? This cannot be undone.')) return;
      mediumImpact();
      const deleted = await deleteSharedVaultItem(item.id, currentUserProfile.id);
      if (!deleted) {
        showToast('Failed to delete from Shared Vault', 'error');
        return;
      }
      onItemDeleted(item.id);
      onClose();
      showToast('Deleted forever', 'info');
      return;
    }

    if (!window.confirm('Move this memory to Trash? You can restore it within 30 days.')) return;
    mediumImpact();
    const trashed = await softDeleteSharedVaultItem(item.id);
    if (!trashed) {
      showToast('Failed to move to Trash', 'error');
      return;
    }
    onItemUpdated({ ...item, deleted_at: new Date().toISOString() });
    onClose();
    showToast('Moved to Trash', 'info');
  };

  const handleRestore = async () => {
    mediumImpact();
    const restored = await restoreSharedVaultItem(item.id);
    if (!restored) {
      showToast('Failed to restore', 'error');
      return;
    }
    onItemUpdated({ ...item, deleted_at: null });
    onClose();
    showToast('Restored from Trash', 'success');
  };

  const toggleAudioPlayback = () => {
    lightImpact();
    if (!audioRef.current) {
      const audio = new Audio(item.media_url);
      audioRef.current = audio;
      audio.ontimeupdate = () => {
        if (audio.duration && Number.isFinite(audio.duration)) {
          setAudioProgress(audio.currentTime / audio.duration);
        }
      };
      audio.onended = () => {
        setIsPlayingAudio(false);
        setAudioProgress(0);
      };
    }

    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.play().catch(e => console.warn('Audio play error:', e));
      setIsPlayingAudio(true);
    }
  };

  const dateFormatted = new Date(item.memory_date || item.created_at).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timeFormatted = new Date(item.memory_date || item.created_at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex flex-col justify-end animate-fade-in"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-2xl mx-auto bg-vault-900 border-t border-vault-700/80 rounded-t-3xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ${
          isExpanded ? 'h-[92vh]' : 'h-[65vh] sm:h-[60vh]'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag Handle & Top Controls */}
        <div className="flex items-center justify-between px-5 pt-3 pb-2 border-b border-vault-800 shrink-0">
          <button
            type="button"
            onClick={() => setIsExpanded(prev => !prev)}
            className="w-12 h-1.5 rounded-full bg-vault-700 hover:bg-vault-600 mx-auto transition-colors cursor-pointer"
            aria-label="Toggle full view"
          />
          <div className="absolute right-4 top-3 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsExpanded(prev => !prev)}
              className="ib ib-s rounded-full text-vault-400 hover:text-white"
              title={isExpanded ? 'Collapse' : 'Expand full-screen'}
            >
              {isExpanded ? <Minimize2 className="i" /> : <Maximize2 className="i" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="ib ib-s rounded-full text-vault-400 hover:text-white"
              aria-label="Close sheet"
            >
              <X className="i" />
            </button>
          </div>
        </div>

        {/* Media Preview Stage */}
        <div className="relative w-full bg-vault-950 flex items-center justify-center overflow-hidden shrink-0 max-h-[36vh]">
          {item.media_type === 'image' && (
            <img
              src={item.media_url}
              alt={item.caption || 'Shared memory'}
              className="w-full h-full max-h-[36vh] object-contain select-none"
            />
          )}

          {item.media_type === 'video' && (
            <video
              src={item.media_url}
              controls
              playsInline
              className="w-full h-full max-h-[36vh] object-contain rounded-lg"
            />
          )}

          {item.media_type === 'audio' && (
            <div className="w-full py-8 px-6 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-purple-950/40 to-vault-950">
              <button
                type="button"
                onClick={toggleAudioPlayback}
                className="w-16 h-16 rounded-full bg-purple-500 text-white flex items-center justify-center shadow-xl active:scale-95 transition-transform"
                aria-label={isPlayingAudio ? 'Pause voice note' : 'Play voice note'}
              >
                {isPlayingAudio ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
              </button>
              <div className="w-full max-w-sm space-y-2 text-center">
                <div className="h-2 bg-vault-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-400 transition-all duration-150"
                    style={{ width: `${Math.round(audioProgress * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-vault-400 font-mono">
                  {item.metadata?.duration ? `${item.metadata.duration} Voice Note` : 'Shared Voice Note'}
                </span>
              </div>
            </div>
          )}

          {item.media_type === 'text_memory' && (
            <div className="w-full py-8 px-6 bg-gradient-to-br from-vault-850 via-vault-900 to-vault-950 flex flex-col items-center justify-center text-center">
              <Quote className="w-8 h-8 text-emerald mb-2 opacity-75" />
              <p className="text-base sm:text-lg font-serif italic text-white max-w-md leading-relaxed">
                "{item.caption || item.media_url}"
              </p>
              {item.metadata?.quote_author && (
                <span className="text-xs text-emerald mt-2 font-semibold tracking-wide">
                  — {item.metadata.quote_author}
                </span>
              )}
            </div>
          )}

          {(item.media_type === 'document' || item.media_type === 'link') && (
            <div className="w-full py-8 px-6 flex flex-col items-center justify-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-vault-800 border border-vault-700 flex items-center justify-center text-emerald">
                {item.media_type === 'document' ? <FileText className="w-7 h-7" /> : <Link2 className="w-7 h-7" />}
              </div>
              <span className="text-sm font-semibold text-white truncate max-w-xs">{item.file_name || item.media_url}</span>
            </div>
          )}
        </div>

        {/* Bottom Metadata & Dossier Section */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* Header Info: Saved by, Date, Star */}
          <div className="flex items-center justify-between pb-3 border-b border-vault-800">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-vault-800 border border-vault-700 flex items-center justify-center text-vault-300 overflow-hidden font-bold">
                {isSavedByMe ? (
                  currentUserProfile.avatar_url ? (
                    <img src={currentUserProfile.avatar_url} alt="You" className="w-full h-full object-cover" />
                  ) : (
                    currentUserProfile.display_name?.charAt(0).toUpperCase() || 'U'
                  )
                ) : partnerProfile.avatar_url ? (
                  <img src={partnerProfile.avatar_url} alt={partnerProfile.display_name} className="w-full h-full object-cover" />
                ) : (
                  partnerProfile.display_name?.charAt(0).toUpperCase() || 'P'
                )}
              </div>
              <div className="flex flex-col">
                <span className="text-white font-bold text-sm">
                  {isSavedByMe ? 'Saved by You' : `Saved by ${partnerProfile.display_name}`}
                </span>
                <span className="text-vault-400 text-[11px] flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {dateFormatted} at {timeFormatted}
                </span>
              </div>
            </div>
          </div>

          {/* Caption / Note */}
          {item.caption && item.media_type !== 'text_memory' && (
            <div className="p-3.5 rounded-xl bg-vault-850 border border-vault-800 text-vault-200 text-xs">
              <span className="font-semibold text-vault-400 block mb-1">Memory Note</span>
              <p className="leading-relaxed">{item.caption}</p>
            </div>
          )}

          {/* Album Assignment Dropdown */}
          <div className="relative">
            <label className="font-semibold text-vault-400 block mb-1">Assigned Album</label>
            <button
              type="button"
              onClick={() => setShowAlbumMenu(prev => !prev)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-vault-850 border border-vault-750 hover:border-vault-600 text-white transition-all text-xs"
            >
              <span className="flex items-center gap-2 font-medium">
                <Folder className="w-4 h-4 text-purple-400" />
                {currentAlbum ? currentAlbum.title : 'None (Uncategorized)'}
              </span>
              <ChevronDown className="w-4 h-4 text-vault-400" />
            </button>

            {showAlbumMenu && (
              <div className="absolute top-full mt-1.5 inset-x-0 bg-vault-900 border border-vault-700 rounded-xl shadow-2xl p-1 z-30 space-y-0.5">
                <button
                  type="button"
                  onClick={() => handleMoveToAlbum(null)}
                  className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between text-xs ${
                    !item.album_id ? 'bg-purple-500/20 text-purple-300 font-bold' : 'text-vault-300 hover:bg-vault-800'
                  }`}
                >
                  <span>None (Uncategorized)</span>
                  {!item.album_id && <Check className="w-3.5 h-3.5" />}
                </button>
                {albums.map(album => (
                  <button
                    key={album.id}
                    type="button"
                    onClick={() => handleMoveToAlbum(album.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between text-xs ${
                      item.album_id === album.id ? 'bg-purple-500/20 text-purple-300 font-bold' : 'text-vault-300 hover:bg-vault-800'
                    }`}
                  >
                    <span className="truncate">{album.title}</span>
                    {item.album_id === album.id && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Actions Grid */}
          <div className="pt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {item.message_id && onGoToMessage && (
              <button
                type="button"
                onClick={() => {
                  lightImpact();
                  onGoToMessage(item.message_id!);
                  onClose();
                }}
                className="btn btn-g py-2.5 px-3 flex items-center justify-center gap-1.5 text-xs text-vault-200 hover:text-white"
              >
                <ExternalLink className="w-4 h-4 text-emerald" />
                <span>Jump in Chat</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleClone}
              disabled={isCloning}
              className="btn btn-g py-2.5 px-3 flex items-center justify-center gap-1.5 text-xs text-vault-200 hover:text-white"
            >
              <FolderHeart className="w-4 h-4 text-purple-400" />
              <span>{isCloning ? 'Saving…' : 'Save to Gallery'}</span>
            </button>

            {item.media_url && (
              <a
                href={item.media_url}
                download={`vault-${item.id}.jpg`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-g py-2.5 px-3 flex items-center justify-center gap-1.5 text-xs text-vault-200 hover:text-white"
              >
                <Download className="w-4 h-4 text-sky-400" />
                <span>Download</span>
              </a>
            )}

            {isTrash && isSavedByMe && (
              <button
                type="button"
                onClick={handleRestore}
                className="btn btn-g py-2.5 px-3 flex items-center justify-center gap-1.5 text-xs !text-emerald-400 hover:!text-emerald-300 hover:bg-emerald-500/10"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Restore</span>
              </button>
            )}

            {isSavedByMe && (
              <button
                type="button"
                onClick={handleDelete}
                className="btn btn-g py-2.5 px-3 flex items-center justify-center gap-1.5 text-xs !text-red-400 hover:!text-red-300 hover:bg-red-500/10"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isTrash ? 'Delete Forever' : 'Move to Trash'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
