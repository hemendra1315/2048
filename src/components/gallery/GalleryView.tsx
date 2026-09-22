import React, { useState, useEffect, useCallback } from 'react';
import { Image as ImageIcon, Plus, Lock } from 'lucide-react';
import { GalleryItem } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { mockBackend } from '../../lib/mockBackend';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { LightboxViewer } from './LightboxViewer';
import { UploadModal } from './UploadModal';

export const GalleryView: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

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
      console.error('Error loading gallery:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadGallery();

    if (!isSupabaseConfigured()) {
      const unsub = mockBackend.subscribe('gallery:updated', () => loadGallery());
      return unsub;
    }
  }, [loadGallery]);

  const handleDelete = async (item: GalleryItem) => {
    if (!user) return;
    try {
      if (isSupabaseConfigured()) {
        const { error: dbError } = await supabase
          .from('gallery_items')
          .delete()
          .eq('id', item.id);
        if (dbError) throw dbError;

        if (item.storage_path) {
          await supabase.storage.from('gallery').remove([item.storage_path]);
        }
      } else {
        mockBackend.deleteGalleryItem(item.id, user.id);
      }

      setSelectedItem(null);
      showToast('Photo removed from vault', 'info');
      loadGallery();
    } catch (err) {
      console.error('Delete error:', err);
      showToast('Delete failed', 'error');
    }
  };

  return (
    <div className="space-y-4 pb-20 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white">Private Gallery</h2>
          <p className="text-xs text-vault-400">Isolated encrypted vault storage</p>
        </div>

        <button
          onClick={() => setUploadModalOpen(true)}
          className="flex items-center gap-1.5 bg-arcade-gold hover:bg-amber-400 active:scale-95 text-vault-950 text-xs font-bold px-3 py-2 rounded-xl shadow-md transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Upload</span>
        </button>
      </div>

      {/* Grid Content */}
      {loading ? (
        <div className="p-8 text-center text-xs text-vault-400">Loading private storage...</div>
      ) : items.length === 0 ? (
        <div className="bg-vault-900/60 border border-vault-800 rounded-3xl p-8 text-center">
          <ImageIcon className="w-10 h-10 text-vault-600 mx-auto mb-2" />
          <h4 className="text-sm font-bold text-white mb-1">Gallery is Empty</h4>
          <p className="text-xs text-vault-400 mb-4 max-w-xs mx-auto">
            Upload photos securely. Nobody else can view your media items.
          </p>
          <button
            onClick={() => setUploadModalOpen(true)}
            className="bg-vault-800 hover:bg-vault-700 text-xs font-semibold px-4 py-2 rounded-xl text-vault-200 border border-vault-700"
          >
            Upload First Photo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {items.map(item => (
            <div
              key={item.id}
              onClick={() => setSelectedItem(item)}
              className="group relative aspect-square bg-vault-900 rounded-2xl overflow-hidden border border-vault-800 hover:border-arcade-gold/50 cursor-pointer shadow-md transition-all active:scale-[0.98]"
            >
              <img
                src={item.image_url}
                alt={item.caption || 'Vault photo'}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2.5 flex flex-col justify-end">
                <span className="text-[11px] font-bold text-white truncate">
                  {item.caption || 'Encrypted Media'}
                </span>
              </div>
              <div className="absolute top-2 right-2 p-1 rounded-full bg-black/50 text-arcade-gold backdrop-blur-xs">
                <Lock className="w-3 h-3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox & Upload Modals */}
      <LightboxViewer
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onDelete={handleDelete}
      />
      <UploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onUploadSuccess={loadGallery}
      />
    </div>
  );
};
