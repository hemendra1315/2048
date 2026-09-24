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
  Trash,
  Clock,
} from 'lucide-react';
import { GalleryItem } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useVault } from '../../context/VaultContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { uniqueChannelName } from '../../lib/realtime';
import { mockBackend } from '../../lib/mockBackend';
import { BiometricService } from '../../lib/biometrics';
import { useGalleryUrls } from '../../lib/mediaUrls';
import { MediaImage } from '../common/MediaImage';

type VaultCategory = 'all' | 'photos' | 'videos' | 'documents' | 'notes';

export const VaultView: React.FC = () => {
  const { user, loginWithBiometrics } = useAuth();
  const { showToast } = useToast();
  const { preferences, verifyAndUnlock } = useVault();

  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);
  const [activeCategory, setActiveCategory] = useState<VaultCategory>('all');
  const [vaultItems, setVaultItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [autoLockSeconds, setAutoLockSeconds] = useState(preferences.auto_lock_seconds || 60);

  useEffect(() => {
    BiometricService.isAvailable().then(res => setIsBiometricSupported(res.available));
  }, []);

  // Auto-lock countdown timer when unlocked
  useEffect(() => {
    if (!isUnlocked) return;
    const interval = setInterval(() => {
      setAutoLockSeconds(prev => {
        if (prev <= 1) {
          setIsUnlocked(false);
          showToast('Vault locked due to inactivity', 'info');
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
          .channel(uniqueChannelName('vault_gallery_items'))
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
      if (!avail.available) {
        showToast('Biometric hardware not detected. Enter PIN.', 'info');
        return;
      }
      const verified = await loginWithBiometrics(user.username || user.uid);
      if (verified.id !== user.id) {
        showToast('Biometric credential does not match account', 'error');
        return;
      }
      setIsUnlocked(true);
      setAutoLockSeconds(preferences.auto_lock_seconds || 60);
      showToast('Vault unlocked', 'success');
    } catch {
      // loginWithBiometrics already reported the failure; the vault stays locked.
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
      showToast('Item removed from vault', 'info');
      loadVaultItems();
    } catch (err) {
      console.error('Delete error:', err);
      showToast('Failed to delete item', 'error');
    }
  };

  const filteredItems = vaultItems.filter(item => {
    if (activeCategory === 'all') return true;
    if (activeCategory === 'photos') return !item.image_url?.endsWith('.mp4');
    if (activeCategory === 'videos') return item.image_url?.endsWith('.mp4');
    return true;
  });

  const { urls: mediaUrls, retry: retryMedia } = useGalleryUrls(vaultItems);
  const photoCount = vaultItems.filter(i => !i.image_url?.endsWith('.mp4')).length;
  const videoCount = vaultItems.filter(i => i.image_url?.endsWith('.mp4')).length;

  // Locked State
  if (!isUnlocked) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] p-8 card bg-vault-900 border border-vault-800 rounded-3xl anim-fade text-center select-none shadow-xl">
        <div className="w-20 h-20 rounded-3xl bg-vault-950 border border-vault-750 flex items-center justify-center text-emerald mb-6 shadow-2xl relative">
          <Lock className="w-10 h-10" />
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-950 border-2 border-vault-950 flex items-center justify-center">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald" />
          </div>
        </div>

        <h2 className="t-h1 text-white tracking-tight m-0">Protected Vault</h2>
        <p className="t-sm c2 max-w-sm mt-2 mb-6">
          Enter your vault PIN or use biometric authentication to view protected items.
        </p>

        {/* Biometric Trigger (only if supported) */}
        {isBiometricSupported && (
          <button
            type="button"
            onClick={handleUnlockWithBiometrics}
            disabled={isAuthenticating}
            className="btn btn-s w-full max-w-xs h-12 rounded-xl mb-4 font-semibold text-sm shadow-md"
          >
            <Fingerprint className="w-5 h-5 text-emerald" />
            <span>{isAuthenticating ? 'Scanning...' : 'Unlock with Biometrics'}</span>
          </button>
        )}

        {isBiometricSupported && (
          <div className="flex items-center gap-3 w-full max-w-xs my-2 text-vault-600">
            <div className="flex-1 h-px bg-vault-800" />
            <span className="t-over text-[10px] text-vault-400">or enter PIN</span>
            <div className="flex-1 h-px bg-vault-800" />
          </div>
        )}

        {/* PIN Form */}
        <form onSubmit={handlePinSubmit} className="w-full max-w-xs flex flex-col gap-3">
          <div className="relative">
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              placeholder="Enter Vault PIN (Default: 2048)"
              value={pinInput}
              onChange={e => {
                setPinInput(e.target.value);
                setPinError(false);
              }}
              className={`inp text-center font-mono tracking-widest ${
                pinError ? 'inp-err' : ''
              }`}
            />
            <KeyRound className="w-4 h-4 text-vault-500 absolute left-3.5 top-3.5 pointer-events-none" />
          </div>

          <button
            type="submit"
            className="btn btn-p w-full h-12 rounded-xl font-bold text-sm shadow-lg"
          >
            Unlock Vault
          </button>
        </form>

        <div className="mt-8 flex items-center gap-2 text-xs text-vault-500 font-mono">
          <FolderLock className="w-4 h-4 text-emerald" />
          <span>PROTECTED LOCAL STORAGE</span>
        </div>
      </div>
    );
  }

  // Unlocked State
  return (
    <div className="flex flex-col gap-4 pb-4 anim-fade select-none">
      {/* Vault Status Header */}
      <div className="card p-4 bg-vault-900 border border-vault-800 rounded-2xl flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-950/80 border border-emerald/40 flex items-center justify-center text-emerald">
            <Unlock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="t-h3 font-bold text-white tracking-wide m-0">Vault Storage</h2>
              <span className="tag tag-em mono !text-[10px] !h-5 !px-2">
                UNLOCKED
              </span>
            </div>
            <p className="t-sm c2 flex items-center gap-1.5 mt-0.5 m-0">
              <Clock className="w-3.5 h-3.5 text-gold" />
              <span>Auto-locks in {autoLockSeconds}s</span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLockVault}
          className="btn btn-s btn-sm hover:!border-red-500/50 hover:!text-red-400"
          title="Lock Vault"
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Lock Now</span>
        </button>
      </div>

      {/* Folders Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setActiveCategory('all')}
          className={`card card-interactive p-4 rounded-xl text-left cursor-pointer ${
            activeCategory === 'all'
              ? 'bg-vault-850 border-emerald text-white shadow-md'
              : 'bg-vault-900 border-vault-800 text-vault-400 hover:text-white'
          }`}
        >
          <FolderLock className={`w-5 h-5 mb-2 ${activeCategory === 'all' ? 'text-emerald' : 'text-vault-500'}`} />
          <p className="t-label text-white m-0 leading-tight">All Items</p>
          <p className="t-cap mono c3 mt-1 m-0">{vaultItems.length} items</p>
        </button>

        <button
          type="button"
          onClick={() => setActiveCategory('photos')}
          className={`card card-interactive p-4 rounded-xl text-left cursor-pointer ${
            activeCategory === 'photos'
              ? 'bg-vault-850 border-emerald text-white shadow-md'
              : 'bg-vault-900 border-vault-800 text-vault-400 hover:text-white'
          }`}
        >
          <ImageIcon className={`w-5 h-5 mb-2 ${activeCategory === 'photos' ? 'text-emerald' : 'text-vault-500'}`} />
          <p className="t-label text-white m-0 leading-tight">Photos</p>
          <p className="t-cap mono c3 mt-1 m-0">{photoCount} items</p>
        </button>

        <button
          type="button"
          onClick={() => setActiveCategory('videos')}
          className={`card card-interactive p-4 rounded-xl text-left cursor-pointer ${
            activeCategory === 'videos'
              ? 'bg-vault-850 border-emerald text-white shadow-md'
              : 'bg-vault-900 border-vault-800 text-vault-400 hover:text-white'
          }`}
        >
          <Video className={`w-5 h-5 mb-2 ${activeCategory === 'videos' ? 'text-emerald' : 'text-vault-500'}`} />
          <p className="t-label text-white m-0 leading-tight">Videos</p>
          <p className="t-cap mono c3 mt-1 m-0">{videoCount} items</p>
        </button>

        <button
          type="button"
          onClick={() => setActiveCategory('documents')}
          className={`card card-interactive p-4 rounded-xl text-left cursor-pointer ${
            activeCategory === 'documents'
              ? 'bg-vault-850 border-emerald text-white shadow-md'
              : 'bg-vault-900 border-vault-800 text-vault-400 hover:text-white'
          }`}
        >
          <FileText className={`w-5 h-5 mb-2 ${activeCategory === 'documents' ? 'text-emerald' : 'text-vault-500'}`} />
          <p className="t-label text-white m-0 leading-tight">Documents</p>
          <p className="t-cap mono c3 mt-1 m-0">0 items</p>
        </button>
      </div>

      {/* Vault Items Grid */}
      {loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="sk aspect-square rounded-xl" />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="card p-12 bg-vault-900 border border-vault-800 rounded-2xl text-center space-y-3">
          <FolderLock className="w-10 h-10 text-vault-500 mx-auto" />
          <h3 className="t-h3 font-semibold text-white m-0">Vault is Empty</h3>
          <p className="t-sm c2 max-w-xs mx-auto m-0">
            Use the Camera tab or Gallery to store personal media in this protected vault.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {filteredItems.map(item => (
            <div
              key={item.id}
              onClick={() => setSelectedItem(item)}
              className="group relative aspect-square rounded-xl overflow-hidden bg-vault-950 border border-vault-800 cursor-pointer hover:border-emerald transition-all"
            >
              <MediaImage
                state={mediaUrls[item.id] ?? { status: 'loading' }}
                alt={item.caption || 'Vault item'}
                imgClassName="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                onRetry={() => retryMedia(item.storage_path)}
                compact
              />
              <div className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/70 backdrop-blur-sm border border-vault-700">
                <ShieldCheck className="w-3 h-3 text-emerald" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox / Inspector Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col justify-between p-4 sm:p-6 anim-modal">
          {/* Top Bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="tag tag-em mono">
                🔒 PROTECTED ITEM
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleDeleteItem(selectedItem)}
                className="ib ib-s hover:!border-red-500/50 hover:!text-red-400 rounded-full"
                title="Delete Item"
              >
                <Trash className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="ib ib-s rounded-full text-white"
                aria-label="Close viewer"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Media Center */}
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="relative w-full h-full max-h-[70vh] rounded-2xl overflow-hidden">
              <MediaImage
                state={mediaUrls[selectedItem.id] ?? { status: 'loading' }}
                alt={selectedItem.caption || 'Vault item'}
                imgClassName="w-full h-full object-contain"
                onRetry={() => retryMedia(selectedItem.storage_path)}
                loading="eager"
              />
            </div>
          </div>

          {/* Bottom Info */}
          <div className="card bg-vault-900 border border-vault-800 rounded-2xl p-4 max-w-md mx-auto w-full text-center">
            <p className="t-cap mono c3 m-0">
              Created: {new Date(selectedItem.created_at).toLocaleString()}
            </p>
            <p className="t-sm c2 mt-1 m-0">{selectedItem.caption || 'Vault Item'}</p>
          </div>
        </div>
      )}
    </div>
  );
};
