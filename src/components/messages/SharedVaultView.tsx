import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ArrowLeft,
  Search,
  Star,
  Plus,
  Play,
  X,
  Calendar,
  Sparkles,
  Quote,
  FolderHeart,
  FolderPlus,
  Folder,
  LayoutGrid,
  Columns,
  Image as ImageIcon,
  Loader2,
  Upload,
} from 'lucide-react';
import { SharedVaultItem, SharedVaultAlbum, VaultNavigationState, UserProfile } from '../../types';
import {
  listSharedVaultItems,
  listSharedVaultAlbums,
  saveToSharedVault,
  createSharedVaultAlbum,
  updateSharedVaultAlbum,
  deleteSharedVaultAlbum,
  restoreSharedVaultItem,
} from '../../lib/sharedVaultApi';
import { uploadChatMedia } from '../../lib/storageHelper';
import { formatTimestamp } from '../../lib/utils';
import { useToast } from '../../context/ToastContext';
import { lightImpact, mediumImpact, selectionChange, notificationSuccess, errorWarning } from '../../lib/haptics';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { uniqueChannelName } from '../../lib/realtime';
import { useBackHandler } from '../../lib/backButton';
import { SharedVaultInspectorSheet } from './SharedVaultInspectorSheet';
import { SharedVaultAlbumModal, GRADIENT_PRESETS } from './SharedVaultAlbumModal';
import { SharedVaultAlbumView } from './SharedVaultAlbumView';

interface SharedVaultViewProps {
  conversationId: string;
  partnerProfile: UserProfile;
  currentUserProfile: UserProfile;
  onGoToMessage?: (messageId: string) => void;
  onClose?: () => void;
}

type FilterCategory = 'all' | 'albums' | 'image' | 'video' | 'text_memory' | 'favorites' | 'trash';

export const SharedVaultView: React.FC<SharedVaultViewProps> = ({
  conversationId,
  partnerProfile,
  currentUserProfile,
  onGoToMessage,
  onClose,
}) => {
  const { showToast } = useToast();
  const [items, setItems] = useState<SharedVaultItem[]>([]);
  const [albums, setAlbums] = useState<SharedVaultAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [navState, setNavState] = useState<VaultNavigationState>({ view: 'root' });
  const [selectedFilter, setSelectedFilter] = useState<FilterCategory>('all');
  const [layoutMode, setLayoutMode] = useState<'magazine' | 'grid'>('magazine');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Media upload state
  const [isUploadingSharedMedia, setIsUploadingSharedMedia] = useState(false);
  const sharedFileInputRef = useRef<HTMLInputElement>(null);

  // Inspector state
  const [inspectedItem, setInspectedItem] = useState<SharedVaultItem | null>(null);

  // Album Modal state
  const [isAlbumModalOpen, setIsAlbumModalOpen] = useState(false);
  const [editingAlbum, setEditingAlbum] = useState<SharedVaultAlbum | null>(null);

  // Add Memory Modal state
  const [isAddMemoryModalOpen, setIsAddMemoryModalOpen] = useState(false);
  const [newMemoryText, setNewMemoryText] = useState('');
  const [newMemoryCaption, setNewMemoryCaption] = useState('');
  const [newMemoryAlbumId, setNewMemoryAlbumId] = useState<string | null>(null);
  const [addingMemory, setAddingMemory] = useState(false);

  // Back handler support for sub-page navigation
  useBackHandler(navState.view !== 'root' || Boolean(inspectedItem), () => {
    if (inspectedItem) {
      setInspectedItem(null);
    } else if (navState.view !== 'root') {
      setNavState({ view: 'root' });
    }
  });

  // 1. Data Loader
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [vaultItems, vaultAlbums] = await Promise.all([
        listSharedVaultItems(conversationId, { includeDeleted: true }),
        listSharedVaultAlbums(conversationId),
      ]);
      setItems(vaultItems);
      setAlbums(vaultAlbums);
    } catch (err) {
      console.error('Failed to load shared vault:', err);
      showToast('Could not load shared vault', 'error');
    } finally {
      setLoading(false);
    }
  }, [conversationId, showToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // 2. Realtime Collaboration Channel
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const channel = supabase
      .channel(uniqueChannelName(`shared_vault_${conversationId}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shared_vault_items',
          filter: `conversation_id=eq.${conversationId}`,
        },
        payload => {
          if (payload.eventType === 'INSERT') {
            const newItem = payload.new as SharedVaultItem;
            setItems(prev => [newItem, ...prev.filter(i => i.id !== newItem.id)]);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as SharedVaultItem;
            setItems(prev => prev.map(i => (i.id === updated.id ? { ...i, ...updated } : i)));
            if (inspectedItem?.id === updated.id) {
              setInspectedItem(updated);
            }
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id: string }).id;
            setItems(prev => prev.filter(i => i.id !== deletedId));
            if (inspectedItem?.id === deletedId) {
              setInspectedItem(null);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shared_vault_albums',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          void listSharedVaultAlbums(conversationId).then(setAlbums);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, inspectedItem?.id]);

  // 3. Album Management Handlers
  const handleSaveAlbum = async (data: { title: string; description: string; gradient_preset: string }) => {
    if (editingAlbum) {
      const updated = await updateSharedVaultAlbum(editingAlbum.id, data);
      if (updated) {
        setAlbums(prev => prev.map(a => (a.id === updated.id ? updated : a)));
        if (navState.view === 'album' && navState.album.id === updated.id) {
          setNavState({ view: 'album', album: updated });
        }
        showToast('Album updated', 'success');
      }
    } else {
      const created = await createSharedVaultAlbum({
        conversation_id: conversationId,
        created_by: currentUserProfile.id,
        ...data,
      });
      setAlbums(prev => [created, ...prev]);
      showToast('Album created', 'success');
    }
    setEditingAlbum(null);
  };

  const handleDeleteAlbum = async (albumId: string) => {
    if (!window.confirm('Delete this album? Memories inside will remain in the main vault.')) return;
    mediumImpact();
    await deleteSharedVaultAlbum(albumId);
    setAlbums(prev => prev.filter(a => a.id !== albumId));
    setItems(prev => prev.map(i => (i.album_id === albumId ? { ...i, album_id: null } : i)));
    setNavState({ view: 'root' });
    showToast('Album deleted', 'info');
  };

  // 4. Upload Photo or Video Handler
  const handleSharedMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    setIsUploadingSharedMedia(true);
    lightImpact();
    try {
      for (const file of files) {
        const isVid = file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|3gp)$/i.test(file.name);
        const mediaUrl = await uploadChatMedia(file, conversationId);
        const saved = await saveToSharedVault({
          conversation_id: conversationId,
          saved_by: currentUserProfile.id,
          album_id: navState.view === 'album' ? navState.album.id : null,
          media_type: isVid ? 'video' : 'image',
          media_url: mediaUrl,
          file_name: file.name,
          caption: null,
          memory_date: new Date().toISOString(),
        });
        setItems(prev => [saved, ...prev]);
      }
      showToast(files.length === 1 ? 'Added to Shared Vault ✨' : `${files.length} items added to Shared Vault ✨`, 'success');
      notificationSuccess();
    } catch (err) {
      console.error('Shared vault upload error:', err);
      showToast('Failed to upload to Shared Vault', 'error');
      errorWarning();
    } finally {
      setIsUploadingSharedMedia(false);
    }
  };

  // 5. Create Text Memory Handler
  const handleCreateMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryText.trim() || addingMemory) return;

    setAddingMemory(true);
    mediumImpact();
    try {
      const saved = await saveToSharedVault({
        conversation_id: conversationId,
        saved_by: currentUserProfile.id,
        album_id: newMemoryAlbumId,
        media_type: 'text_memory',
        media_url: newMemoryText.trim(),
        caption: newMemoryCaption.trim() || null,
        memory_date: new Date().toISOString(),
        metadata: {
          quote_author: currentUserProfile.display_name,
        },
      });

      setItems(prev => [saved, ...prev]);
      setNewMemoryText('');
      setNewMemoryCaption('');
      setNewMemoryAlbumId(null);
      setIsAddMemoryModalOpen(false);
      showToast('Memory saved to Shared Vault ✨', 'success');
      notificationSuccess();
    } catch (err) {
      console.error(err);
      showToast('Failed to save memory', 'error');
      errorWarning();
    } finally {
      setAddingMemory(false);
    }
  };

  // 6. Active items based on filters and search (excluding audio/VM)
  const activeItems = useMemo(() => {
    let list = items.filter(i => i.media_type !== 'audio');

    if (selectedFilter === 'trash') {
      list = list.filter(i => Boolean(i.deleted_at));
    } else {
      list = list.filter(i => !i.deleted_at);
      if (selectedFilter === 'favorites') {
        list = list.filter(i => (i.starred_by || []).length > 0 || i.is_favorite);
      } else if (selectedFilter !== 'all' && selectedFilter !== 'albums') {
        list = list.filter(i => i.media_type === selectedFilter);
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        i =>
          (i.caption && i.caption.toLowerCase().includes(q)) ||
          (i.media_url && i.media_url.toLowerCase().includes(q)) ||
          (i.file_name && i.file_name.toLowerCase().includes(q))
      );
    }

    return list;
  }, [items, selectedFilter, searchQuery]);

  // Highlight billboard memory (random or most recent favorite)
  const spotlightMemory = useMemo(() => {
    const favorites = items.filter(i => !i.deleted_at && ((i.starred_by || []).length > 0 || i.is_favorite));
    if (favorites.length > 0) return favorites[0];
    const nonDeleted = items.filter(i => !i.deleted_at);
    return nonDeleted.length > 0 ? nonDeleted[0] : null;
  }, [items]);

  // If inside Album Sub-Page
  if (navState.view === 'album') {
    return (
      <>
        <SharedVaultAlbumView
          album={navState.album}
          items={items}
          currentUserProfile={currentUserProfile}
          partnerProfile={partnerProfile}
          onBack={() => setNavState({ view: 'root' })}
          onEditAlbum={() => {
            setEditingAlbum(navState.album);
            setIsAlbumModalOpen(true);
          }}
          onDeleteAlbum={() => handleDeleteAlbum(navState.album.id)}
          onSelectItem={item => setInspectedItem(item)}
          onAddMemory={() => {
            setNewMemoryAlbumId(navState.album.id);
            setIsAddMemoryModalOpen(true);
          }}
          onUploadMedia={() => {
            sharedFileInputRef.current?.click();
          }}
        />

        <SharedVaultInspectorSheet
          item={inspectedItem}
          albums={albums}
          currentUserProfile={currentUserProfile}
          partnerProfile={partnerProfile}
          onClose={() => setInspectedItem(null)}
          onGoToMessage={onGoToMessage}
          onItemUpdated={updated => setItems(prev => prev.map(i => (i.id === updated.id ? updated : i)))}
          onItemDeleted={id => setItems(prev => prev.filter(i => i.id !== id))}
        />

        <SharedVaultAlbumModal
          isOpen={isAlbumModalOpen}
          onClose={() => {
            setIsAlbumModalOpen(false);
            setEditingAlbum(null);
          }}
          onSave={handleSaveAlbum}
          initialData={editingAlbum}
        />

        {/* Add Memory Modal */}
        {isAddMemoryModalOpen && (
          <AddMemoryModal
            isOpen={isAddMemoryModalOpen}
            onClose={() => setIsAddMemoryModalOpen(false)}
            onSubmit={handleCreateMemory}
            newMemoryText={newMemoryText}
            setNewMemoryText={setNewMemoryText}
            newMemoryCaption={newMemoryCaption}
            setNewMemoryCaption={setNewMemoryCaption}
            addingMemory={addingMemory}
          />
        )}
      </>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-vault-950 text-vault-100 overflow-hidden select-none animate-fade-in">
      {/* Spacious Top Header */}
      <header className="px-5 py-3.5 border-b border-vault-850 flex items-center justify-between bg-vault-900/90 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          {onClose && (
            <button
              type="button"
              onClick={() => {
                lightImpact();
                onClose();
              }}
              className="ib ib-s rounded-full text-vault-400 hover:text-white"
              aria-label="Back to chat"
            >
              <ArrowLeft className="i" />
            </button>
          )}

          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-emerald-500 p-0.5 shadow-lg">
              <div className="w-full h-full bg-vault-950 rounded-[14px] flex items-center justify-center text-emerald">
                <FolderHeart className="w-5 h-5" />
              </div>
            </div>
            <div>
              <h1 className="text-base font-extrabold text-white tracking-tight flex items-center gap-1.5">
                Shared Vault
              </h1>
              <p className="text-[11px] text-vault-400 font-medium">
                {partnerProfile.display_name} & You · {items.filter(i => !i.deleted_at).length} Memories
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <input
            ref={sharedFileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={handleSharedMediaUpload}
          />

          <button
            type="button"
            onClick={() => {
              selectionChange();
              setSearchOpen(prev => !prev);
            }}
            className={`ib ib-s rounded-full ${searchOpen ? 'text-purple-400 bg-purple-500/10' : 'text-vault-400 hover:text-white'}`}
            title="Search Vault"
          >
            <Search className="i" />
          </button>

          <button
            type="button"
            onClick={() => {
              selectionChange();
              setLayoutMode(m => (m === 'magazine' ? 'grid' : 'magazine'));
            }}
            className="ib ib-s rounded-full text-vault-400 hover:text-white"
            title={layoutMode === 'magazine' ? 'Switch to Grid View' : 'Switch to Magazine View'}
          >
            {layoutMode === 'magazine' ? <LayoutGrid className="i" /> : <Columns className="i" />}
          </button>

          <button
            type="button"
            disabled={isUploadingSharedMedia}
            onClick={() => {
              lightImpact();
              sharedFileInputRef.current?.click();
            }}
            className="btn btn-s py-2 px-3 text-xs font-semibold flex items-center gap-1.5 rounded-xl border border-vault-700 hover:border-emerald text-vault-200 hover:text-white"
            title="Upload Photos or Videos"
          >
            {isUploadingSharedMedia ? <Loader2 className="w-4 h-4 animate-spin text-emerald" /> : <Upload className="w-4 h-4 text-emerald" />}
            <span className="hidden sm:inline">Add Photos / Videos</span>
          </button>

          <button
            type="button"
            onClick={() => {
              lightImpact();
              setIsAddMemoryModalOpen(true);
            }}
            className="btn btn-p py-2 px-3.5 text-xs font-bold flex items-center gap-1.5 rounded-xl shadow-lg"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Note</span>
          </button>
        </div>
      </header>

      {/* Search Bar (Expandable) */}
      {searchOpen && (
        <div className="px-5 py-2.5 bg-vault-900 border-b border-vault-800 flex items-center gap-2 anim-sheet">
          <Search className="w-4 h-4 text-vault-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search photos, videos, notes, quotes..."
            autoFocus
            className="w-full bg-transparent text-white text-xs placeholder:text-vault-500 focus:outline-none"
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} className="text-vault-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Spacious Category Filter Pills */}
      <div className="px-5 py-2.5 border-b border-vault-850 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0 bg-vault-950/80">
        {[
          { id: 'all', label: 'All Media' },
          { id: 'albums', label: `Albums (${albums.length})` },
          { id: 'image', label: 'Photos' },
          { id: 'video', label: 'Videos' },
          { id: 'text_memory', label: 'Quotes & Notes' },
          { id: 'favorites', label: '⭐ Starred' },
          { id: 'trash', label: '🗑️ Trash' },
        ].map(cat => {
          const isSelected = selectedFilter === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                selectionChange();
                setSelectedFilter(cat.id as FilterCategory);
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                isSelected
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                  : 'bg-vault-900 text-vault-400 border border-vault-800 hover:text-vault-200'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* Spotlight Billboard Banner (Shown on 'all' view when not searching) */}
        {selectedFilter === 'all' && !searchQuery && spotlightMemory && (
          <div
            onClick={() => {
              lightImpact();
              setInspectedItem(spotlightMemory);
            }}
            className="relative rounded-3xl overflow-hidden bg-gradient-to-tr from-purple-950/90 via-vault-900 to-vault-850 border border-purple-500/30 p-6 sm:p-8 shadow-2xl hover:border-purple-500/60 transition-all cursor-pointer group"
          >
            <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-2 max-w-lg">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[11px] font-bold">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Spotlight Memory · Tap to Inspect</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white drop-shadow">
                  {spotlightMemory.caption || (spotlightMemory.media_type === 'text_memory' ? `"${spotlightMemory.media_url}"` : 'Shared with love')}
                </h3>
                <p className="text-xs text-vault-300 flex items-center gap-1.5 font-medium">
                  <Calendar className="w-3.5 h-3.5" /> {formatTimestamp(spotlightMemory.created_at)}
                </p>
              </div>

              {spotlightMemory.media_type === 'image' && (
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden border-2 border-white/20 shadow-xl shrink-0 group-hover:scale-105 transition-transform">
                  <img src={spotlightMemory.media_url} alt="Memory" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main Content: Loading vs Albums vs Items */}
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3 text-vault-400">
            <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
            <span className="text-xs font-medium">Loading Vault Memories…</span>
          </div>
        ) : selectedFilter === 'albums' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Custom Collections</h2>
              <button
                type="button"
                onClick={() => {
                  lightImpact();
                  setEditingAlbum(null);
                  setIsAlbumModalOpen(true);
                }}
                className="btn btn-g py-1.5 px-3 text-xs flex items-center gap-1.5"
              >
                <FolderPlus className="w-4 h-4 text-purple-400" />
                <span>New Album</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {albums.map(album => {
                const preset = GRADIENT_PRESETS.find(p => p.id === album.gradient_preset) || GRADIENT_PRESETS[0];
                return (
                  <div
                    key={album.id}
                    onClick={() => {
                      lightImpact();
                      setNavState({ view: 'album', album });
                    }}
                    className={`relative rounded-3xl bg-gradient-to-br ${preset.class} p-5 shadow-xl hover:scale-[1.02] transition-all cursor-pointer border border-white/10 flex flex-col justify-between min-h-[160px] group`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-2xl bg-black/40 backdrop-blur-md flex items-center justify-center text-white">
                        <Folder className="w-5 h-5" />
                      </div>
                      <span className="px-2.5 py-1 rounded-full bg-black/30 backdrop-blur-md text-[11px] font-bold text-white">
                        {album.item_count || 0} items
                      </span>
                    </div>

                    <div className="space-y-1">
                      <h3 className="text-lg font-black text-white drop-shadow truncate">{album.title}</h3>
                      {album.description && (
                        <p className="text-xs text-white/80 line-clamp-2 leading-relaxed">{album.description}</p>
                      )}
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  lightImpact();
                  setEditingAlbum(null);
                  setIsAlbumModalOpen(true);
                }}
                className="rounded-3xl border-2 border-dashed border-vault-800 hover:border-purple-500/60 p-6 flex flex-col items-center justify-center gap-3 text-vault-400 hover:text-purple-300 transition-all min-h-[160px]"
              >
                <div className="w-12 h-12 rounded-full bg-vault-900 flex items-center justify-center text-purple-400">
                  <FolderPlus className="w-6 h-6" />
                </div>
                <span className="text-xs font-bold">Create New Album</span>
              </button>
            </div>
          </div>
        ) : activeItems.length === 0 ? (
          <div className="py-20 text-center space-y-3 bg-vault-900/30 rounded-3xl border border-vault-850 p-8">
            <div className="w-16 h-16 rounded-full bg-vault-850 mx-auto flex items-center justify-center text-vault-500">
              <ImageIcon className="w-8 h-8 opacity-60" />
            </div>
            <h3 className="text-sm font-bold text-white">
              {selectedFilter === 'trash' ? 'Trash is empty' : 'No memories found'}
            </h3>
            <p className="text-xs text-vault-400 max-w-sm mx-auto">
              {selectedFilter === 'trash'
                ? 'Items moved to trash will appear here for 30 days.'
                : 'Start adding photos, voice notes, and sweet quotes to your Shared Vault.'}
            </p>
          </div>
        ) : layoutMode === 'magazine' ? (
          /* Magazine Feed Layout (1-Column Spacious Cards) */
          <div className="max-w-xl mx-auto space-y-5">
            {activeItems.map(item => {
              const isStarred = (item.starred_by || []).length > 0;
              const isDeleted = Boolean(item.deleted_at);

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    lightImpact();
                    setInspectedItem(item);
                  }}
                  className="rounded-3xl overflow-hidden bg-vault-900 border border-vault-800 shadow-xl hover:border-purple-500/50 transition-all cursor-pointer select-none group"
                >
                  {/* Media Rendering */}
                  {item.media_type === 'image' && (
                    <div className="relative aspect-[4/3] bg-vault-950 overflow-hidden">
                      <img
                        src={item.media_url}
                        alt={item.caption || 'Shared memory'}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />
                      {isStarred && (
                        <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-amber-400 shadow-lg">
                          <Star className="w-4 h-4 fill-current" />
                        </div>
                      )}
                    </div>
                  )}

                  {item.media_type === 'video' && (
                    <div className="relative aspect-video bg-vault-950 flex items-center justify-center">
                      <video src={item.media_url} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <div className="w-14 h-14 rounded-full bg-black/60 text-white flex items-center justify-center shadow-xl">
                          <Play className="w-7 h-7 fill-current ml-1" />
                        </div>
                      </div>
                    </div>
                  )}

                  {item.media_type === 'audio' && (
                    <div className="p-6 bg-gradient-to-r from-purple-950/60 to-vault-900 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-purple-500 text-white flex items-center justify-center shadow-lg">
                        <Play className="w-6 h-6 fill-current ml-0.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-bold text-white block truncate">Shared Voice Note</span>
                        <span className="text-[11px] font-mono text-purple-300">
                          {item.metadata?.duration || 'Audio clip'} · Tap to listen
                        </span>
                      </div>
                    </div>
                  )}

                  {item.media_type === 'text_memory' && (
                    <div className="p-6 bg-gradient-to-br from-vault-850 to-vault-950 text-center space-y-2">
                      <Quote className="w-7 h-7 text-emerald mx-auto opacity-75" />
                      <p className="text-base font-serif italic text-white leading-relaxed">
                        "{item.caption || item.media_url}"
                      </p>
                      {item.metadata?.quote_author && (
                        <span className="text-xs text-emerald font-semibold block">— {item.metadata.quote_author}</span>
                      )}
                    </div>
                  )}

                  {/* Card Bottom Meta Bar */}
                  <div className="p-4 flex items-center justify-between border-t border-vault-850/80">
                    <div className="space-y-0.5">
                      {item.caption && item.media_type !== 'text_memory' && (
                        <p className="text-xs font-semibold text-white leading-snug">{item.caption}</p>
                      )}
                      <p className="text-[11px] text-vault-400 font-medium">{formatTimestamp(item.created_at)}</p>
                    </div>

                    {isDeleted && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          void restoreSharedVaultItem(item.id).then(() => {
                            setItems(prev => prev.map(i => (i.id === item.id ? { ...i, deleted_at: null } : i)));
                            showToast('Restored from Trash', 'success');
                          });
                        }}
                        className="btn btn-g py-1 px-2.5 text-[11px] !text-emerald"
                      >
                        Restore
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Spacious 2-Column Grid Layout */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
            {activeItems.map(item => {
              const isStarred = (item.starred_by || []).length > 0;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    lightImpact();
                    setInspectedItem(item);
                  }}
                  className="group relative aspect-square rounded-3xl overflow-hidden bg-vault-900 border border-vault-800 shadow-md hover:shadow-xl hover:border-purple-500/50 transition-all cursor-pointer select-none"
                >
                  {item.media_type === 'image' && (
                    <img
                      src={item.media_url}
                      alt={item.caption || 'Photo'}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  )}

                  {item.media_type === 'video' && (
                    <div className="relative w-full h-full bg-vault-950 flex items-center justify-center">
                      <video src={item.media_url} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center">
                          <Play className="w-5 h-5 fill-current ml-0.5" />
                        </div>
                      </div>
                    </div>
                  )}

                  {item.media_type === 'audio' && (
                    <div className="w-full h-full p-4 bg-gradient-to-br from-purple-950/60 to-vault-950 flex flex-col items-center justify-center text-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-purple-500/30 text-purple-300 flex items-center justify-center">
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      </div>
                      <span className="text-[11px] font-mono text-purple-200">Voice Note</span>
                    </div>
                  )}

                  {item.media_type === 'text_memory' && (
                    <div className="w-full h-full p-4 bg-gradient-to-br from-vault-850 to-vault-950 flex flex-col items-center justify-center text-center">
                      <Quote className="w-6 h-6 text-emerald mb-1 opacity-80" />
                      <p className="text-xs font-serif italic text-white line-clamp-3">
                        "{item.caption || item.media_url}"
                      </p>
                    </div>
                  )}

                  {isStarred && (
                    <div className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-amber-400">
                      <Star className="w-3.5 h-3.5 fill-current" />
                    </div>
                  )}

                  {item.caption && item.media_type !== 'text_memory' && (
                    <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
                      <p className="text-[11px] text-white font-medium truncate drop-shadow">{item.caption}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Interactive Half-Page Inspector Sheet */}
      <SharedVaultInspectorSheet
        item={inspectedItem}
        albums={albums}
        currentUserProfile={currentUserProfile}
        partnerProfile={partnerProfile}
        onClose={() => setInspectedItem(null)}
        onGoToMessage={onGoToMessage}
        onItemUpdated={updated => setItems(prev => prev.map(i => (i.id === updated.id ? updated : i)))}
        onItemDeleted={id => setItems(prev => prev.filter(i => i.id !== id))}
      />

      {/* Album Create/Edit Modal */}
      <SharedVaultAlbumModal
        isOpen={isAlbumModalOpen}
        onClose={() => {
          setIsAlbumModalOpen(false);
          setEditingAlbum(null);
        }}
        onSave={handleSaveAlbum}
        initialData={editingAlbum}
      />

      {/* Add Memory Modal */}
      {isAddMemoryModalOpen && (
        <AddMemoryModal
          isOpen={isAddMemoryModalOpen}
          onClose={() => setIsAddMemoryModalOpen(false)}
          onSubmit={handleCreateMemory}
          newMemoryText={newMemoryText}
          setNewMemoryText={setNewMemoryText}
          newMemoryCaption={newMemoryCaption}
          setNewMemoryCaption={setNewMemoryCaption}
          addingMemory={addingMemory}
        />
      )}
    </div>
  );
};

interface AddMemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  newMemoryText: string;
  setNewMemoryText: (v: string) => void;
  newMemoryCaption: string;
  setNewMemoryCaption: (v: string) => void;
  addingMemory: boolean;
}

const AddMemoryModal: React.FC<AddMemoryModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  newMemoryText,
  setNewMemoryText,
  newMemoryCaption,
  setNewMemoryCaption,
  addingMemory,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 anim-fade"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md glass-panel rounded-3xl p-6 shadow-2xl space-y-4 anim-sheet"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-vault-800">
          <div className="flex items-center gap-2 text-white font-bold text-base">
            <Quote className="w-5 h-5 text-emerald" />
            <span>Save Quote or Text Memory</span>
          </div>
          <button type="button" onClick={onClose} className="ib ib-s rounded-full" aria-label="Close">
            <X className="i" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-vault-300 block mb-1">Quote or Memory Text *</label>
            <textarea
              value={newMemoryText}
              onChange={e => setNewMemoryText(e.target.value)}
              placeholder="e.g. 'You are my favorite notification in the entire universe.'"
              rows={3}
              required
              className="w-full px-4 py-2.5 rounded-xl bg-vault-900 border border-vault-700 text-white placeholder:text-vault-500 text-xs focus:outline-none focus:border-emerald resize-none font-serif italic"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-vault-300 block mb-1">Note or Context (Optional)</label>
            <input
              type="text"
              value={newMemoryCaption}
              onChange={e => setNewMemoryCaption(e.target.value)}
              placeholder="e.g. Late night conversation, 2am..."
              maxLength={80}
              className="w-full px-4 py-2.5 rounded-xl bg-vault-900 border border-vault-700 text-white placeholder:text-vault-500 text-xs focus:outline-none focus:border-emerald"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="btn btn-g py-2 px-4 text-xs">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newMemoryText.trim() || addingMemory}
              className="btn btn-p py-2 px-5 text-xs font-bold"
            >
              {addingMemory ? 'Saving…' : 'Save to Vault'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
