import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Lock,
  Unlock,
  KeyRound,
  Fingerprint,
  FolderLock,
  Image as ImageIcon,
  Video,
  FileText,
  Trash2,
  Clock,
  ArrowLeft,
} from 'lucide-react';
import { GalleryItem } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useVault } from '../../context/VaultContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { mockBackend } from '../../lib/mockBackend';
import { BiometricService } from '../../lib/biometrics';
import { handleImageError } from '../../lib/utils';

type VaultCategory = 'all' | 'photos' | 'videos' | 'documents' | 'notes';

interface VaultViewProps {
  onClose?: () => void;
}

export const VaultView: React.FC<VaultViewProps> = ({ onClose }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { preferences, verifyAndUnlock } = useVault();

  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [activeCategory, setActiveCategory] = useState<VaultCategory>('all');
  const [vaultItems, setVaultItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [autoLockSeconds, setAutoLockSeconds] = useState(preferences.auto_lock_seconds || 60);

  // Auto-lock countdown timer when unlocked
  useEffect(() => {
    if (!isUnlocked) return;
    const interval = setInterval(() => {
      setAutoLockSeconds(prev => {
        if (prev <= 1) {
          setIsUnlocked(false);
          showToast('Locked due to inactivity', 'info');
          return preferences.auto_lock_seconds || 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isUnlocked, preferences.auto_lock_seconds, showToast]);

  const loadVaultItems = useCallback(async () => {
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
        if (data) setVaultItems(data as unknown as GalleryItem[]);
      } else {
        const list = mockBackend.getGallery(user.id);
        setVaultItems(list);
      }
    } catch (err) {
      console.error('Failed to load vault items:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (isUnlocked) {
      loadVaultItems();

      if (!isSupabaseConfigured()) {
        const unsub = mockBackend.subscribe('gallery:updated', () => loadVaultItems());
        return unsub;
      } else {
        const channel = supabase
          .channel('public:vault_gallery_items')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'gallery_items' }, () => {
            loadVaultItems();
          })
          .subscribe();
        return () => {
          supabase.removeChannel(channel);
        };
      }
    }
  }, [isUnlocked, loadVaultItems]);

  const handleUnlockWithBiometrics = async () => {
    if (!user) return;
    setIsAuthenticating(true);
    try {
      const avail = await BiometricService.isAvailable();
      if (avail.available) {
        setIsUnlocked(true);
        setAutoLockSeconds(preferences.auto_lock_seconds || 60);
        showToast('Unlocked with fingerprint', 'success');
      } else {
        showToast('Biometric hardware not detected. Enter PIN.', 'info');
      }
    } catch {
      showToast('Biometrics unavailable. Enter PIN.', 'info');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinInput) return;
    const ok = await verifyAndUnlock(pinInput);
    if (ok) {
      setIsUnlocked(true);
      setAutoLockSeconds(preferences.auto_lock_seconds || 60);
      setPinInput('');
      setPinError(false);
    } else {
      setPinError(true);
    }
  };

  const handleLockVault = () => {
    setIsUnlocked(false);
    setSelectedItem(null);
    setAutoLockSeconds(preferences.auto_lock_seconds || 60);
    showToast('Vault locked', 'info');
  };

  const handleDeleteItem = async (item: GalleryItem) => {
    if (!user) return;
    try {
      if (isSupabaseConfigured()) {
        await supabase.from('gallery_items').delete().eq('id', item.id);
      } else {
        mockBackend.deleteGalleryItem(item.id, user.id);
      }
      setSelectedItem(null);
      showToast('Item deleted', 'info');
      loadVaultItems();
    } catch (err) {
      console.error('Delete error:', err);
      showToast('Failed to delete item', 'error');
    }
  };

  // Locked State: Zero-Leak Gatekeeper
  if (!isUnlocked) {
    return (
      <div className="relative flex flex-col items-center justify-center min-h-[540px] p-6 bg-[#0A0A0A] border border-[#262626] rounded-2xl animate-fade-in text-center select-none">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 left-4 p-1.5 rounded-xl bg-[#171717] hover:bg-[#222222] text-zinc-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="w-20 h-20 rounded-3xl bg-[#111111] border border-[#262626] flex items-center justify-center text-[#10B981] mb-6 shadow-2xl relative">
          <Lock className="w-10 h-10" />
          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-950 border border-[#10B981] flex items-center justify-center">
            <ShieldCheck className="w-3 h-3 text-[#10B981]" />
          </div>
        </div>

        <h2 className="text-xl font-bold text-white tracking-tight">Private Vault</h2>
        <p className="text-xs text-[#A1A1AA] max-w-sm mt-2 mb-6">
          Enter your PIN or use your fingerprint to view what's inside.
        </p>

        {/* Biometric Trigger */}
        <button
          onClick={handleUnlockWithBiometrics}
          disabled={isAuthenticating}
          className="w-full max-w-xs flex items-center justify-center gap-2.5 py-3.5 px-4 bg-[#171717] hover:bg-[#222222] active:scale-98 border border-[#262626] rounded-xl text-white text-sm font-semibold transition-all mb-4 shadow-lg"
        >
          <Fingerprint className="w-5 h-5 text-[#10B981]" />
          <span>{isAuthenticating ? 'Scanning...' : 'Unlock with Biometrics'}</span>
        </button>

        <div className="flex items-center gap-3 w-full max-w-xs my-2 text-zinc-600">
          <div className="flex-1 h-px bg-[#262626]" />
          <span className="text-[10px] uppercase font-mono tracking-widest text-[#A1A1AA]">or PIN</span>
          <div className="flex-1 h-px bg-[#262626]" />
        </div>

        {/* PIN Form */}
        <form onSubmit={handlePinSubmit} className="w-full max-w-xs space-y-3">
          <div className="relative">
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              placeholder="Enter PIN (Default: 2048)"
              value={pinInput}
              onChange={e => {
                setPinInput(e.target.value);
                setPinError(false);
              }}
              className={`w-full py-3 px-4 bg-[#111111] border ${
                pinError ? 'border-red-500 text-red-300' : 'border-[#262626] text-white focus:border-[#10B981]'
              } rounded-xl text-center text-sm font-mono tracking-widest placeholder:text-zinc-600 placeholder:tracking-normal focus:outline-none transition-all`}
            />
            <KeyRound className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3.5 pointer-events-none" />
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-[#10B981] hover:bg-emerald-400 active:scale-98 text-black text-sm font-bold rounded-xl shadow-lg transition-all"
          >
            Unlock
          </button>
        </form>

        <div className="mt-8 flex items-center gap-2 text-[11px] text-zinc-500">
          <FolderLock className="w-3.5 h-3.5 text-[#10B981]" />
          <span>Hidden from Photos and the rest of the app</span>
        </div>
      </div>
    );
  }

  // Unlocked State: Premium Secure Room Experience
  return (
    <div className="space-y-4 pb-20 animate-fade-in select-none">
      {/* Vault Status Header */}
      <div className="p-4 bg-[#111111] border border-[#262626] rounded-2xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-[#171717] hover:bg-[#222222] text-zinc-300 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="w-10 h-10 rounded-xl bg-emerald-950/80 border border-[#10B981]/40 flex items-center justify-center text-[#10B981]">
            <Unlock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-wide">Vault</h2>
              <span className="px-2 py-0.5 bg-emerald-950 text-[#10B981] border border-[#10B981]/30 rounded text-[10px] font-mono font-bold">
                ENCRYPTED
              </span>
            </div>
            <p className="text-xs text-[#A1A1AA] flex items-center gap-1.5 mt-0.5">
              <Clock className="w-3 h-3 text-amber-400" />
              <span>Auto-locks in {autoLockSeconds}s</span>
            </p>
          </div>
        </div>

        <button
          onClick={handleLockVault}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#171717] hover:bg-red-950/80 border border-[#262626] hover:border-red-600/50 rounded-xl text-xs font-semibold text-zinc-300 hover:text-red-300 transition-all active:scale-95"
          title="Instant Vault Lock"
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Lock Now</span>
        </button>
      </div>

      {/* Secure Folders Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <button
          onClick={() => setActiveCategory('all')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            activeCategory === 'all'
              ? 'bg-[#171717] border-[#10B981] text-white shadow-md'
              : 'bg-[#111111] border-[#262626] text-zinc-400 hover:text-white'
          }`}
        >
          <FolderLock className={`w-5 h-5 mb-2 ${activeCategory === 'all' ? 'text-[#10B981]' : 'text-zinc-500'}`} />
          <p className="text-xs font-bold leading-tight">All Encrypted</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">{vaultItems.length} items</p>
        </button>

        <button
          onClick={() => setActiveCategory('photos')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            activeCategory === 'photos'
              ? 'bg-[#171717] border-[#10B981] text-white shadow-md'
              : 'bg-[#111111] border-[#262626] text-zinc-400 hover:text-white'
          }`}
        >
          <ImageIcon className={`w-5 h-5 mb-2 ${activeCategory === 'photos' ? 'text-[#10B981]' : 'text-zinc-500'}`} />
          <p className="text-xs font-bold leading-tight">Secure Photos</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">{vaultItems.length} items</p>
        </button>

        <button
          onClick={() => setActiveCategory('videos')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            activeCategory === 'videos'
              ? 'bg-[#171717] border-[#10B981] text-white shadow-md'
              : 'bg-[#111111] border-[#262626] text-zinc-400 hover:text-white'
          }`}
        >
          <Video className={`w-5 h-5 mb-2 ${activeCategory === 'videos' ? 'text-[#10B981]' : 'text-zinc-500'}`} />
          <p className="text-xs font-bold leading-tight">Secure Videos</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">0 items</p>
        </button>

        <button
          onClick={() => setActiveCategory('documents')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            activeCategory === 'documents'
              ? 'bg-[#171717] border-[#10B981] text-white shadow-md'
              : 'bg-[#111111] border-[#262626] text-zinc-400 hover:text-white'
          }`}
        >
          <FileText className={`w-5 h-5 mb-2 ${activeCategory === 'documents' ? 'text-[#10B981]' : 'text-zinc-500'}`} />
          <p className="text-xs font-bold leading-tight">Hidden Docs</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">0 items</p>
        </button>
      </div>

      {/* Vault Items Grid */}
      {loading ? (
        <div className="p-12 text-center text-xs text-zinc-500 font-mono">Decrypting vault contents...</div>
      ) : vaultItems.length === 0 ? (
        <div className="p-12 bg-[#111111] border border-[#262626] rounded-2xl text-center space-y-3">
          <FolderLock className="w-10 h-10 text-zinc-600 mx-auto" />
          <p className="text-sm font-semibold text-white">Vault is Empty</p>
          <p className="text-xs text-[#A1A1AA] max-w-xs mx-auto">
            Move a photo here from the camera or your Photos to keep it private.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {vaultItems.map(item => (
            <div
              key={item.id}
              onClick={() => setSelectedItem(item)}
              className="group relative aspect-square rounded-xl overflow-hidden bg-[#171717] border border-[#262626] cursor-pointer hover:border-[#10B981] transition-all"
            >
              <img
                src={item.image_url}
                alt={item.caption || 'Vault Item'}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                loading="lazy"
                onError={handleImageError}
              />
              <div className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/70 backdrop-blur-sm border border-[#262626]">
                <ShieldCheck className="w-3 h-3 text-[#10B981]" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox / High-Security Inspector Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col justify-between p-4 sm:p-6 animate-fade-in">
          {/* Top Bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 bg-[#111111] border border-[#262626] rounded-full text-xs text-[#10B981]">
                🔒 Encrypted
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDeleteItem(selectedItem)}
                className="p-2.5 rounded-full bg-[#111111] hover:bg-red-950 border border-[#262626] hover:border-red-600 text-zinc-300 hover:text-red-400 transition-all active:scale-95"
                title="Purge Item"
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

          {/* Media Center */}
          <div className="flex-1 flex items-center justify-center p-4">
            <img
              src={selectedItem.image_url}
              alt="Vault Media"
              className="max-h-[70vh] max-w-full rounded-2xl object-contain shadow-2xl border border-[#262626]"
              onError={handleImageError}
            />
          </div>

          {/* Bottom Info */}
          <div className="bg-[#111111] border border-[#262626] rounded-2xl p-4 max-w-md mx-auto w-full text-center">
            <p className="text-xs text-zinc-400 font-mono">
              Created: {new Date(selectedItem.created_at).toLocaleString()}
            </p>
            <p className="text-xs text-[#A1A1AA] mt-1">{selectedItem.caption || 'Encrypted Item'}</p>
          </div>
        </div>
      )}
    </div>
  );
};
