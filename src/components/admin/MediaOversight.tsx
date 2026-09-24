import type { User360Tab } from './User360View';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Image as ImageIcon,
  Trash2,
  MessageSquare,
  Search,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  listGalleryItems,
  listProfiles,
  deleteGalleryItem,
  AdminGalleryItem,
} from '../../lib/adminApi';
import { UserProfile } from '../../types';
import { formatTimestamp } from '../../lib/utils';
import { Avatar } from '../common/Avatar';

interface MediaOversightProps {
  onSelectUser?: (userId: string, tab?: User360Tab) => void;
  /** Kept for callers; gallery uploads have no conversation, so it isn't used. */
  onSelectConversation?: (conversationId: string, highlightMessageId?: string) => void;
  onNavigateToUser?: (userId: string, tab?: User360Tab) => void;
  onNavigateToConversation?: (conversationId: string, highlightMessageId?: string) => void;
}

export const MediaOversight: React.FC<MediaOversightProps> = ({
  onSelectUser,
  onNavigateToUser,
}) => {
  const navigateUser = onNavigateToUser || onSelectUser || (() => {});

  const { user } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState<AdminGalleryItem[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [mediaList, profileList] = await Promise.all([
        listGalleryItems(user.id),
        listProfiles(),
      ]);

      const map: Record<string, UserProfile> = {};
      for (const p of profileList) map[p.id] = p;

      setItems(mediaList);
      setProfiles(map);
    } catch (err) {
      console.warn('Error loading media oversight:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDelete = async (e: React.MouseEvent, item: AdminGalleryItem) => {
    e.stopPropagation();
    if (!user) return;
    if (!confirm('Are you sure you want to permanently delete this media from server storage and database?')) {
      return;
    }

    setDeletingId(item.id);
    try {
      await deleteGalleryItem(user.id, item);
      setItems(prev => prev.filter(i => i.id !== item.id));
      showToast('Media permanently deleted from Supabase Storage & Database', 'info');
    } catch (err) {
      console.error('Delete failed:', err);
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  /**
   * These are private gallery uploads (gallery_items). They are never sent in a chat:
   * chat photos are stored separately under the conversation. So there is no chat to
   * jump to; open the owner's Media tab instead of guessing a conversation.
   */
  const handleMediaClick = (item: AdminGalleryItem) => {
    navigateUser(item.user_id, 'media');
  };

  const filteredItems = items.filter(item => {
    const u = profiles[item.user_id];
    const q = searchQuery.toLowerCase();
    const matchesUser =
      (u?.display_name && u.display_name.toLowerCase().includes(q)) ||
      (u?.username && u.username.toLowerCase().includes(q)) ||
      (u?.uid && u.uid.toLowerCase().includes(q));
    const matchesCaption = item.caption && item.caption.toLowerCase().includes(q);

    return !searchQuery.trim() || matchesUser || matchesCaption;
  });

  return (
    <div className="space-y-4">
      {/* Header with Search & Count */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-vault-900 border border-vault-800 p-3.5 rounded-2xl">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-vault-950 border border-vault-750 text-purple-400">
            <ImageIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider m-0">
              Media Oversight
            </h3>
            <p className="text-xs text-vault-400 font-mono m-0">
              Private gallery uploads. Click a photo to open its owner's Media tab.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-vault-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Filter by user, caption, UID..."
              className="w-full bg-vault-950 border border-vault-750 focus:border-purple-400 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-vault-500 outline-none transition-colors"
            />
          </div>

          <button
            type="button"
            onClick={loadData}
            title="Refresh media"
            aria-label="Refresh media"
            className="p-2 bg-vault-800 hover:bg-vault-700 text-vault-200 rounded-xl border border-vault-700 shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Media Grid */}
      {loading && items.length === 0 ? (
        <div className="py-20 text-center text-vault-400 text-xs flex items-center justify-center gap-2">
          <div className="w-4 h-4 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
          <span>Loading platform media...</span>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="py-20 text-center text-vault-400 text-xs bg-vault-900/50 rounded-2xl border border-vault-800">
          No media items found matching criteria.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {filteredItems.map(item => {
            const u = profiles[item.user_id];

            return (
              <div
                key={item.id}
                onClick={() => handleMediaClick(item)}
                className="group relative bg-vault-900 border border-vault-800 hover:border-emerald rounded-2xl overflow-hidden transition-all duration-300 shadow-md hover:shadow-xl hover:shadow-emerald/5 flex flex-col cursor-pointer"
              >
                {/* Photo Preview Container */}
                <div className="relative aspect-square w-full bg-black overflow-hidden">
                  <img
                    src={item.previewUrl || item.image_url}
                    alt={item.caption || 'Media item'}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />

                  {/* Hover Overlay Badge */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-3 text-center gap-2">
                    <span className="px-3 py-1.5 rounded-xl bg-emerald text-black text-xs font-bold flex items-center gap-1.5 shadow-lg">
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Open owner's media</span>
                    </span>
                    <span className="text-[10px] text-vault-300 font-mono">
                      Shows this user's uploads
                    </span>
                  </div>

                  {/* Delete button on top right */}
                  <button
                    type="button"
                    onClick={e => handleDelete(e, item)}
                    disabled={deletingId === item.id}
                    title="Delete media"
                    aria-label="Delete media"
                    className="absolute top-2 right-2 p-2 bg-black/70 hover:bg-rose-600 text-white rounded-xl backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Card Metadata Footer */}
                <div className="p-3 bg-vault-950 flex flex-col gap-1.5 border-t border-vault-800">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        navigateUser(item.user_id);
                      }}
                      className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity text-left cursor-pointer"
                    >
                      <Avatar src={u?.avatar_url} name={u?.display_name || 'User'} size={32} />
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-white block truncate">{u?.display_name || 'User'}</span>
                        <span className="text-[10px] font-mono text-emerald block">{u?.uid}</span>
                      </div>
                    </button>

                    <span className="text-[10px] font-mono text-vault-500 shrink-0">
                      {formatTimestamp(item.created_at)}
                    </span>
                  </div>

                  {item.caption && (
                    <p className="text-xs text-vault-300 line-clamp-1 m-0">
                      "{item.caption}"
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
