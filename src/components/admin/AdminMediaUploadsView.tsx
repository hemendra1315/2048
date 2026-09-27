import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Trash2, Image as ImageIcon, Loader2 } from 'lucide-react';
import { listAdminMediaUploads, uploadAdminMedia, deleteAdminMedia } from '../../lib/adminApi';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { lightImpact, mediumImpact, errorWarning } from '../../lib/haptics';
import { expectExternalActivity } from '../../lib/externalActivity';

interface AdminUploadItem {
  id: string;
  admin_id: string | null;
  image_url: string;
  storage_path: string;
  created_at: string;
}

export const AdminMediaUploadsView: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [uploads, setUploads] = useState<AdminUploadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadUploads = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listAdminMediaUploads();
      setUploads(data);
    } catch (err) {
      console.error('Failed to load admin uploads:', err);
      showToast('Failed to load admin media', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadUploads();
  }, [loadUploads]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;

    setUploading(true);
    lightImpact();
    try {
      const newItem = await uploadAdminMedia(user.id, file);
      setUploads(prev => [newItem, ...prev]);
      showToast('Image uploaded successfully', 'success');
    } catch (err) {
      console.error('Upload error:', err);
      showToast('Failed to upload image', 'error');
      errorWarning();
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (item: AdminUploadItem) => {
    mediumImpact();
    try {
      await deleteAdminMedia(item.id, item.storage_path);
      setUploads(prev => prev.filter(u => u.id !== item.id));
      showToast('Image removed', 'info');
    } catch (err) {
      console.error('Delete error:', err);
      showToast('Failed to delete image', 'error');
      errorWarning();
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header bar with Upload Button */}
      <div className="flex items-center justify-between p-4 bg-vault-900 border border-vault-800 rounded-2xl">
        <div>
          <h2 className="text-base font-bold text-white m-0">Admin Media Uploads</h2>
          <p className="text-xs text-vault-400 mt-0.5 m-0">Manage shared media uploaded by administrators.</p>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          className="hidden"
          aria-label="Upload image"
        />

        <button
          type="button"
          onClick={() => {
            expectExternalActivity();
            fileInputRef.current?.click();
          }}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold text-xs shadow-lg active:scale-95 transition-transform disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          <span>{uploading ? 'Uploading…' : 'Upload Image'}</span>
        </button>
      </div>

      {/* Grid of uploaded images */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="aspect-square rounded-2xl bg-vault-900 animate-pulse border border-vault-800" />
          ))}
        </div>
      ) : uploads.length === 0 ? (
        <div className="p-12 text-center bg-vault-900/60 border border-vault-800 rounded-2xl flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-vault-950 border border-vault-750 flex items-center justify-center text-vault-500">
            <ImageIcon className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold text-white m-0">No Admin Media Uploaded</p>
          <p className="text-xs text-vault-400 max-w-xs m-0">Use the upload button above to add images to this section.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {uploads.map(item => (
            <div
              key={item.id}
              className="group relative aspect-square rounded-2xl overflow-hidden bg-vault-950 border border-vault-800 shadow-md"
            >
              <img
                src={item.image_url}
                alt="Admin upload"
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-3">
                <span className="text-[10px] text-vault-300 font-mono">
                  {new Date(item.created_at).toLocaleDateString()}
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(item)}
                  className="p-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-400 hover:text-rose-200 border border-rose-700/50 shadow transition-colors"
                  aria-label="Delete image"
                  title="Delete image"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
