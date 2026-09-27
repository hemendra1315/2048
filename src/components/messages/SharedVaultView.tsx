import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ArrowLeft,
  Search,
  Play,
  X,
  Calendar,
  Sparkles,
  FolderPlus,
  Folder,
  FolderHeart,
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
} from '../../lib/sharedVaultApi';
import { uploadChatMedia } from '../../lib/storageHelper';
import { formatTimestamp } from '../../lib/utils';
import { useToast } from '../../context/ToastContext';
import { lightImpact, mediumImpact, selectionChange, notificationSuccess, errorWarning } from '../../lib/haptics';
import { expectExternalActivity } from '../../lib/externalActivity';
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

type FilterCategory = 'all' | 'albums' | 'image' | 'video';

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
        listSharedVaultItems(conversationId),
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

  // 5. Active items based on filters and search (photos & videos)
  const activeItems = useMemo(() => {
    let list = items.filter(i => !i.deleted_at && (i.media_type === 'image' || i.media_type === 'video'));

    if (selectedFilter === 'image' || selectedFilter === 'video') {
      list = list.filter(i => i.media_type === selectedFilter);
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

  // Highlight billboard memory (most recent photo/video)
  const spotlightMemory = useMemo(() => {
    const nonDeleted = items.filter(i => !i.deleted_at && (i.media_type === 'image' || i.media_type === 'video'));
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
          onUploadMedia={() => {
            expectExternalActivity();
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
              expectExternalActivity();
              sharedFileInputRef.current?.click();
            }}
            className="btn btn-p py-2 px-3.5 text-xs font-bold flex items-center gap-1.5 rounded-xl shadow-lg"
            title="Upload Photos or Videos"
          >
            {isUploadingSharedMedia ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Upload className="w-4 h-4" />}
            <span>Add Photos / Videos</span>
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
            placeholder="Search photos, videos, albums..."
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

      {/* Category Filter Pills */}
      <div className="px-5 py-2.5 border-b border-vault-850 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0 bg-vault-950/80">
        {[
          { id: 'all', label: 'All Media' },
          { id: 'albums', label: `Albums (${albums.length})` },
          { id: 'image', label: 'Photos' },
          { id: 'video', label: 'Videos' },
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
                  {spotlightMemory.caption || 'Shared with love'}
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
            <span className="text-xs font-medium">Loading Shared Vault…</span>
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
            <h3 className="text-sm font-bold text-white">No media found</h3>
            <p className="text-xs text-vault-400 max-w-sm mx-auto">
              Add memorable photos and videos to your Shared Vault.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  expectExternalActivity();
                  sharedFileInputRef.current?.click();
                }}
                className="btn btn-p py-2 px-4 text-xs font-semibold inline-flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                <span>Add Photos / Videos</span>
              </button>
            </div>
          </div>
        ) : layoutMode === 'magazine' ? (
          /* Magazine Feed Layout (1-Column Spacious Cards) */
          <div className="max-w-xl mx-auto space-y-5">
            {activeItems.map(item => {
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

                  {/* Card Bottom Meta Bar */}
                  <div className="p-4 flex items-center justify-between border-t border-vault-850/80">
                    <div className="space-y-0.5">
                      {item.caption && (
                        <p className="text-xs font-semibold text-white leading-snug">{item.caption}</p>
                      )}
                      <p className="text-[11px] text-vault-400 font-medium">{formatTimestamp(item.created_at)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Spacious 2-Column Grid Layout */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
            {activeItems.map(item => {
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

                  {item.caption && (
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
    </div>
  );
};
