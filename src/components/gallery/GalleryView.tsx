import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Image as ImageIcon,
  Upload,
  AlertCircle,
  RotateCcw,
  Grid3X3,
  LayoutGrid,
  Square,
  Check,
  CheckSquare,
  Trash2,
  Share2,
  Download,
} from 'lucide-react';
import { GalleryItem } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { uniqueChannelName } from '../../lib/realtime';
import { mockBackend } from '../../lib/mockBackend';
import { useGalleryUrls } from '../../lib/mediaUrls';
import { MediaImage } from '../common/MediaImage';
import { UploadModal } from './UploadModal';
import { LightboxViewer } from './LightboxViewer';
import { useBackHandler } from '../../lib/backButton';
import { lightImpact, mediumImpact, selectionChange, notificationSuccess } from '../../lib/haptics';

type GalleryFilter = 'all' | 'photos' | 'videos';
type GridDensity = '3' | '2' | '1';

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'm4v', '3gp'];

function isVideo(item: GalleryItem): boolean {
  const source = (item.storage_path || item.image_url || '').split('?')[0].toLowerCase();
  if (source.startsWith('data:video/')) return true;
  const ext = source.slice(source.lastIndexOf('.') + 1);
  return VIDEO_EXTENSIONS.includes(ext);
}

export const GalleryView: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [filter, setFilter] = useState<GalleryFilter>('all');
  const [density, setDensity] = useState<GridDensity>(() => {
    return (localStorage.getItem('gallery_density') as GridDensity) || '3';
  });
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  // Multi-select state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);

  // Scrubber & Timeline state
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubberPeriod, setScrubberPeriod] = useState<string>('');
  const [scrubberProgress, setScrubberProgress] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrubberTrackRef = useRef<HTMLDivElement>(null);
  const lastScrubbedPeriodRef = useRef<string>('');
  const lastHapticTimeRef = useRef<number>(0);
  const isDraggingSelectionRef = useRef(false);
  const dragSelectionStartIdRef = useRef<string | null>(null);

  const loadGallery = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(null);
    try {
      if (isSupabaseConfigured()) {
        const { data, error } = await supabase
          .from('gallery_items')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setItems((data ?? []) as unknown as GalleryItem[]);
      } else {
        const list = mockBackend.getGallery(user.id);
        setItems(list);
      }
    } catch (err) {
      console.error('Failed to load gallery:', err);
      setLoadError('Your photos could not be loaded. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const userId = user?.id;

  useEffect(() => {
    loadGallery();

    if (!isSupabaseConfigured()) {
      const unsub = mockBackend.subscribe('gallery:updated', () => loadGallery());
      return unsub;
    } else {
      const channel = supabase
        .channel(uniqueChannelName('gallery_items'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'gallery_items', filter: `user_id=eq.${userId}` }, () => {
          loadGallery();
        })
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [loadGallery, userId]);

  const handleDensityChange = (newDensity: GridDensity) => {
    selectionChange();
    setDensity(newDensity);
    localStorage.setItem('gallery_density', newDensity);
  };

  const handleFilterChange = (newFilter: GalleryFilter) => {
    selectionChange();
    setFilter(newFilter);
  };

  const handleDelete = async (item: GalleryItem) => {
    if (!user) return;
    try {
      if (isSupabaseConfigured()) {
        const { error } = await supabase.from('gallery_items').delete().eq('id', item.id);
        if (error) throw error;
        if (item.storage_path) {
          const { error: storageError } = await supabase.storage.from('gallery').remove([item.storage_path]);
          if (storageError) console.warn('[gallery] file cleanup failed', storageError.message);
        }
      } else {
        mockBackend.deleteGalleryItem(item.id, user.id);
      }
      setSelectedItem(null);
      showToast('Photo removed from Gallery', 'info');
      loadGallery();
    } catch (err) {
      console.error('Delete error:', err);
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (filter === 'photos') return !isVideo(item);
      if (filter === 'videos') return isVideo(item);
      return true;
    });
  }, [items, filter]);

  const videoCount = items.filter(isVideo).length;
  const photoCount = items.length - videoCount;

  const { urls, retry } = useGalleryUrls(items);

  // Group items by relative period (This Week, This Month, or Month Year)
  const groupedItems = useMemo(() => {
    return filteredItems.reduce((acc, item) => {
      const d = new Date(item.created_at || Date.now());
      const now = new Date();
      const diffDays = (now.getTime() - d.getTime()) / (1000 * 3600 * 24);

      let key = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }).toUpperCase();
      if (diffDays <= 7) key = 'THIS WEEK';
      else if (diffDays <= 30) key = 'THIS MONTH';

      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {} as Record<string, GalleryItem[]>);
  }, [filteredItems]);

  const periodKeys = useMemo(() => Object.keys(groupedItems), [groupedItems]);

  // Scrubber calculation & gesture handling
  const updateScrubberPosition = useCallback(
    (clientY: number) => {
      const track = scrubberTrackRef.current;
      const container = scrollContainerRef.current || document.documentElement;
      if (!track) return;

      const rect = track.getBoundingClientRect();
      const clampedY = Math.max(0, Math.min(rect.height, clientY - rect.top));
      const progress = clampedY / rect.height;
      setScrubberProgress(progress);

      const maxScroll = (container === document.documentElement ? document.documentElement.scrollHeight - window.innerHeight : container.scrollHeight - container.clientHeight);
      if (maxScroll > 0) {
        const targetScroll = progress * maxScroll;
        window.scrollTo({ top: targetScroll, behavior: 'auto' });
      }

      // Find period based on progress
      if (periodKeys.length > 0) {
        const index = Math.min(periodKeys.length - 1, Math.floor(progress * periodKeys.length));
        const activePeriod = periodKeys[index];
        setScrubberPeriod(activePeriod);

        if (activePeriod !== lastScrubbedPeriodRef.current) {
          lastScrubbedPeriodRef.current = activePeriod;
          const now = Date.now();
          if (now - lastHapticTimeRef.current > 120) {
            lastHapticTimeRef.current = now;
            selectionChange();
          }
        }
      }
    },
    [periodKeys],
  );

  const handleScrubberTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    setIsScrubbing(true);
    lightImpact();
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    updateScrubberPosition(clientY);
  };

  const handleScrubberTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isScrubbing) return;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    requestAnimationFrame(() => updateScrubberPosition(clientY));
  };

  const handleScrubberTouchEnd = () => {
    setIsScrubbing(false);
  };

  // Multi-Select Handlers
  const toggleItemSelection = (id: string) => {
    selectionChange();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    selectionChange();
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map(i => i.id)));
    }
  };

  const handleBatchDelete = async () => {
    if (!user || selectedIds.size === 0) return;
    mediumImpact();
    const idsToDelete = Array.from(selectedIds);
    const itemsToDelete = items.filter(i => selectedIds.has(i.id));

    try {
      if (isSupabaseConfigured()) {
        const { error } = await supabase.from('gallery_items').delete().in('id', idsToDelete);
        if (error) throw error;
        const paths = itemsToDelete.map(i => i.storage_path).filter((p): p is string => Boolean(p));
        if (paths.length > 0) {
          await supabase.storage.from('gallery').remove(paths);
        }
      } else {
        idsToDelete.forEach(id => mockBackend.deleteGalleryItem(id, user.id));
      }

      showToast(`Removed ${idsToDelete.length} photos`, 'info');
      notificationSuccess();
      setSelectedIds(new Set());
      setIsSelectMode(false);
      setConfirmBatchDelete(false);
      loadGallery();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  const handleBatchShare = async () => {
    if (selectedIds.size === 0) return;
    lightImpact();
    const selectedItems = items.filter(i => selectedIds.has(i.id));
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Shared from Games Vault',
          text: `Sharing ${selectedItems.length} photos from Games Vault`,
        });
        notificationSuccess();
      } catch {
        // User cancelled share
      }
    } else {
      showToast(`${selectedItems.length} photos selected for sharing`, 'info');
      notificationSuccess();
    }
  };

  const handleBatchDownload = () => {
    if (selectedIds.size === 0) return;
    lightImpact();
    const selectedItems = items.filter(i => selectedIds.has(i.id));
    selectedItems.forEach((item, idx) => {
      const state = urls[item.id];
      const url = state?.status === 'ready' ? state.url : item.image_url;
      if (url) {
        const link = document.createElement('a');
        link.href = url;
        link.download = `vault-photo-${item.id}.jpg`;
        link.target = '_blank';
        document.body.appendChild(link);
        setTimeout(() => {
          link.click();
          document.body.removeChild(link);
        }, idx * 200);
      }
    });
    showToast(`Downloading ${selectedItems.length} photos`, 'success');
    notificationSuccess();
  };

  // Continuous drag selection handling
  const handleGridPointerMove = (e: React.PointerEvent) => {
    if (!isSelectMode || !isDraggingSelectionRef.current) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const itemButton = target?.closest('[data-gallery-id]') as HTMLElement | null;
    if (itemButton) {
      const id = itemButton.dataset.galleryId;
      if (id && !selectedIds.has(id)) {
        selectionChange();
        setSelectedIds(prev => new Set(prev).add(id));
      }
    }
  };

  useBackHandler(isSelectMode, () => {
    setIsSelectMode(false);
    setSelectedIds(new Set());
  });
  useBackHandler(Boolean(selectedItem), () => setSelectedItem(null));
  useBackHandler(uploadModalOpen, () => setUploadModalOpen(false));

  const gridClass =
    density === '1'
      ? 'grid grid-cols-1 gap-4 max-w-md mx-auto'
      : density === '2'
      ? 'grid grid-cols-2 gap-2.5 sm:gap-3'
      : 'grid grid-cols-3 gap-1.5 sm:gap-2';

  const itemAspectClass =
    density === '1'
      ? 'aspect-[4/3] rounded-2xl'
      : density === '2'
      ? 'aspect-[4/5] rounded-xl'
      : 'aspect-square rounded-lg sm:rounded-xl';

  return (
    <div
      className="relative flex flex-col gap-4 pb-20 animate-fade-in select-none"
      ref={scrollContainerRef}
    >
      {/* Top Header & View Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="t-h1 m-0">Gallery</h1>
          <p className="t-cap c3 mt-0.5">
            {isSelectMode
              ? `${selectedIds.size} selected`
              : `${items.length} ${items.length === 1 ? 'media item' : 'media items'} in Vault`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Select Mode Toggle */}
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => {
                lightImpact();
                setIsSelectMode(prev => {
                  if (prev) setSelectedIds(new Set());
                  return !prev;
                });
              }}
              className={`btn btn-sm ${
                isSelectMode ? 'btn-p font-bold' : 'btn-s text-vault-200'
              }`}
            >
              {isSelectMode ? 'Done' : 'Select'}
            </button>
          )}

          {/* Density Switcher */}
          {!isSelectMode && (
            <div className="flex items-center bg-vault-900 border border-vault-800 p-0.5 rounded-xl">
              <button
                type="button"
                onClick={() => handleDensityChange('3')}
                className={`p-1.5 rounded-lg transition-colors ${
                  density === '3' ? 'bg-emerald text-vault-950 shadow-sm' : 'text-vault-400 hover:text-white'
                }`}
                title="3-Column Grid"
                aria-label="3-Column Grid"
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleDensityChange('2')}
                className={`p-1.5 rounded-lg transition-colors ${
                  density === '2' ? 'bg-emerald text-vault-950 shadow-sm' : 'text-vault-400 hover:text-white'
                }`}
                title="2-Column Editorial"
                aria-label="2-Column Editorial"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleDensityChange('1')}
                className={`p-1.5 rounded-lg transition-colors ${
                  density === '1' ? 'bg-emerald text-vault-950 shadow-sm' : 'text-vault-400 hover:text-white'
                }`}
                title="1-Column Cinematic"
                aria-label="1-Column Cinematic"
              >
                <Square className="w-4 h-4" />
              </button>
            </div>
          )}

          {!isSelectMode && (
            <button
              type="button"
              onClick={() => {
                lightImpact();
                setUploadModalOpen(true);
              }}
              className="ib ib-s rounded-xl"
              aria-label="Upload photo"
              title="Upload photo"
            >
              <Upload className="i" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* Filter Chips Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar" role="tablist" aria-label="Gallery filters">
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'all'}
          onClick={() => handleFilterChange('all')}
          className={`chip ${filter === 'all' ? 'chip-on' : ''}`}
        >
          All {items.length > 0 && <span className="opacity-80 font-mono">({items.length})</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'photos'}
          onClick={() => handleFilterChange('photos')}
          className={`chip ${filter === 'photos' ? 'chip-on' : ''}`}
        >
          Photos {photoCount > 0 && <span className="opacity-80 font-mono">({photoCount})</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'videos'}
          onClick={() => handleFilterChange('videos')}
          className={`chip ${filter === 'videos' ? 'chip-on' : ''}`}
        >
          Videos {videoCount > 0 && <span className="opacity-80 font-mono">({videoCount})</span>}
        </button>
      </div>

      {/* Gallery Content with Sticky Timeline Headers */}
      {loading && items.length === 0 ? (
        <div className={gridClass} role="status" aria-label="Loading gallery">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className={`shimmer-skeleton ${itemAspectClass}`} />
          ))}
        </div>
      ) : loadError && items.length === 0 ? (
        <div className="card p-8 flex flex-col items-center justify-center text-center gap-3" role="alert">
          <div className="w-16 h-16 rounded-2xl bg-vault-850 border border-vault-700 flex items-center justify-center text-amber-400">
            <AlertCircle className="w-8 h-8" aria-hidden />
          </div>
          <h2 className="t-h2 m-0">Couldn't load your gallery</h2>
          <p className="t-sm c2 max-w-xs m-0">{loadError}</p>
          <button type="button" onClick={loadGallery} className="btn btn-s mt-2">
            <RotateCcw className="i i-sm" aria-hidden />
            <span>Try again</span>
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="card p-8 flex flex-col items-center justify-center text-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-vault-850 border border-vault-700 flex items-center justify-center text-vault-400">
            <ImageIcon className="w-8 h-8" aria-hidden />
          </div>
          <h2 className="t-h2 m-0">No media found</h2>
          <p className="t-sm c2 max-w-xs m-0">
            {filter === 'all'
              ? 'Use the Camera tab or tap Add Media to build your personal photo library.'
              : `No items found matching the "${filter}" filter.`}
          </p>
          {filter === 'all' && (
            <button
              type="button"
              onClick={() => {
                lightImpact();
                setUploadModalOpen(true);
              }}
              className="btn btn-p mt-2"
            >
              <Upload className="i i-sm" aria-hidden />
              <span>Upload Photo</span>
            </button>
          )}
        </div>
      ) : (
        <div
          className="flex flex-col gap-6"
          onPointerMove={handleGridPointerMove}
          onPointerUp={() => { isDraggingSelectionRef.current = false; }}
          onPointerCancel={() => { isDraggingSelectionRef.current = false; }}
        >
          {Object.entries(groupedItems).map(([periodLabel, periodItems]) => (
            <section key={periodLabel} className="flex flex-col gap-2">
              {/* Sticky Frosted Header */}
              <div className="sticky top-0 z-10 glass-header px-3 py-2 rounded-xl flex items-center justify-between mb-1 shadow-sm">
                <h2 className="t-over font-bold text-vault-200 tracking-wider m-0">{periodLabel}</h2>
                <span className="text-[11px] font-mono text-vault-400">{periodItems.length} items</span>
              </div>

              <div className={gridClass}>
                {periodItems.map(item => {
                  const isSelected = selectedIds.has(item.id);

                  return (
                    <button
                      key={item.id}
                      data-gallery-id={item.id}
                      type="button"
                      onPointerDown={() => {
                        if (isSelectMode) {
                          isDraggingSelectionRef.current = true;
                          dragSelectionStartIdRef.current = item.id;
                          toggleItemSelection(item.id);
                        }
                      }}
                      onClick={() => {
                        if (!isSelectMode) {
                          lightImpact();
                          setSelectedItem(item);
                        }
                      }}
                      aria-label={item.caption || 'Open photo'}
                      aria-selected={isSelected}
                      className={`group relative ${itemAspectClass} overflow-hidden bg-vault-900 border transition-all cursor-pointer p-0 shadow-sm ${
                        isSelected
                          ? 'ring-2 ring-emerald ring-offset-2 ring-offset-vault-950 scale-[0.94] border-emerald'
                          : 'border-vault-800 hover:border-vault-600'
                      }`}
                    >
                      <MediaImage
                        state={urls[item.id] ?? { status: 'loading' }}
                        alt={item.caption || 'Gallery photo'}
                        imgClassName={`w-full h-full object-cover transition-transform duration-300 ${
                          isSelected ? 'brightness-90' : 'group-hover:scale-105'
                        }`}
                        onRetry={() => retry(item.storage_path)}
                        compact
                      />

                      {/* Select Mode Check Badge */}
                      {isSelectMode && (
                        <div className="absolute top-2 right-2 z-10">
                          {isSelected ? (
                            <div className="w-6 h-6 rounded-full bg-emerald text-vault-950 flex items-center justify-center shadow-md animate-spring-pop">
                              <Check className="w-4 h-4 stroke-[3]" />
                            </div>
                          ) : (
                            <div className="w-6 h-6 rounded-full border-2 border-white/60 bg-black/40 backdrop-blur-sm shadow-md" />
                          )}
                        </div>
                      )}

                      {density === '1' && item.caption && !isSelectMode && (
                        <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 to-transparent text-left">
                          <p className="text-sm font-semibold text-white truncate m-0">{item.caption}</p>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Fast-Scroll Timeline Scrubber (Right Edge) */}
      {filteredItems.length > 6 && !isSelectMode && (
        <div
          ref={scrubberTrackRef}
          onTouchStart={handleScrubberTouchStart}
          onTouchMove={handleScrubberTouchMove}
          onTouchEnd={handleScrubberTouchEnd}
          onMouseDown={handleScrubberTouchStart}
          onMouseMove={handleScrubberTouchMove}
          onMouseUp={handleScrubberTouchEnd}
          className="fixed right-1 top-24 bottom-24 w-8 flex flex-col items-center justify-center z-30 touch-none select-none cursor-pointer"
        >
          <div className="w-1.5 h-full bg-white/10 rounded-full overflow-hidden relative backdrop-blur-sm">
            <div
              className="w-full bg-emerald rounded-full transition-all duration-75"
              style={{
                height: '24px',
                transform: `translateY(${scrubberProgress * (window.innerHeight - 240)}px)`,
              }}
            />
          </div>

          {/* Floating Frosted Date Pill */}
          {isScrubbing && scrubberPeriod && (
            <div className="absolute right-10 top-1/2 -translate-y-1/2 glass-pill px-4 py-2 rounded-2xl text-xs font-bold text-white shadow-2xl flex items-center gap-2 whitespace-nowrap anim-spring-pop">
              <span className="w-2 h-2 rounded-full bg-emerald animate-pulse" />
              <span>{scrubberPeriod}</span>
            </div>
          )}
        </div>
      )}

      {/* Multi-Select Floating Action Bar */}
      {isSelectMode && selectedIds.size > 0 && (
        <div className="fixed inset-x-4 bottom-20 z-40 max-w-md mx-auto glass-panel border border-white/[0.12] rounded-2xl p-2.5 flex items-center justify-between shadow-2xl anim-sheet">
          <button
            type="button"
            onClick={selectAll}
            className="btn btn-g btn-sm text-xs gap-1.5 text-vault-200"
          >
            <CheckSquare className="w-4 h-4" />
            <span>{selectedIds.size === filteredItems.length ? 'Deselect All' : 'Select All'}</span>
          </button>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleBatchDownload}
              className="ib ib-s rounded-xl !w-10 !h-10 text-vault-200 hover:text-white"
              title="Download selected"
              aria-label="Download selected"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleBatchShare}
              className="ib ib-s rounded-xl !w-10 !h-10 text-vault-200 hover:text-white"
              title="Share selected"
              aria-label="Share selected"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setConfirmBatchDelete(true)}
              className="ib ib-s rounded-xl !w-10 !h-10 !text-rose-400 hover:!bg-rose-950/40"
              title="Delete selected"
              aria-label="Delete selected"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Batch Delete Confirmation Dialog */}
      {confirmBatchDelete && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 anim-fade"
          onClick={() => setConfirmBatchDelete(false)}
        >
          <div
            className="w-full max-w-xs glass-panel rounded-2xl p-5 shadow-2xl text-center space-y-4 anim-modal"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-rose-950/60 border border-rose-600/40 text-rose-400 mx-auto flex items-center justify-center">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="t-h3 font-bold text-white m-0">Delete {selectedIds.size} items?</h3>
              <p className="text-xs text-vault-400 mt-1.5 m-0">
                These photos will be permanently removed from your personal vault.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmBatchDelete(false)}
                className="btn btn-s flex-1 btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBatchDelete}
                className="btn btn-d flex-1 btn-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox / Expanded Viewer */}
      <LightboxViewer
        item={selectedItem}
        mediaState={selectedItem ? urls[selectedItem.id] ?? { status: 'loading' } : undefined}
        onRetry={selectedItem ? () => retry(selectedItem.storage_path) : undefined}
        onClose={() => setSelectedItem(null)}
        onDelete={handleDelete}
      />

      {/* Upload Bottom Sheet */}
      <UploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onUploadSuccess={loadGallery}
      />
    </div>
  );
};
