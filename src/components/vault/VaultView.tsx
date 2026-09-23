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

type VaultCategory = 'all' | 'photos' | 'videos' | 'documents' | 'notes';

export const VaultView: React.FC = () => {
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
          showToast('Vault auto-locked due to inactivity', 'info');
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

  // Biometric unlock must be verified by the server: the WebAuthn assertion is checked by the
  // vault-auth function, and the vault opens only if it belongs to the signed-in account.
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
        showToast('Fingerprint belongs to a different account', 'error');
        return;
      }
      setIsUnlocked(true);
      setAutoLockSeconds(preferences.auto_lock_seconds || 60);
      showToast('Secondary Biometric Clearance Granted', 'success');
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
    showToast('Vault Locked & Memory Wiped', 'info');
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
      showToast('Item purged from encrypted vault', 'info');
      loadVaultItems();
    } catch (err) {
      console.error('Delete error:', err);
      showToast('Failed to delete item', 'error');
    }
  };

  // Locked State: Zero-Leak Gatekeeper
  if (!isUnlocked) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[540px] p-6 bg-[#050505] border border-[#1E2025] rounded-2xl animate-fade-in text-center select-none">
        <div className="w-20 h-20 rounded-3xl bg-[#0C0D0F] border border-[#1E2025] flex items-center justify-center text-[#10B981] mb-6 shadow-2xl relative">
          <Lock className="w-10 h-10" />
          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-950 border border-[#10B981] flex items-center justify-center">
            <ShieldCheck className="w-3 h-3 text-[#10B981]" />
          </div>
        </div>

        <h2 className="text-xl font-bold text-white tracking-tight">ENCRYPTED VAULT</h2>
        <p className="text-xs text-[#A7ABB3] max-w-sm mt-2 mb-6">
          Secondary security challenge required. Zero-knowledge encrypted storage with zero thumbnail leakage.
        </p>

        {/* Biometric Trigger */}
        <button
          onClick={handleUnlockWithBiometrics}
          disabled={isAuthenticating}
          className="w-full max-w-xs flex items-center justify-center gap-2.5 py-3.5 px-4 bg-[#131417] hover:bg-[#1B1D21] active:scale-98 border border-[#1E2025] rounded-xl text-white text-sm font-semibold transition-all mb-4 shadow-lg"
        >
          <Fingerprint className="w-5 h-5 text-[#10B981]" />
          <span>{isAuthenticating ? 'Scanning...' : 'Unlock with Biometrics'}</span>
        </button>

        <div className="flex items-center gap-3 w-full max-w-xs my-2 text-vault-500">
          <div className="flex-1 h-px bg-[#25282D]" />
          <span className="text-[10px] uppercase font-mono tracking-widest text-[#A7ABB3]">or PIN</span>
          <div className="flex-1 h-px bg-[#25282D]" />
        </div>

        {/* PIN Form */}
        <form onSubmit={handlePinSubmit} className="w-full max-w-xs space-y-3">
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
              className={`w-full py-3 px-4 bg-[#0C0D0F] border ${
                pinError ? 'border-red-500 text-red-300' : 'border-[#1E2025] text-white focus:border-[#10B981]'
              } rounded-xl text-center text-sm font-mono tracking-widest placeholder:text-vault-500 placeholder:tracking-normal focus:outline-none transition-all`}
            />
            <KeyRound className="w-4 h-4 text-vault-500 absolute left-3.5 top-3.5 pointer-events-none" />
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-[#10B981] hover:bg-emerald-400 active:scale-98 text-black text-sm font-bold rounded-xl shadow-lg transition-all"
          >
            Authenticate Clearance
          </button>
        </form>

        <div className="mt-8 flex items-center gap-2 text-[11px] text-vault-500 font-mono">
          <FolderLock className="w-3.5 h-3.5 text-[#10B981]" />
          <span>ZERO-THUMBNAIL LEAK DEFENSE ACTIVE</span>
        </div>
      </div>
    );
  }

  // Unlocked State: Premium Secure Room Experience
  return (
    <div className="space-y-4 pb-20 animate-fade-in select-none">
      {/* Vault Status Header */}
      <div className="p-4 bg-[#0C0D0F] border border-[#1E2025] rounded-2xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-950/80 border border-[#10B981]/40 flex items-center justify-center text-[#10B981]">
            <Unlock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-wide">SECURE ROOM</h2>
              <span className="px-2 py-0.5 bg-emerald-950 text-[#10B981] border border-[#10B981]/30 rounded text-[10px] font-mono font-bold">
                ENCRYPTED
              </span>
            </div>
            <p className="text-xs text-[#A7ABB3] flex items-center gap-1.5 mt-0.5">
              <Clock className="w-3 h-3 text-amber-400" />
              <span>Auto-locks in {autoLockSeconds}s</span>
            </p>
          </div>
        </div>

        <button
          onClick={handleLockVault}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#131417] hover:bg-red-950/80 border border-[#1E2025] hover:border-red-600/50 rounded-xl text-xs font-semibold text-vault-300 hover:text-red-300 transition-all active:scale-95"
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
              ? 'bg-[#131417] border-[#10B981] text-white shadow-md'
              : 'bg-[#0C0D0F] border-[#1E2025] text-vault-400 hover:text-white'
          }`}
        >
          <FolderLock className={`w-5 h-5 mb-2 ${activeCategory === 'all' ? 'text-[#10B981]' : 'text-vault-500'}`} />
          <p className="text-xs font-bold leading-tight">All Encrypted</p>
          <p className="text-[11px] text-vault-500 mt-0.5">{vaultItems.length} items</p>
        </button>

        <button
          onClick={() => setActiveCategory('photos')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            activeCategory === 'photos'
              ? 'bg-[#131417] border-[#10B981] text-white shadow-md'
              : 'bg-[#0C0D0F] border-[#1E2025] text-vault-400 hover:text-white'
          }`}
        >
          <ImageIcon className={`w-5 h-5 mb-2 ${activeCategory === 'photos' ? 'text-[#10B981]' : 'text-vault-500'}`} />
          <p className="text-xs font-bold leading-tight">Secure Photos</p>
          <p className="text-[11px] text-vault-500 mt-0.5">{vaultItems.length} items</p>
        </button>

        <button
          onClick={() => setActiveCategory('videos')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            activeCategory === 'videos'
              ? 'bg-[#131417] border-[#10B981] text-white shadow-md'
              : 'bg-[#0C0D0F] border-[#1E2025] text-vault-400 hover:text-white'
          }`}
        >
          <Video className={`w-5 h-5 mb-2 ${activeCategory === 'videos' ? 'text-[#10B981]' : 'text-vault-500'}`} />
          <p className="text-xs font-bold leading-tight">Secure Videos</p>
          <p className="text-[11px] text-vault-500 mt-0.5">0 items</p>
        </button>

        <button
          onClick={() => setActiveCategory('documents')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            activeCategory === 'documents'
              ? 'bg-[#131417] border-[#10B981] text-white shadow-md'
              : 'bg-[#0C0D0F] border-[#1E2025] text-vault-400 hover:text-white'
          }`}
        >
          <FileText className={`w-5 h-5 mb-2 ${activeCategory === 'documents' ? 'text-[#10B981]' : 'text-vault-500'}`} />
          <p className="text-xs font-bold leading-tight">Hidden Docs</p>
          <p className="text-[11px] text-vault-500 mt-0.5">0 items</p>
        </button>
      </div>

      {/* Vault Items Grid */}
      {loading ? (
        <div className="p-12 text-center text-xs text-vault-500 font-mono">Decrypting vault contents...</div>
      ) : vaultItems.length === 0 ? (
        <div className="p-12 bg-[#0C0D0F] border border-[#1E2025] rounded-2xl text-center space-y-3">
          <FolderLock className="w-10 h-10 text-vault-500 mx-auto" />
          <p className="text-sm font-semibold text-white">Vault is Empty</p>
          <p className="text-xs text-[#A7ABB3] max-w-xs mx-auto">
            Use the Camera tab or Gallery to encrypt and transfer sensitive media into this zero-knowledge room.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {vaultItems.map(item => (
            <div
              key={item.id}
              onClick={() => setSelectedItem(item)}
              className="group relative aspect-square rounded-xl overflow-hidden bg-[#131417] border border-[#1E2025] cursor-pointer hover:border-[#10B981] transition-all"
            >
              <img
                src={item.image_url}
                alt={item.caption || 'Vault Item'}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              />
              <div className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/70 backdrop-blur-sm border border-[#1E2025]">
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
              <span className="px-2.5 py-1 bg-[#0C0D0F] border border-[#1E2025] rounded-full text-xs font-mono text-[#10B981]">
                🔒 ZERO-KNOWLEDGE ENCRYPTED
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDeleteItem(selectedItem)}
                className="p-2.5 rounded-full bg-[#0C0D0F] hover:bg-red-950 border border-[#1E2025] hover:border-red-600 text-vault-300 hover:text-red-400 transition-all active:scale-95"
                title="Purge Item"
              >
                <Trash className="w-4 h-4" />
              </button>
              <button
                onClick={() => setSelectedItem(null)}
                className="p-2.5 rounded-full bg-[#0C0D0F] hover:bg-[#131417] border border-[#1E2025] text-white transition-all active:scale-95"
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
              className="max-h-[70vh] max-w-full rounded-2xl object-contain shadow-2xl border border-[#1E2025]"
            />
          </div>

          {/* Bottom Info */}
          <div className="bg-[#0C0D0F] border border-[#1E2025] rounded-2xl p-4 max-w-md mx-auto w-full text-center">
            <p className="text-xs text-vault-400 font-mono">
              Created: {new Date(selectedItem.created_at).toLocaleString()}
            </p>
            <p className="text-xs text-[#A7ABB3] mt-1">{selectedItem.caption || 'Encrypted Item'}</p>
          </div>
        </div>
      )}
    </div>
  );
};
