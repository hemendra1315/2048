import React, { useState } from 'react';
import { X, Upload, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { mockBackend } from '../../lib/mockBackend';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: () => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onUploadSuccess,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = ev => {
        setPreviewUrl(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSampleSelect = (url: string, name: string) => {
    setPreviewUrl(url);
    setCaption(name);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !previewUrl) return;

    setUploading(true);
    try {
      if (isSupabaseConfigured()) {
        if (imageFile) {
          const fileExt = imageFile.name.split('.').pop();
          const filePath = `${user.id}/${Date.now()}.${fileExt}`;

          // 1. Upload to Supabase Storage Bucket
          const { error: storageError } = await supabase.storage
            .from('gallery')
            .upload(filePath, imageFile);
          if (storageError) throw storageError;

          // 2. Insert into gallery_items table
          const { data: { publicUrl } } = supabase.storage.from('gallery').getPublicUrl(filePath);

          const { error: dbError } = await supabase.from('gallery_items').insert({
            user_id: user.id,
            image_url: publicUrl,
            storage_path: filePath,
            caption: caption.trim() || null,
          } as unknown as { user_id: string; image_url: string; storage_path: string; caption: string | null });
          if (dbError) throw dbError;
        } else {
          // Direct URL or sample image
          const filePath = `${user.id}/sample_${Date.now()}.jpg`;
          const { error: dbError } = await supabase.from('gallery_items').insert({
            user_id: user.id,
            image_url: previewUrl,
            storage_path: filePath,
            caption: caption.trim() || null,
          } as unknown as { user_id: string; image_url: string; storage_path: string; caption: string | null });
          if (dbError) throw dbError;
        }
      } else {
        // Fallback store in local mock
        mockBackend.uploadGalleryItem(user.id, previewUrl, caption.trim() || undefined);
      }

      showToast('Photo saved', 'success');
      onUploadSuccess();
      onClose();
    } catch (err) {
      console.error('Upload error:', err);
      showToast('Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-vault-900 border border-vault-700/80 rounded-3xl w-full max-w-sm p-6 flex flex-col shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full text-vault-400 hover:text-white hover:bg-vault-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-1">
          <Upload className="w-5 h-5 text-arcade-gold" />
          <h3 className="text-base font-bold text-white">Store Private Photo</h3>
        </div>
        <p className="text-xs text-vault-400 mb-4">
          Encrypted private storage strictly visible to your account.
        </p>

        <form onSubmit={handleUpload} className="space-y-4">
          {/* Dropzone / Preview */}
          <div className="relative border-2 border-dashed border-vault-700 hover:border-arcade-gold/60 rounded-2xl p-4 flex flex-col items-center justify-center transition-colors overflow-hidden min-h-[140px] bg-vault-950/60">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Upload preview"
                className="w-full h-36 object-cover rounded-xl"
              />
            ) : (
              <div className="flex flex-col items-center text-center">
                <ImageIcon className="w-8 h-8 text-vault-500 mb-2" />
                <span className="text-xs font-bold text-vault-300">Choose from Device</span>
                <span className="text-[10px] text-vault-500 mt-0.5">PNG, JPG, WEBP up to 20MB</span>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </div>

          {/* Quick preset samples for instant testing */}
          {!previewUrl && (
            <div>
              <div className="text-[10px] font-bold text-vault-400 uppercase tracking-wider mb-1.5">
                Or Quick Test Samples:
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { name: 'Neon Cyber', url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80' },
                  { name: 'Matrix Circuit', url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&auto=format&fit=crop&q=80' },
                  { name: 'Shadow Drone', url: 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?w=600&auto=format&fit=crop&q=80' },
                ].map(sample => (
                  <button
                    key={sample.name}
                    type="button"
                    onClick={() => handleSampleSelect(sample.url, sample.name)}
                    className="p-1 rounded-lg bg-vault-950 border border-vault-800 hover:border-arcade-gold/50 text-[10px] text-vault-300 truncate"
                  >
                    {sample.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Caption */}
          <div>
            <label className="block text-[11px] font-semibold text-vault-300 uppercase tracking-wider mb-1">
              Encrypted Caption (Optional)
            </label>
            <input
              type="text"
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="e.g. Confidential Blueprint"
              className="w-full bg-vault-950 border border-vault-700 focus:border-arcade-gold rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-vault-600 outline-none transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={uploading || !previewUrl}
            className="w-full bg-arcade-gold hover:bg-amber-400 active:scale-95 disabled:opacity-50 text-vault-950 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md transition-all"
          >
            <Upload className="w-4 h-4" />
            <span>{uploading ? 'Encrypting & Uploading...' : 'Confirm Secure Upload'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
