import React, { useState } from 'react';
import { X, Search, UserPlus, Shield, Check, AlertCircle } from 'lucide-react';
import { UserProfile } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { mockBackend } from '../../lib/mockBackend';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';

interface AddPersonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRequestSent: () => void;
}

export const AddPersonModal: React.FC<AddPersonModalProps> = ({
  isOpen,
  onClose,
  onRequestSent,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [searchUid, setSearchUid] = useState('');
  const [searching, setSearching] = useState(false);
  const [targetProfile, setTargetProfile] = useState<UserProfile | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  if (!isOpen) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUid = searchUid.trim().toUpperCase();
    if (!cleanUid) return;

    if (user?.uid === cleanUid) {
      showToast('You cannot add your own UID', 'error');
      return;
    }

    setSearching(true);
    setHasSearched(true);
    setTargetProfile(null);
    setRequestSent(false);

    try {
      if (isSupabaseConfigured()) {
        const { data: rawProfile, error } = await supabase
          .from('profiles')
          .select('*')
          .or(`uid.eq.${cleanUid},username.eq.${cleanUid.toLowerCase()}`)
          .maybeSingle();

        if (error) throw error;
        if (rawProfile) {
          setTargetProfile(rawProfile as unknown as UserProfile);
        } else {
          setTargetProfile(null);
        }
      } else {
        const profile = mockBackend.lookupProfileByUid(cleanUid);
        setTargetProfile(profile);
      }
    } catch (err) {
      console.error('Search error:', err);
      showToast('Error searching UID', 'error');
    } finally {
      setSearching(false);
    }
  };

  const handleSendRequest = async () => {
    if (!user || !targetProfile) return;
    try {
      if (isSupabaseConfigured()) {
        const { error } = await supabase
          .from('connection_requests')
          .insert({
            sender_id: user.id,
            receiver_id: targetProfile.id,
          } as unknown as { sender_id: string; receiver_id: string });
        if (error) throw error;
      } else {
        mockBackend.sendConnectionRequest(user.id, targetProfile.id);
      }
      setRequestSent(true);
      showToast(`Request sent to ${targetProfile.display_name}`, 'success');
      onRequestSent();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send request';
      showToast(msg, 'error');
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
          <UserPlus className="w-5 h-5 text-arcade-gold" />
          <h3 className="text-base font-bold text-white">Add Person by UID</h3>
        </div>
        <p className="text-xs text-vault-400 mb-4">
          Enter the exact unique UID provided by your connection.
        </p>

        {/* Search Form */}
        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
          <input
            type="text"
            required
            value={searchUid}
            onChange={e => setSearchUid(e.target.value)}
            placeholder="e.g. SOLAR-8120"
            className="flex-1 bg-vault-950 border border-vault-700 focus:border-arcade-gold rounded-xl px-3.5 py-2.5 text-sm font-mono text-white placeholder-vault-600 outline-none uppercase"
          />
          <button
            type="submit"
            disabled={searching}
            className="bg-arcade-gold hover:bg-amber-400 active:scale-95 disabled:opacity-50 text-vault-950 font-bold px-4 rounded-xl flex items-center justify-center shadow-md transition-all"
          >
            <Search className="w-4 h-4" />
          </button>
        </form>

        {/* Search Result */}
        {searching && (
          <div className="p-6 text-center text-xs text-vault-400 flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-arcade-gold border-t-transparent rounded-full animate-spin" />
            <span>Scanning Vault Registry...</span>
          </div>
        )}

        {!searching && hasSearched && !targetProfile && (
          <div className="bg-vault-950/60 border border-vault-800 rounded-2xl p-4 text-center">
            <AlertCircle className="w-6 h-6 text-rose-400 mx-auto mb-1.5" />
            <div className="text-xs font-bold text-white">No Identity Found</div>
            <p className="text-[11px] text-vault-400 mt-0.5">
              Verify the exact UID casing and characters.
            </p>
          </div>
        )}

        {!searching && targetProfile && (
          <div className="bg-vault-950/80 border border-vault-700/80 rounded-2xl p-4 animate-slide-up">
            <div className="flex items-center gap-3 mb-3">
              <img
                src={targetProfile.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${targetProfile.uid}`}
                alt="Target"
                className="w-12 h-12 rounded-xl bg-vault-800 border border-vault-700 object-cover"
              />
              <div>
                <h4 className="text-sm font-bold text-white leading-tight">
                  {targetProfile.display_name}
                </h4>
                <div className="flex items-center gap-1 text-[11px] font-mono text-arcade-gold mt-0.5">
                  <Shield className="w-3 h-3" />
                  <span>{targetProfile.uid}</span>
                </div>
              </div>
            </div>

            {requestSent ? (
              <div className="bg-emerald-950/60 border border-emerald-600/50 text-emerald-300 text-xs font-bold p-2.5 rounded-xl flex items-center justify-center gap-1.5">
                <Check className="w-4 h-4" /> Request Dispatched
              </div>
            ) : (
              <button
                onClick={handleSendRequest}
                className="w-full bg-arcade-gold hover:bg-amber-400 active:scale-95 text-vault-950 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md transition-all"
              >
                <UserPlus className="w-4 h-4" />
                <span>Send Connection Request</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
