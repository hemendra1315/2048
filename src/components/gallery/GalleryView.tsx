import React, { useState, useEffect, useCallback } from 'react';
import {
  Image as ImageIcon,
  Upload,
} from 'lucide-react';
import { GalleryItem } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { uniqueChannelName } from '../../lib/realtime';
import { mockBackend } from '../../lib/mockBackend';
import { UploadModal } from './UploadModal';
import { LightboxViewer } from './LightboxViewer';

type GalleryFilter = 'all' | 'photos' | 'videos' | 'shared';

export const GalleryView: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [filter, setFilter] = useState<GalleryFilter>('all');
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
        if (data) setItems(data as unknown as GalleryItem[]);
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
        .channel(uniqueChannelName('gallery_items'))
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

  // Group items by relative period (This Week, This Month, or Month Year)
  const groupedItems = items.reduce((acc, item) => {
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

  return (
    <div className="flex flex-col gap-4 pb-20 animate-fade-in select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <h1 className="t-h1 m-0">Gallery</h1>

        <button
          type="button"
          onClick={() => setUploadModalOpen(true)}
          className="ib ib-s rounded-xl"
          aria-label="Upload photo"
          title="Upload photo"
        >
          <Upload className="i" aria-hidden />
        </button>
      </div>

      {/* Filter Chips Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar" role="tablist" aria-label="Gallery filters">
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'all'}
          onClick={() => setFilter('all')}
          className={`chip ${filter === 'all' ? 'chip-on' : ''}`}
        >
          All {items.length > 0 && <span className="opacity-80">{items.length}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'photos'}
          onClick={() => setFilter('photos')}
          className={`chip ${filter === 'photos' ? 'chip-on' : ''}`}
        >
          Photos
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'videos'}
          onClick={() => setFilter('videos')}
          className={`chip ${filter === 'videos' ? 'chip-on' : ''}`}
        >
          Videos
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'shared'}
          onClick={() => setFilter('shared')}
          className={`chip ${filter === 'shared' ? 'chip-on' : ''}`}
        >
          Shared
        </button>
      </div>

      {/* Gallery Content */}
      {loading ? (
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2" role="status" aria-label="Loading gallery">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="sk aspect-square rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="card p-8 flex flex-col items-center justify-center text-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-vault-850 border border-vault-700 flex items-center justify-center text-vault-400">
            <ImageIcon className="w-8 h-8" aria-hidden />
          </div>
          <h2 className="t-h2 m-0">No media in gallery</h2>
          <p className="t-sm c2 max-w-xs m-0">
            Use the Camera tab or tap Add Media to build your personal photo library.
          </p>
          <button
            type="button"
            onClick={() => setUploadModalOpen(true)}
            className="btn btn-p mt-2"
          >
            <Upload className="i i-sm" aria-hidden />
            <span>Upload Photo</span>
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {Object.entries(groupedItems).map(([periodLabel, periodItems]) => (
            <section key={periodLabel} className="flex flex-col gap-2">
              <h2 className="t-over px-1 m-0">{periodLabel}</h2>
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                {periodItems.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedItem(item)}
                    aria-label={item.caption || 'Open photo'}
                    className="group relative aspect-square rounded-xl overflow-hidden bg-vault-900 border border-vault-800 hover:border-vault-600 focus-visible:fr transition-all cursor-pointer p-0"
                  >
                    <img
                      src={item.image_url}
                      alt={item.caption || 'Gallery photo'}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Lightbox / Expanded Viewer */}
      <LightboxViewer
        item={selectedItem}
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
