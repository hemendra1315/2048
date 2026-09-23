import React, { useState, useEffect, useRef } from 'react';
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
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setImageFile(null);
      setPreviewUrl(null);
      setCaption('');
      return;
    }
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

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

          const { error: storageError } = await supabase.storage
            .from('gallery')
            .upload(filePath, imageFile);
          if (storageError) throw storageError;

          const { data: { publicUrl } } = supabase.storage.from('gallery').getPublicUrl(filePath);

          const { error: dbError } = await supabase.from('gallery_items').insert({
            user_id: user.id,
            image_url: publicUrl,
            storage_path: filePath,
            caption: caption.trim() || null,
          } as unknown as { user_id: string; image_url: string; storage_path: string; caption: string | null });
          if (dbError) throw dbError;
        } else {
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
        mockBackend.uploadGalleryItem(user.id, previewUrl, caption.trim() || undefined);
      }

      showToast('Photo added to gallery', 'success');
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
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-modal-title"
        className="sheet anim-sheet absolute left-0 right-0 bottom-0 mx-auto max-w-md px-5 pt-3 pb-8 flex flex-col gap-4 bg-vault-900 border-t border-vault-700"
      >
        <div className="w-9 h-1 rounded-full bg-vault-700 self-center" aria-hidden="true" />

        <div className="flex items-center justify-between">
          <h2 id="upload-modal-title" className="t-h2 m-0">Add Media</h2>
          <button
            ref={closeRef}
            type="button"
            className="ib"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="i" aria-hidden />
          </button>
        </div>

        <form onSubmit={handleUpload} className="flex flex-col gap-4">
          {/* Dropzone / Preview */}
          <label className="relative border-2 border-dashed border-vault-700 hover:border-vault-600 rounded-2xl p-4 flex flex-col items-center justify-center transition-colors overflow-hidden min-h-[150px] bg-vault-950/70 cursor-pointer">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Upload preview"
                className="w-full h-40 object-cover rounded-xl"
              />
            ) : (
              <div className="flex flex-col items-center text-center gap-1.5 p-2">
                <div className="w-12 h-12 rounded-xl bg-vault-850 flex items-center justify-center text-vault-400 mb-1">
                  <ImageIcon className="w-6 h-6" aria-hidden />
                </div>
                <span className="t-label text-vault-100">Choose from device</span>
                <span className="t-cap c3">PNG, JPG, WEBP up to 20MB</span>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="sr-only"
              aria-label="Choose image file"
            />
          </label>

          {/* Quick preset samples */}
          {!previewUrl && (
            <div className="flex flex-col gap-2">
              <span className="t-over">Or Quick Presets</span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { name: 'Architecture', url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&auto=format&fit=crop&q=80' },
                  { name: 'Landscape', url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&auto=format&fit=crop&q=80' },
                  { name: 'Urban Night', url: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=600&auto=format&fit=crop&q=80' },
                ].map(sample => (
                  <button
                    key={sample.name}
                    type="button"
                    onClick={() => handleSampleSelect(sample.url, sample.name)}
                    className="btn btn-s btn-sm !text-xs truncate"
                  >
                    {sample.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Caption input */}
          <div className="field">
            <label htmlFor="upload-caption" className="lab">Caption (Optional)</label>
            <input
              id="upload-caption"
              type="text"
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="Add a caption"
              className="inp"
            />
          </div>

          <button
            type="submit"
            disabled={uploading || !previewUrl}
            className="btn btn-p btn-block mt-2"
          >
            <Upload className="i" aria-hidden />
            <span>{uploading ? 'Uploading...' : 'Save to Gallery'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
