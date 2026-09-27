import React from 'react';
import {
  ArrowLeft,
  Edit2,
  Trash2,
  Image as ImageIcon,
  Play,
  Sparkles,
  Upload,
} from 'lucide-react';
import { SharedVaultAlbum, SharedVaultItem, UserProfile } from '../../types';
import { lightImpact, mediumImpact } from '../../lib/haptics';
import { expectExternalActivity } from '../../lib/externalActivity';
import { GRADIENT_PRESETS } from './SharedVaultAlbumModal';

interface SharedVaultAlbumViewProps {
  album: SharedVaultAlbum;
  items: SharedVaultItem[];
  currentUserProfile: UserProfile;
  partnerProfile: UserProfile;
  onBack: () => void;
  onEditAlbum: () => void;
  onDeleteAlbum: () => void;
  onSelectItem: (item: SharedVaultItem) => void;
  onUploadMedia?: () => void;
}

export const SharedVaultAlbumView: React.FC<SharedVaultAlbumViewProps> = ({
  album,
  items,
  onBack,
  onEditAlbum,
  onDeleteAlbum,
  onSelectItem,
  onUploadMedia,
}) => {
  const albumPreset = GRADIENT_PRESETS.find(p => p.id === album.gradient_preset) || GRADIENT_PRESETS[0];
  const albumItems = items.filter(i => i.album_id === album.id && !i.deleted_at && (i.media_type === 'image' || i.media_type === 'video'));

  return (
    <div className="flex-1 flex flex-col h-full bg-vault-950 text-vault-100 overflow-hidden animate-fade-in">
      {/* Top Breadcrumb Navigation */}
      <header className="px-4 py-3 border-b border-vault-850 flex items-center justify-between bg-vault-900/80 backdrop-blur-md shrink-0">
        <button
          type="button"
          onClick={() => {
            lightImpact();
            onBack();
          }}
          className="flex items-center gap-2 text-vault-300 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-xs font-semibold uppercase tracking-wider text-vault-400">Shared Vault</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              lightImpact();
              onEditAlbum();
            }}
            className="ib ib-s rounded-full text-vault-400 hover:text-white"
            title="Edit Album"
          >
            <Edit2 className="i" />
          </button>
          <button
            type="button"
            onClick={() => {
              mediumImpact();
              onDeleteAlbum();
            }}
            className="ib ib-s rounded-full text-vault-400 hover:text-red-400"
            title="Delete Album"
          >
            <Trash2 className="i" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* Spacious Hero Banner */}
        <div
          className={`relative rounded-3xl bg-gradient-to-br ${albumPreset.class} p-6 sm:p-8 shadow-2xl overflow-hidden`}
        >
          <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-2 max-w-lg">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/30 backdrop-blur-md text-[11px] font-bold text-white border border-white/20">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Collection · {albumItems.length} {albumItems.length === 1 ? 'Media item' : 'Media items'}</span>
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white drop-shadow-md tracking-tight">
                {album.title}
              </h1>
              {album.description && (
                <p className="text-white/85 text-xs sm:text-sm font-medium drop-shadow leading-relaxed">
                  {album.description}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {onUploadMedia && (
                <button
                  type="button"
                  onClick={() => {
                    lightImpact();
                    expectExternalActivity();
                    onUploadMedia();
                  }}
                  className="btn btn-p shadow-xl py-2.5 px-4 text-xs font-bold rounded-2xl flex items-center gap-2 bg-white text-vault-950 hover:bg-white/90"
                >
                  <Upload className="w-4 h-4" />
                  <span>Add Photos / Videos</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Media Grid or Feed */}
        {albumItems.length === 0 ? (
          <div className="py-16 text-center space-y-3 bg-vault-900/40 rounded-3xl border border-vault-850 p-8">
            <div className="w-16 h-16 rounded-full bg-vault-850 mx-auto flex items-center justify-center text-vault-500">
              <ImageIcon className="w-8 h-8 opacity-60" />
            </div>
            <h3 className="text-sm font-bold text-white">This album is empty</h3>
            <p className="text-xs text-vault-400 max-w-sm mx-auto">
              Add photos or videos to this collection.
            </p>
            <div className="flex items-center justify-center gap-2 mt-3">
              {onUploadMedia && (
                <button
                  type="button"
                  onClick={() => {
                    expectExternalActivity();
                    onUploadMedia();
                  }}
                  className="btn btn-p py-2 px-4 text-xs font-semibold"
                >
                  <Upload className="w-4 h-4 mr-1.5 inline" /> Add Photos / Videos
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
            {albumItems.map(item => {
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    lightImpact();
                    onSelectItem(item);
                  }}
                  className="group relative aspect-square rounded-2xl overflow-hidden bg-vault-900 border border-vault-800/80 shadow-md hover:shadow-xl hover:border-purple-500/50 transition-all cursor-pointer select-none"
                >
                  {item.media_type === 'image' && (
                    <img
                      src={item.media_url}
                      alt={item.caption || 'Photo'}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  )}

                  {item.media_type === 'video' && (
                    <div className="relative w-full h-full bg-vault-950 flex items-center justify-center">
                      <video src={item.media_url} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center">
                          <Play className="w-5 h-5 fill-current ml-0.5" />
                        </div>
                      </div>
                    </div>
                  )}

                  {item.caption && (
                    <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/85 via-black/40 to-transparent">
                      <p className="text-[11px] text-white font-medium truncate drop-shadow">{item.caption}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
