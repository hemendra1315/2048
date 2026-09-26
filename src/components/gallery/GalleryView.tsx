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
  Heart,
  Search,
  Layers,
  Undo2,
  X,
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
import { formatDayHeading } from '../../lib/utils';
import { lightImpact, mediumImpact, selectionChange, notificationSuccess } from '../../lib/haptics';

type GridDensity = '3' | '2' | '1';
type Collection = 'photos' | 'favorites' | 'videos' | 'screenshots' | 'recent' | 'trash';

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'm4v', '3gp'];
/** Photos taken within this many ms of each other are grouped into a "Burst" stack.
 *  Purely timestamp-based — not similarity/perceptual-hash detection. */
const BURST_WINDOW_MS = 5000;
const RECENT_WINDOW_DAYS = 7;

function isVideo(item: GalleryItem): boolean {
  const source = (item.storage_path || item.image_url || '').split('?')[0].toLowerCase();
  if (source.startsWith('data:video/')) return true;
  const ext = source.slice(source.lastIndexOf('.') + 1);
  return VIDEO_EXTENSIONS.includes(ext);
}

function isScreenshot(item: GalleryItem): boolean {
  const source = (item.storage_path || item.image_url || item.caption || '').toLowerCase();
  return source.includes('screenshot') || source.includes('screen-shot') || source.includes('screen_shot');
}

interface BurstStack {
  isStack: true;
  id: string;
  items: GalleryItem[];
}
type GridEntry = GalleryItem | BurstStack;

/** Groups consecutive photos (already sorted newest-first) taken within BURST_WINDOW_MS
 *  of each other. Videos are never stacked. Min 2 items to form a stack. */
function groupBursts(items: GalleryItem[]): GridEntry[] {
  const out: GridEntry[] = [];
  let i = 0;
  while (i < items.length) {
    const current = items[i];
    if (isVideo(current)) {
      out.push(current);
      i += 1;
      continue;
    }
    const cluster: GalleryItem[] = [current];
    let j = i + 1;
    while (
      j < items.length &&
      !isVideo(items[j]) &&
      Math.abs(new Date(items[j - 1].created_at).getTime() - new Date(items[j].created_at).getTime()) <= BURST_WINDOW_MS
    ) {
      cluster.push(items[j]);
      j += 1;
    }
    if (cluster.length >= 2) {
      out.push({ isStack: true, id: `stack-${current.id}`, items: cluster });
    } else {
      out.push(current);
    }
    i = j;
  }
  return out;
}

export const GalleryView: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [collection, setCollection] = useState<Collection>('photos');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [density, setDensity] = useState<GridDensity>(() => {
    return (localStorage.getItem('gallery_density') as GridDensity) || '3';
  });
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [openStack, setOpenStack] = useState<BurstStack | null>(null);
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

  const updateItem = async (id: string, patch: Partial<Pick<GalleryItem, 'is_favorite' | 'deleted_at'>>) => {
    if (!user) return;
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)));
    if (isSupabaseConfigured()) {
      const { error } = await supabase.from('gallery_items').update(patch).eq('id', id);
      if (error) {
        console.error('Gallery update error:', error);
        showToast('Could not update photo', 'error');
        loadGallery();
      }
    }
  };

  const toggleFavorite = (item: GalleryItem) => {
    lightImpact();
    void updateItem(item.id, { is_favorite: !item.is_favorite });
  };

  const softDelete = async (item: GalleryItem) => {
    if (!user) return;
    mediumImpact();
    await updateItem(item.id, { deleted_at: new Date().toISOString() });
    setSelectedItem(null);
    showToast('Moved to Trash', 'info');
  };

  const restoreFromTrash = (item: GalleryItem) => {
    lightImpact();
    void updateItem(item.id, { deleted_at: null });
    showToast('Restored', 'success');
  };

  const permanentlyDelete = async (item: GalleryItem) => {
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
      showToast('Deleted forever', 'info');
      loadGallery();
    } catch (err) {
      console.error('Delete error:', err);
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  // In Trash, "delete" from the lightbox means permanent delete; everywhere else it's a soft delete.
  const handleLightboxDelete = (item: GalleryItem) => {
    if (collection === 'trash') void permanentlyDelete(item);
    else void softDelete(item);
  };

  const liveItems = useMemo(() => items.filter(i => !i.deleted_at), [items]);
  const trashedItems = useMemo(() => items.filter(i => i.deleted_at), [items]);

  const collectionItems = useMemo(() => {
    switch (collection) {
      case 'favorites':
        return liveItems.filter(i => i.is_favorite);
      case 'videos':
        return liveItems.filter(isVideo);
      case 'screenshots':
        return liveItems.filter(isScreenshot);
      case 'recent':
        return liveItems.filter(i => (Date.now() - new Date(i.created_at).getTime()) / 86400000 <= RECENT_WINDOW_DAYS);
      case 'trash':
        return trashedItems;
      default:
        return liveItems;
    }
  }, [collection, liveItems, trashedItems]);

  const searchedItems = useMemo(() => {
    if (!searchOpen || !searchQuery.trim()) return collectionItems;
    const q = searchQuery.trim().toLowerCase();
    return collectionItems.filter(i => {
      if (i.caption?.toLowerCase().includes(q)) return true;
      if (q === 'favorite' || q === 'favorites') return Boolean(i.is_favorite);
      if (q === 'video' || q === 'videos') return isVideo(i);
      if (q === 'photo' || q === 'photos') return !isVideo(i);
      if (q === 'screenshot' || q === 'screenshots') return isScreenshot(i);
      const dateLabel = new Date(i.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric', day: 'numeric' }).toLowerCase();
      return dateLabel.includes(q);
    });
  }, [collectionItems, searchOpen, searchQuery]);

  const videoCount = liveItems.filter(isVideo).length;
  const photoCount = liveItems.length - videoCount;
  const favoriteCount = liveItems.filter(i => i.is_favorite).length;

  const { urls, retry } = useGalleryUrls(items);

  // Two-level grouping: month header, day sub-header, with Burst stacks derived per day.
  const groupedByMonth = useMemo(() => {
    const months = new Map<string, Map<string, GalleryItem[]>>();
    for (const item of searchedItems) {
      const d = new Date(item.created_at || Date.now());
      const monthKey = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }).toUpperCase();
      const dayKey = formatDayHeading(item.created_at);
      if (!months.has(monthKey)) months.set(monthKey, new Map());
      const days = months.get(monthKey)!;
      if (!days.has(dayKey)) days.set(dayKey, []);
      days.get(dayKey)!.push(item);
    }
    return Array.from(months.entries()).map(([monthLabel, days]) => ({
      monthLabel,
      days: Array.from(days.entries()).map(([dayLabel, dayItems]) => ({
        dayLabel,
        entries: collection === 'trash' ? dayItems : groupBursts(dayItems),
      })),
    }));
  }, [searchedItems, collection]);

  const periodKeys = useMemo(() => groupedByMonth.map(m => m.monthLabel), [groupedByMonth]);

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
    if (selectedIds.size === searchedItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(searchedItems.map(i => i.id)));
    }
  };

  const handleBatchDelete = async () => {
    if (!user || selectedIds.size === 0) return;
    mediumImpact();
    const idsToDelete = Array.from(selectedIds);

    try {
      if (collection === 'trash') {
        const itemsToDelete = items.filter(i => selectedIds.has(i.id));
        if (isSupabaseConfigured()) {
          const { error } = await supabase.from('gallery_items').delete().in('id', idsToDelete);
          if (error) throw error;
          const paths = itemsToDelete.map(i => i.storage_path).filter((p): p is string => Boolean(p));
          if (paths.length > 0) await supabase.storage.from('gallery').remove(paths);
        } else {
          idsToDelete.forEach(id => mockBackend.deleteGalleryItem(id, user.id));
        }
        showToast(`Permanently deleted ${idsToDelete.length} items`, 'info');
      } else {
        if (isSupabaseConfigured()) {
          const { error } = await supabase.from('gallery_items').update({ deleted_at: new Date().toISOString() }).in('id', idsToDelete);
          if (error) throw error;
        } else {
          setItems(prev => prev.map(i => (idsToDelete.includes(i.id) ? { ...i, deleted_at: new Date().toISOString() } : i)));
        }
        showToast(`Moved ${idsToDelete.length} items to Trash`, 'info');
      }

      notificationSuccess();
      setSelectedIds(new Set());
      setIsSelectMode(false);
      setConfirmBatchDelete(false);
      loadGallery();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  const handleBatchFavorite = async () => {
    if (selectedIds.size === 0) return;
    lightImpact();
    const ids = Array.from(selectedIds);
    setItems(prev => prev.map(i => (ids.includes(i.id) ? { ...i, is_favorite: true } : i)));
    if (isSupabaseConfigured()) {
      await supabase.from('gallery_items').update({ is_favorite: true }).in('id', ids);
    }
    showToast(`Added ${ids.length} to Favorites`, 'success');
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
  useBackHandler(Boolean(openStack), () => setOpenStack(null));
  useBackHandler(uploadModalOpen, () => setUploadModalOpen(false));
  useBackHandler(searchOpen, () => { setSearchOpen(false); setSearchQuery(''); });

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

  const collections: { id: Collection; label: string; count?: number }[] = [
    { id: 'photos', label: 'Photos', count: photoCount },
    { id: 'favorites', label: 'Favorites', count: favoriteCount },
    { id: 'videos', label: 'Videos', count: videoCount },
    { id: 'screenshots', label: 'Screenshots' },
    { id: 'recent', label: 'Recently Added' },
    { id: 'trash', label: 'Trash', count: trashedItems.length },
  ];

  const renderTile = (entry: GridEntry) => {
    if ('isStack' in entry) {
      const cover = entry.items[0];
      const isSelected = entry.items.every(i => selectedIds.has(i.id));
      return (
        <button
          key={entry.id}
          type="button"
          onClick={() => {
            if (isSelectMode) {
              selectionChange();
              setSelectedIds(prev => {
                const next = new Set(prev);
                entry.items.forEach(i => (isSelected ? next.delete(i.id) : next.add(i.id)));
                return next;
              });
            } else {
              lightImpact();
              setOpenStack(entry);
            }
          }}
          aria-label={`Burst of ${entry.items.length} photos taken close together`}
          className={`group relative ${itemAspectClass} overflow-hidden bg-vault-900 border transition-all cursor-pointer p-0 shadow-sm ${
            isSelected ? 'ring-2 ring-emerald ring-offset-2 ring-offset-vault-950 scale-[0.94] border-emerald' : 'border-vault-800 hover:border-vault-600'
          }`}
        >
          <MediaImage
            state={urls[cover.id] ?? { status: 'loading' }}
            alt={cover.caption || 'Burst photo stack'}
            imgClassName="w-full h-full object-cover"
            onRetry={() => retry(cover.storage_path)}
            compact
          />
          <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold">
            <Layers className="w-3 h-3" aria-hidden />
            {entry.items.length}
          </div>
          {isSelectMode && (
            <div className="absolute top-1.5 left-1.5 z-10">
              {isSelected ? (
                <div className="w-6 h-6 rounded-full bg-emerald text-vault-950 flex items-center justify-center shadow-md">
                  <Check className="w-4 h-4 stroke-[3]" />
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full border-2 border-white/60 bg-black/40 backdrop-blur-sm shadow-md" />
              )}
            </div>
          )}
        </button>
      );
    }

    const item = entry;
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

        {item.is_favorite && (
          <div className="absolute top-1.5 right-1.5 z-10">
            <Heart className="w-4 h-4 text-rose-400 fill-rose-400 drop-shadow" aria-label="Favorite" />
          </div>
        )}

        {isSelectMode && (
          <div className="absolute top-2 left-2 z-10">
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
  };

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
              : `${liveItems.length} ${liveItems.length === 1 ? 'media item' : 'media items'} in Vault`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isSelectMode && !searchOpen && (
            <button
              type="button"
              onClick={() => { lightImpact(); setSearchOpen(true); }}
              className="ib ib-s rounded-xl"
              aria-label="Search gallery"
              title="Search"
            >
              <Search className="i" aria-hidden />
            </button>
          )}

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

      {searchOpen && (
        <div className="flex items-center gap-2 anim-sheet">
          <label className="search flex-1">
            <Search className="i i-sm" aria-hidden />
            <input
              type="text"
              autoFocus
              placeholder="Search captions, dates, favorites, videos…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="flex-1 min-w-0 bg-transparent border-0 outline-none text-vault-50 text-[15px]"
            />
          </label>
          <button
            type="button"
            onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
            className="ib ib-s"
            aria-label="Close search"
          >
            <X className="i" aria-hidden />
          </button>
        </div>
      )}

      {/* Collections Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar" role="tablist" aria-label="Gallery collections">
        {collections.map(c => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={collection === c.id}
            onClick={() => { selectionChange(); setCollection(c.id); }}
            className={`chip ${collection === c.id ? 'chip-on' : ''} ${c.id === 'trash' ? '!text-rose-300' : ''}`}
          >
            {c.label} {typeof c.count === 'number' && c.count > 0 && <span className="opacity-80 font-mono">({c.count})</span>}
          </button>
        ))}
      </div>

      {collection === 'trash' && trashedItems.length > 0 && (
        <p className="t-cap c3 -mt-2 flex items-center gap-1.5">
          <AlertCircle className="w-3 h-3" aria-hidden />
          Items in Trash are permanently deleted after 30 days.
        </p>
      )}

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
      ) : searchedItems.length === 0 ? (
        <div className="card p-8 flex flex-col items-center justify-center text-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-vault-850 border border-vault-700 flex items-center justify-center text-vault-400">
            {collection === 'trash' ? <Trash2 className="w-8 h-8" aria-hidden /> : <ImageIcon className="w-8 h-8" aria-hidden />}
          </div>
          <h2 className="t-h2 m-0">
            {searchOpen && searchQuery ? 'No matches' : collection === 'trash' ? 'Trash is empty' : 'No media found'}
          </h2>
          <p className="t-sm c2 max-w-xs m-0">
            {searchOpen && searchQuery
              ? 'Try a different search term.'
              : collection === 'photos'
              ? 'Use the Camera tab or tap Add Media to build your personal photo library.'
              : `No items in ${collections.find(c => c.id === collection)?.label}.`}
          </p>
          {collection === 'photos' && !searchQuery && (
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
          {groupedByMonth.map(({ monthLabel, days }) => (
            <section key={monthLabel} className="flex flex-col gap-4">
              <div className="sticky top-0 z-10 glass-header px-3 py-2 rounded-xl flex items-center justify-between shadow-sm">
                <h2 className="t-over font-bold text-vault-200 tracking-wider m-0">{monthLabel}</h2>
              </div>
              {days.map(({ dayLabel, entries }) => (
                <div key={dayLabel} className="flex flex-col gap-2">
                  <h3 className="t-cap text-vault-400 font-semibold px-1 m-0">{dayLabel}</h3>
                  <div className={gridClass}>{entries.map(renderTile)}</div>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}

      {/* Fast-Scroll Timeline Scrubber (Right Edge) */}
      {searchedItems.length > 6 && !isSelectMode && (
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
            <span>{selectedIds.size === searchedItems.length ? 'Deselect All' : 'Select All'}</span>
          </button>

          <div className="flex items-center gap-1.5">
            {collection !== 'trash' && (
              <button
                type="button"
                onClick={() => void handleBatchFavorite()}
                className="ib ib-s rounded-xl !w-10 !h-10 text-vault-200 hover:text-white"
                title="Add to Favorites"
                aria-label="Add to Favorites"
              >
                <Heart className="w-4 h-4" />
              </button>
            )}
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
              title={collection === 'trash' ? 'Delete forever' : 'Move to Trash'}
              aria-label={collection === 'trash' ? 'Delete forever' : 'Move to Trash'}
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
              <h3 className="t-h3 font-bold text-white m-0">
                {collection === 'trash' ? `Delete ${selectedIds.size} items forever?` : `Move ${selectedIds.size} items to Trash?`}
              </h3>
              <p className="text-xs text-vault-400 mt-1.5 m-0">
                {collection === 'trash'
                  ? 'This cannot be undone.'
                  : 'You can restore these from Trash within 30 days.'}
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
                {collection === 'trash' ? 'Delete Forever' : 'Move to Trash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Burst Stack Viewer */}
      {openStack && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Burst photo stack"
          className="fixed inset-0 z-50 bg-vault-950 flex flex-col anim-fade"
        >
          <div className="flex items-center justify-between p-4 border-b border-vault-800 shrink-0">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald" aria-hidden />
              <h2 className="t-h3 m-0">Burst · {openStack.items.length} photos</h2>
            </div>
            <button type="button" onClick={() => setOpenStack(null)} className="ib ib-s" aria-label="Close stack">
              <X className="i" aria-hidden />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <div className="grid grid-cols-3 gap-1.5">
              {openStack.items.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { setOpenStack(null); setSelectedItem(item); }}
                  className="relative aspect-square overflow-hidden rounded-lg bg-vault-900 border border-vault-800"
                >
                  <MediaImage
                    state={urls[item.id] ?? { status: 'loading' }}
                    alt={item.caption || 'Burst photo'}
                    imgClassName="w-full h-full object-cover"
                    onRetry={() => retry(item.storage_path)}
                    compact
                  />
                  {item.is_favorite && (
                    <Heart className="absolute top-1 right-1 w-3.5 h-3.5 text-rose-400 fill-rose-400 drop-shadow" />
                  )}
                </button>
              ))}
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
        onDelete={handleLightboxDelete}
        onToggleFavorite={toggleFavorite}
        onRestore={collection === 'trash' ? restoreFromTrash : undefined}
      />

      {/* Upload Bottom Sheet */}
      <UploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onUploadSuccess={loadGallery}
      />

      {/* Restore-from-trash quick action while browsing the grid in select mode */}
      {collection === 'trash' && isSelectMode && selectedIds.size > 0 && (
        <button
          type="button"
          onClick={() => {
            const ids = Array.from(selectedIds);
            ids.forEach(id => {
              const item = items.find(i => i.id === id);
              if (item) restoreFromTrash(item);
            });
            setSelectedIds(new Set());
            setIsSelectMode(false);
          }}
          className="fixed inset-x-4 bottom-36 z-40 max-w-md mx-auto btn btn-p btn-block gap-2 shadow-2xl"
        >
          <Undo2 className="w-4 h-4" aria-hidden />
          Restore {selectedIds.size} item{selectedIds.size === 1 ? '' : 's'}
        </button>
      )}
    </div>
  );
};
