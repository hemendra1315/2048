import React, { useState } from 'react';
import { X, FolderPlus, Check } from 'lucide-react';
import { SharedVaultAlbum } from '../../types';
import { lightImpact, mediumImpact } from '../../lib/haptics';

interface SharedVaultAlbumModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { title: string; description: string; gradient_preset: string }) => Promise<void>;
  initialData?: SharedVaultAlbum | null;
}

export const GRADIENT_PRESETS = [
  { id: 'sunset', name: 'Sunset Glow', class: 'from-amber-600 via-rose-600 to-purple-800' },
  { id: 'emerald', name: 'Emerald Forest', class: 'from-emerald-600 via-teal-700 to-slate-900' },
  { id: 'twilight', name: 'Twilight Dream', class: 'from-purple-600 via-indigo-700 to-vault-950' },
  { id: 'midnight', name: 'Midnight Neon', class: 'from-blue-600 via-cyan-700 to-vault-950' },
  { id: 'rose', name: 'Velvet Rose', class: 'from-rose-600 via-pink-700 to-slate-950' },
  { id: 'ocean', name: 'Deep Ocean', class: 'from-cyan-600 via-blue-800 to-indigo-950' },
];

export const SharedVaultAlbumModal: React.FC<SharedVaultAlbumModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
}) => {
  const [title, setTitle] = useState(initialData?.title || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [gradientPreset, setGradientPreset] = useState(initialData?.gradient_preset || 'sunset');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || loading) return;
    setLoading(true);
    mediumImpact();
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        gradient_preset: gradientPreset,
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 anim-fade"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md glass-panel rounded-3xl p-6 shadow-2xl space-y-5 anim-sheet"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-vault-800">
          <div className="flex items-center gap-2 text-white font-bold text-base">
            <FolderPlus className="w-5 h-5 text-purple-400" />
            <span>{initialData ? 'Edit Album' : 'Create Custom Album'}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ib ib-s rounded-full"
            aria-label="Close"
          >
            <X className="i" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-vault-300 block mb-1">Album Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Summer Roadtrip '26, Secret Quotes..."
              maxLength={50}
              required
              className="w-full px-4 py-2.5 rounded-xl bg-vault-900 border border-vault-700 text-white placeholder:text-vault-500 text-sm focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-vault-300 block mb-1">Description (Optional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Add a sweet memory note for this collection..."
              rows={2}
              maxLength={160}
              className="w-full px-4 py-2 rounded-xl bg-vault-900 border border-vault-700 text-white placeholder:text-vault-500 text-xs focus:outline-none focus:border-purple-500 resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-vault-300 block mb-2">Cover Theme Preset</label>
            <div className="grid grid-cols-3 gap-2">
              {GRADIENT_PRESETS.map(preset => {
                const isSelected = gradientPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      lightImpact();
                      setGradientPreset(preset.id);
                    }}
                    className={`relative h-14 rounded-xl bg-gradient-to-br ${preset.class} p-2 flex flex-col justify-end text-left transition-all border ${
                      isSelected ? 'ring-2 ring-white border-white scale-105' : 'border-white/10 opacity-75 hover:opacity-100'
                    }`}
                  >
                    {isSelected && (
                      <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-white text-vault-950 flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </span>
                    )}
                    <span className="text-[10px] font-bold text-white drop-shadow truncate">{preset.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-g py-2.5 px-4 text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || loading}
              className="btn btn-p py-2.5 px-5 text-xs font-bold"
            >
              {loading ? 'Saving…' : initialData ? 'Save Changes' : 'Create Album'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
