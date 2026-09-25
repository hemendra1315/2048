import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Lock, Unlock, FolderLock, Clock, ArrowLeft } from 'lucide-react';
import { GalleryItem } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useVault } from '../../context/VaultContext';
import { supabase, isSupabaseConfigured, signGalleryUrls } from '../../lib/supabase';
import { mockBackend } from '../../lib/mockBackend';
import { handleImageError } from '../../lib/utils';
import { LockedGate } from './vaultView/LockedGate';
import { CategoryTabs, VaultCategory } from './vaultView/CategoryTabs';
import { VaultLightbox } from './vaultView/VaultLightbox';

interface VaultViewProps {
  onClose?: () => void;
}

export const VaultView: React.FC<VaultViewProps> = ({ onClose }) => {
  const { user, loginWithBiometrics } = useAuth();
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
        if (data) setVaultItems(await signGalleryUrls(data as unknown as GalleryItem[]));
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
      // Runs the real server-verified WebAuthn ceremony - a signature check against the
      // user's enrolled credential, not just a check that some authenticator exists.
      await loginWithBiometrics(user.username);
      setIsUnlocked(true);
      setAutoLockSeconds(preferences.auto_lock_seconds || 60);
      showToast('Unlocked with fingerprint', 'success');
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
        if (item.storage_path) {
          await supabase.storage.from('gallery').remove([item.storage_path]);
        }
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
      <LockedGate
        onClose={onClose}
        isAuthenticating={isAuthenticating}
        onUnlockWithBiometrics={handleUnlockWithBiometrics}
        pinInput={pinInput}
        setPinInput={setPinInput}
        pinError={pinError}
        setPinError={setPinError}
        onPinSubmit={handlePinSubmit}
      />
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
      <CategoryTabs activeCategory={activeCategory} setActiveCategory={setActiveCategory} itemCount={vaultItems.length} />

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
        <VaultLightbox item={selectedItem} onClose={() => setSelectedItem(null)} onDelete={handleDeleteItem} />
      )}
    </div>
  );
};
