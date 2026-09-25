import React, { useState, useEffect, useCallback } from 'react';
import {
  Image as ImageIcon,
  Plus,
  Calendar,
  Grid,
  FolderHeart,
  Share2,
  Trash2,
  Layers,
  Sparkles,
  UploadCloud,
  Camera,
} from 'lucide-react';
import { GalleryItem } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase, isSupabaseConfigured, signGalleryUrls } from '../../lib/supabase';
import { mockBackend } from '../../lib/mockBackend';
import { handleImageError } from '../../lib/utils';
import { UploadModal } from './UploadModal';

type GalleryTab = 'all' | 'photos' | 'videos' | 'albums' | 'shared';

interface GalleryViewProps {
  onOpenCamera?: () => void;
}

export const GalleryView: React.FC<GalleryViewProps> = ({ onOpenCamera }) => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<GalleryTab>('all');
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const loadGallery = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      if (isSupabaseConfigured()) {
        const { data, error } = await supabase
          .from('gallery_items')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (data) setItems(await signGalleryUrls(data as unknown as GalleryItem[]));
      } else {
        const list = mockBackend.getGallery(user.id);
        setItems(list);
      }
    } catch (err) {
      console.error('Failed to load gallery:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadGallery();

    if (!isSupabaseConfigured()) {
      const unsub = mockBackend.subscribe('gallery:updated', () => loadGallery());
      return unsub;
    } else {
      const channel = supabase
        .channel(`public:gallery_items:${crypto.randomUUID()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'gallery_items' }, () => {
          loadGallery();
        })
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [loadGallery]);

  const handleDelete = async (item: GalleryItem) => {
    if (!user) return;
    try {
      if (isSupabaseConfigured()) {
        await supabase.from('gallery_items').delete().eq('id', item.id);
        if (item.storage_path) {
          await supabase.storage.from('gallery').remove([item.storage_path]);
        }
      } else {
        mockBackend.deleteGalleryItem(item.id, user.id);
      }
      setSelectedItem(null);
      showToast('Photo removed from Gallery', 'info');
      loadGallery();
    } catch (err) {
      console.error('Delete error:', err);
      showToast('Delete failed', 'error');
    }
  };

  // Group items by date for Apple Photos-style timeline
  const groupedItems = items.reduce((acc, item) => {
    const date = new Date(item.created_at || Date.now());
    const dateKey = date.toLocaleDateString(undefined, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(item);
    return acc;
  }, {} as Record<string, GalleryItem[]>);

  return (
    <div className="space-y-4 pb-20 animate-fade-in select-none">
      {/* Header & Apple Photos Segment Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Personal Gallery</h2>
          <p className="text-xs text-[#A1A1AA]">Organized media library & albums</p>
        </div>

        <div className="flex items-center gap-2">
          {onOpenCamera && (
            <button
              onClick={onOpenCamera}
              className="flex items-center justify-center p-2.5 bg-[#171717] hover:bg-[#222222] border border-[#262626] hover:border-[#10B981] rounded-xl text-zinc-300 hover:text-[#10B981] transition-all active:scale-95"
              title="Open Camera"
            >
              <Camera className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setUploadModalOpen(true)}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-[#171717] hover:bg-[#222222] border border-[#262626] hover:border-[#10B981] rounded-xl text-xs font-semibold text-white transition-all active:scale-95 shadow-md"
          >
            <Plus className="w-4 h-4 text-[#10B981]" />
            <span>Add Media</span>
          </button>
        </div>
      </div>

      {/* Segmented Control Bar */}
      <div className="flex items-center gap-1.5 p-1 bg-[#111111] border border-[#262626] rounded-xl overflow-x-auto">
        <button
          onClick={() => setActiveTab('all')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
            activeTab === 'all'
              ? 'bg-[#171717] text-white border border-[#262626] shadow-sm'
              : 'text-[#A1A1AA] hover:text-white'
          }`}
        >
          <Grid className="w-3.5 h-3.5" />
          <span>All Media</span>
        </button>

        <button
          onClick={() => setActiveTab('photos')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
            activeTab === 'photos'
              ? 'bg-[#171717] text-white border border-[#262626] shadow-sm'
              : 'text-[#A1A1AA] hover:text-white'
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span>Photos</span>
        </button>

        <button
          onClick={() => setActiveTab('albums')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
            activeTab === 'albums'
              ? 'bg-[#171717] text-white border border-[#262626] shadow-sm'
              : 'text-[#A1A1AA] hover:text-white'
          }`}
        >
          <FolderHeart className="w-3.5 h-3.5" />
          <span>Albums</span>
        </button>

        <button
          onClick={() => setActiveTab('shared')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
            activeTab === 'shared'
              ? 'bg-[#171717] text-white border border-[#262626] shadow-sm'
              : 'text-[#A1A1AA] hover:text-white'
          }`}
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>Shared</span>
        </button>
      </div>

      {/* Album Category Tiles (when Albums tab is active) */}
      {activeTab === 'albums' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-2xl bg-[#111111] border border-[#262626] hover:border-[#10B981]/50 cursor-pointer transition-all">
            <div className="w-10 h-10 rounded-xl bg-[#171717] flex items-center justify-center text-[#10B981] mb-3">
              <Sparkles className="w-5 h-5" />
            </div>
            <h4 className="text-xs font-bold text-white">Recents</h4>
            <p className="text-[11px] text-zinc-500 mt-0.5">{items.length} items</p>
          </div>

          <div className="p-4 rounded-2xl bg-[#111111] border border-[#262626] hover:border-[#10B981]/50 cursor-pointer transition-all">
            <div className="w-10 h-10 rounded-xl bg-[#171717] flex items-center justify-center text-amber-400 mb-3">
              <FolderHeart className="w-5 h-5" />
            </div>
            <h4 className="text-xs font-bold text-white">Favorites</h4>
            <p className="text-[11px] text-zinc-500 mt-0.5">0 items</p>
          </div>

          <div className="p-4 rounded-2xl bg-[#111111] border border-[#262626] hover:border-[#10B981]/50 cursor-pointer transition-all">
            <div className="w-10 h-10 rounded-xl bg-[#171717] flex items-center justify-center text-cyan-400 mb-3">
              <Layers className="w-5 h-5" />
            </div>
            <h4 className="text-xs font-bold text-white">Screenshots</h4>
            <p className="text-[11px] text-zinc-500 mt-0.5">0 items</p>
          </div>
        </div>
      )}

      {/* Main Timeline Grid */}
      {loading ? (
        <div className="p-12 text-center text-xs text-zinc-500 font-mono">Loading gallery timeline...</div>
      ) : items.length === 0 ? (
        <div className="p-12 bg-[#111111] border border-[#262626] rounded-2xl text-center space-y-3">
          <UploadCloud className="w-10 h-10 text-zinc-600 mx-auto" />
          <p className="text-sm font-semibold text-white">No Media in Gallery</p>
          <p className="text-xs text-[#A1A1AA] max-w-xs mx-auto">
            Use the camera or tap Add Media to build your personal photo library.
          </p>
          <button
            onClick={() => setUploadModalOpen(true)}
            className="px-4 py-2 bg-[#10B981] hover:bg-emerald-400 text-black text-xs font-bold rounded-xl shadow-lg transition-all"
          >
            Upload Photo
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedItems).map(([dateLabel, dateItems]) => (
            <div key={dateLabel} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{dateLabel}</h3>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5 sm:gap-2">
                {dateItems.map(item => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className="group relative aspect-square rounded-xl overflow-hidden bg-[#171717] border border-[#262626] cursor-pointer hover:border-zinc-500 transition-all shadow-sm"
                  >
                    <img
                      src={item.image_url}
                      alt={item.caption || 'Media item'}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      loading="lazy"
                      onError={handleImageError}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox / Fullscreen Viewer */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col justify-between p-4 sm:p-6 animate-fade-in">
          {/* Top Bar */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-zinc-400">
              {new Date(selectedItem.created_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDelete(selectedItem)}
                className="p-2.5 rounded-full bg-[#111111] hover:bg-red-950 border border-[#262626] hover:border-red-600 text-zinc-300 hover:text-red-400 transition-all active:scale-95"
                title="Delete Photo"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setSelectedItem(null)}
                className="p-2.5 rounded-full bg-[#111111] hover:bg-[#171717] border border-[#262626] text-white transition-all active:scale-95"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Media Viewport */}
          <div className="flex-1 flex items-center justify-center p-4">
            <img
              src={selectedItem.image_url}
              alt="Expanded Media"
              className="max-h-[72vh] max-w-full rounded-2xl object-contain shadow-2xl border border-[#262626]"
              onError={handleImageError}
            />
          </div>

          {/* Bottom Bar Details */}
          <div className="bg-[#111111] border border-[#262626] rounded-2xl p-4 max-w-md mx-auto w-full text-center">
            <p className="text-xs text-white font-medium">
              {selectedItem.caption || 'Personal Gallery Photo'}
            </p>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      <UploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onUploadSuccess={loadGallery}
      />
    </div>
  );
};
