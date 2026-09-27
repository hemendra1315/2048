import React, { useState, useEffect, useCallback } from 'react';
import { Rocket, Loader2, CheckCircle2 } from 'lucide-react';
import { getAppUpdateNotice, setAppUpdateNotice, type AppUpdateNotice } from '../../lib/appUpdateApi';
import { useToast } from '../../context/ToastContext';
import { lightImpact, mediumImpact, errorWarning } from '../../lib/haptics';

/** Admin page: publish the "latest APK version + download link" notice every signed-in
 *  client checks for right after PIN unlock (see App.tsx / UpdateAvailableModal). */
export const AppUpdateView: React.FC = () => {
  const { showToast } = useToast();
  const [current, setCurrent] = useState<AppUpdateNotice | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [version, setVersion] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const notice = await getAppUpdateNotice();
      setCurrent(notice);
      if (notice) {
        setVersion(notice.latest_version);
        setUrl(notice.update_url);
        setNotes(notice.release_notes || '');
      }
    } catch (err) {
      console.error('Failed to load app update notice:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handlePublish = async () => {
    const trimmedVersion = version.trim();
    const trimmedUrl = url.trim();
    if (!trimmedVersion || !trimmedUrl) {
      showToast('Version and update link are both required', 'error');
      errorWarning();
      return;
    }
    try {
      new URL(trimmedUrl);
    } catch {
      showToast('Update link must be a valid URL', 'error');
      errorWarning();
      return;
    }

    setSaving(true);
    mediumImpact();
    try {
      const updated = await setAppUpdateNotice(trimmedVersion, trimmedUrl, notes.trim() || undefined);
      setCurrent(updated);
      showToast('Update notice published', 'success');
    } catch (err) {
      console.error('Failed to publish app update notice:', err);
      showToast(err instanceof Error ? err.message : 'Failed to publish update notice', 'error');
      errorWarning();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in max-w-xl">
      <div className="p-4 bg-vault-900 border border-vault-800 rounded-2xl">
        <h2 className="text-base font-bold text-white m-0">App Update Notice</h2>
        <p className="text-xs text-vault-400 mt-0.5 m-0">
          Every user sees an update prompt right after unlocking with their PIN when their
          installed app is older than the version published here.
        </p>
      </div>

      {loading ? (
        <div className="p-6 bg-vault-900/60 border border-vault-800 rounded-2xl animate-pulse h-32" />
      ) : (
        <>
          {current && (
            <div className="flex items-start gap-3 p-4 bg-emerald-950/30 border border-emerald-800/40 rounded-2xl">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-white m-0">
                  Currently published: v{current.latest_version}
                </p>
                <p className="text-[11px] text-vault-400 mt-0.5 m-0 break-all">{current.update_url}</p>
                <p className="text-[10px] text-vault-500 mt-1 m-0">
                  Last updated {new Date(current.updated_at).toLocaleString()}
                </p>
              </div>
            </div>
          )}

          <div className="p-4 bg-vault-900 border border-vault-800 rounded-2xl space-y-3">
            <div>
              <label className="block text-[11px] font-bold text-vault-400 uppercase tracking-wider mb-1.5">
                Latest Version
              </label>
              <input
                type="text"
                value={version}
                onChange={e => setVersion(e.target.value)}
                placeholder="e.g. 1.1.0"
                className="w-full px-3 py-2.5 rounded-xl bg-vault-950 border border-vault-800 text-sm text-white placeholder-vault-600 focus:outline-none focus:border-purple-500/60"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-vault-400 uppercase tracking-wider mb-1.5">
                Update Link
              </label>
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://…/app-release.apk"
                className="w-full px-3 py-2.5 rounded-xl bg-vault-950 border border-vault-800 text-sm text-white placeholder-vault-600 focus:outline-none focus:border-purple-500/60"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-vault-400 uppercase tracking-wider mb-1.5">
                Release Notes <span className="normal-case text-vault-600">(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="What changed in this update…"
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl bg-vault-950 border border-vault-800 text-sm text-white placeholder-vault-600 focus:outline-none focus:border-purple-500/60 resize-none"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                lightImpact();
                void handlePublish();
              }}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold text-xs shadow-lg active:scale-95 transition-transform disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
              <span>{saving ? 'Publishing…' : 'Publish Update'}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};
