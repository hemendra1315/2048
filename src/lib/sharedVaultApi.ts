import { supabase, isSupabaseConfigured, isMockBackendAllowed } from './supabase';
import { SharedVaultItem, SharedVaultAlbum, AdminSharedVaultSummary, GalleryItem, UserProfile } from '../types';
import { logAdminAction } from './adminApi';

const backendIsSupabase = () => {
  if (isSupabaseConfigured()) return true;
  if (isMockBackendAllowed()) return false;
  throw new Error('Server is not configured');
};

const LOCAL_SHARED_VAULT_KEY = 'vault_shared_items';
const LOCAL_SHARED_ALBUMS_KEY = 'vault_shared_albums';

// Signed URL Cache Manager (50 min TTL)
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

function getCachedSignedUrl(path: string): string | null {
  const cached = signedUrlCache.get(path);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }
  return null;
}

function setCachedSignedUrl(path: string, url: string): void {
  signedUrlCache.set(path, {
    url,
    expiresAt: Date.now() + 50 * 60 * 1000,
  });
}

function getLocalSharedVaultItems(): SharedVaultItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_SHARED_VAULT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalSharedVaultItems(items: SharedVaultItem[]): void {
  try {
    localStorage.setItem(LOCAL_SHARED_VAULT_KEY, JSON.stringify(items));
  } catch (err) {
    console.warn('[shared-vault] local save error:', err);
  }
}

function getLocalSharedAlbums(): SharedVaultAlbum[] {
  try {
    const raw = localStorage.getItem(LOCAL_SHARED_ALBUMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalSharedAlbums(albums: SharedVaultAlbum[]): void {
  try {
    localStorage.setItem(LOCAL_SHARED_ALBUMS_KEY, JSON.stringify(albums));
  } catch (err) {
    console.warn('[shared-vault] local albums save error:', err);
  }
}

// ==========================================
// ALBUM API METHODS
// ==========================================

/** List all albums for a conversation */
export async function listSharedVaultAlbums(conversationId: string): Promise<SharedVaultAlbum[]> {
  const localAlbums = getLocalSharedAlbums().filter(a => a.conversation_id === conversationId);
  const localItems = getLocalSharedVaultItems().filter(i => i.conversation_id === conversationId && !i.deleted_at);

  if (!backendIsSupabase()) {
    return localAlbums.map(album => ({
      ...album,
      item_count: localItems.filter(i => i.album_id === album.id).length,
    })).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  try {
    const { data, error } = await supabase
      .from('shared_vault_albums')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[shared-vault] album list fallback to local:', error.message);
      return localAlbums.map(album => ({
        ...album,
        item_count: localItems.filter(i => i.album_id === album.id).length,
      }));
    }

    const albums = (data ?? []) as unknown as SharedVaultAlbum[];
    // Count items per album
    const { data: itemCounts } = await supabase
      .from('shared_vault_items')
      .select('album_id')
      .eq('conversation_id', conversationId)
      .is('deleted_at', null);

    const counts = new Map<string, number>();
    for (const item of (itemCounts ?? [])) {
      if (item.album_id) {
        counts.set(item.album_id, (counts.get(item.album_id) || 0) + 1);
      }
    }

    return albums.map(a => ({
      ...a,
      item_count: counts.get(a.id) || 0,
    }));
  } catch (err) {
    console.warn('[shared-vault] album list error:', err);
    return localAlbums;
  }
}

/** Create a new Shared Vault album */
export async function createSharedVaultAlbum(
  album: Omit<SharedVaultAlbum, 'id' | 'created_at' | 'updated_at' | 'item_count'>
): Promise<SharedVaultAlbum> {
  const newAlbum: SharedVaultAlbum = {
    ...album,
    id: `sva_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    item_count: 0,
  };

  const local = getLocalSharedAlbums();
  local.unshift(newAlbum);
  saveLocalSharedAlbums(local);

  if (!backendIsSupabase()) {
    return newAlbum;
  }

  try {
    const { data, error } = await supabase
      .from('shared_vault_albums')
      .insert({
        conversation_id: album.conversation_id,
        created_by: album.created_by,
        title: album.title,
        description: album.description || null,
        cover_url: album.cover_url || null,
        gradient_preset: album.gradient_preset || 'sunset',
        is_locked: album.is_locked || false,
      })
      .select()
      .single();

    if (!error && data) {
      return { ...(data as unknown as SharedVaultAlbum), item_count: 0 };
    }
  } catch (err) {
    console.warn('[shared-vault] remote album create fallback to local:', err);
  }

  return newAlbum;
}

/** Update an album's details */
export async function updateSharedVaultAlbum(
  albumId: string,
  updates: Partial<SharedVaultAlbum>
): Promise<SharedVaultAlbum | null> {
  const local = getLocalSharedAlbums();
  const index = local.findIndex(a => a.id === albumId);
  let updatedAlbum: SharedVaultAlbum | null = null;

  if (index !== -1) {
    updatedAlbum = {
      ...local[index],
      ...updates,
      updated_at: new Date().toISOString(),
    };
    local[index] = updatedAlbum;
    saveLocalSharedAlbums(local);
  }

  if (backendIsSupabase()) {
    try {
      const { data } = await supabase
        .from('shared_vault_albums')
        .update({
          title: updates.title,
          description: updates.description,
          cover_url: updates.cover_url,
          gradient_preset: updates.gradient_preset,
          is_locked: updates.is_locked,
          updated_at: new Date().toISOString(),
        })
        .eq('id', albumId)
        .select()
        .single();

      if (data) return data as unknown as SharedVaultAlbum;
    } catch (err) {
      console.warn('[shared-vault] album update error:', err);
    }
  }

  return updatedAlbum;
}

/** Delete an album (items inside will have album_id set to null) */
export async function deleteSharedVaultAlbum(albumId: string): Promise<boolean> {
  const local = getLocalSharedAlbums().filter(a => a.id !== albumId);
  saveLocalSharedAlbums(local);

  // Unlink items locally
  const localItems = getLocalSharedVaultItems().map(i => (i.album_id === albumId ? { ...i, album_id: null } : i));
  saveLocalSharedVaultItems(localItems);

  if (backendIsSupabase()) {
    try {
      await supabase.from('shared_vault_albums').delete().eq('id', albumId);
    } catch (err) {
      console.warn('[shared-vault] album delete error:', err);
    }
  }

  return true;
}

// ==========================================
// ITEM API METHODS
// ==========================================

export interface ListSharedVaultItemsOptions {
  albumId?: string | null;
  includeDeleted?: boolean;
}

/** List all vaulted items for a conversation */
export async function listSharedVaultItems(
  conversationId: string,
  options: ListSharedVaultItemsOptions = {}
): Promise<SharedVaultItem[]> {
  const { albumId, includeDeleted = false } = options;

  if (!backendIsSupabase()) {
    let local = getLocalSharedVaultItems().filter(i => i.conversation_id === conversationId);
    if (!includeDeleted) {
      local = local.filter(i => !i.deleted_at);
    } else {
      local = local.filter(i => Boolean(i.deleted_at));
    }
    if (albumId !== undefined) {
      local = local.filter(i => (albumId === null ? !i.album_id : i.album_id === albumId));
    }
    return local.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  let query = supabase
    .from('shared_vault_items')
    .select('*')
    .eq('conversation_id', conversationId);

  if (!includeDeleted) {
    query = query.is('deleted_at', null);
  } else {
    query = query.not('deleted_at', 'is', null);
  }

  if (albumId !== undefined) {
    query = albumId === null ? query.is('album_id', null) : query.eq('album_id', albumId);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    console.warn('[shared-vault] list error, using local cache:', error.message);
    let local = getLocalSharedVaultItems().filter(i => i.conversation_id === conversationId);
    if (!includeDeleted) {
      local = local.filter(i => !i.deleted_at);
    }
    return local.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  const items = (data ?? []) as unknown as SharedVaultItem[];
  
  // Batch sign storage paths with memory caching
  const pathsToSign: string[] = [];
  for (const item of items) {
    if (item.storage_path && !getCachedSignedUrl(item.storage_path)) {
      pathsToSign.push(item.storage_path);
    }
  }

  if (pathsToSign.length > 0) {
    try {
      const { data: signed } = await supabase.storage.from('gallery').createSignedUrls(pathsToSign, 3600);
      for (const s of signed ?? []) {
        if (s.path && s.signedUrl && !s.error) {
          setCachedSignedUrl(s.path, s.signedUrl);
        }
      }
    } catch (err) {
      console.warn('[shared-vault] batch signing error:', err);
    }
  }

  return items.map(i => ({
    ...i,
    media_url: i.storage_path && getCachedSignedUrl(i.storage_path) ? getCachedSignedUrl(i.storage_path)! : i.media_url,
  }));
}

/** Save an item to the Shared Vault */
export async function saveToSharedVault(
  item: Omit<SharedVaultItem, 'id' | 'created_at' | 'updated_at' | 'starred_by' | 'is_favorite'>
): Promise<SharedVaultItem> {
  const newItem: SharedVaultItem = {
    ...item,
    id: `sv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    album_id: item.album_id || null,
    is_favorite: false,
    starred_by: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Save locally first
  const local = getLocalSharedVaultItems();
  local.unshift(newItem);
  saveLocalSharedVaultItems(local);

  if (!backendIsSupabase()) {
    return newItem;
  }

  try {
    const { data, error } = await supabase
      .from('shared_vault_items')
      .insert({
        conversation_id: item.conversation_id,
        saved_by: item.saved_by,
        album_id: item.album_id || null,
        message_id: item.message_id || null,
        media_type: item.media_type,
        media_url: item.media_url,
        storage_path: item.storage_path || null,
        caption: item.caption || null,
        memory_date: item.memory_date || new Date().toISOString(),
        file_name: item.file_name || null,
        file_size: item.file_size || null,
        mime_type: item.mime_type || null,
        duration_seconds: item.duration_seconds || null,
        tags: item.tags || [],
        metadata: item.metadata || {},
        is_favorite: false,
        starred_by: [],
      })
      .select()
      .single();

    if (!error && data) {
      return data as unknown as SharedVaultItem;
    }
  } catch (err) {
    console.warn('[shared-vault] remote save fallback to local:', err);
  }

  return newItem;
}

/** Move a list of items into an album */
export async function moveItemsToAlbum(itemIds: string[], albumId: string | null): Promise<void> {
  const idSet = new Set(itemIds);
  const local = getLocalSharedVaultItems().map(i => (idSet.has(i.id) ? { ...i, album_id: albumId, updated_at: new Date().toISOString() } : i));
  saveLocalSharedVaultItems(local);

  if (backendIsSupabase()) {
    try {
      await supabase
        .from('shared_vault_items')
        .update({ album_id: albumId, updated_at: new Date().toISOString() })
        .in('id', itemIds);
    } catch (err) {
      console.warn('[shared-vault] move items error:', err);
    }
  }
}

/** Toggle favorite/star status */
export async function toggleStarSharedVaultItem(
  itemId: string,
  userId: string
): Promise<SharedVaultItem | null> {
  const local = getLocalSharedVaultItems();
  const index = local.findIndex(i => i.id === itemId);
  let updatedItem: SharedVaultItem | null = null;

  if (index !== -1) {
    const item = local[index];
    const starredBy = new Set(item.starred_by || []);
    if (starredBy.has(userId)) {
      starredBy.delete(userId);
    } else {
      starredBy.add(userId);
    }
    const newStarredBy = Array.from(starredBy);
    updatedItem = {
      ...item,
      starred_by: newStarredBy,
      is_favorite: newStarredBy.length > 0,
      updated_at: new Date().toISOString(),
    };
    local[index] = updatedItem;
    saveLocalSharedVaultItems(local);
  }

  if (backendIsSupabase() && updatedItem) {
    try {
      await supabase
        .from('shared_vault_items')
        .update({
          starred_by: updatedItem.starred_by,
          is_favorite: updatedItem.is_favorite,
          updated_at: updatedItem.updated_at,
        })
        .eq('id', itemId);
    } catch (err) {
      console.warn('[shared-vault] remote star update error:', err);
    }
  }

  return updatedItem;
}

/** Soft delete an item (moves to 30-day Trash) */
export async function softDeleteSharedVaultItem(itemId: string): Promise<boolean> {
  const local = getLocalSharedVaultItems();
  const index = local.findIndex(i => i.id === itemId);
  if (index !== -1) {
    local[index] = {
      ...local[index],
      deleted_at: new Date().toISOString(),
    };
    saveLocalSharedVaultItems(local);
  }

  if (backendIsSupabase()) {
    try {
      await supabase
        .from('shared_vault_items')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', itemId);
    } catch (err) {
      console.warn('[shared-vault] soft delete error:', err);
    }
  }

  return true;
}

/** Restore a soft-deleted item */
export async function restoreSharedVaultItem(itemId: string): Promise<boolean> {
  const local = getLocalSharedVaultItems();
  const index = local.findIndex(i => i.id === itemId);
  if (index !== -1) {
    local[index] = {
      ...local[index],
      deleted_at: null,
    };
    saveLocalSharedVaultItems(local);
  }

  if (backendIsSupabase()) {
    try {
      await supabase
        .from('shared_vault_items')
        .update({ deleted_at: null })
        .eq('id', itemId);
    } catch (err) {
      console.warn('[shared-vault] restore error:', err);
    }
  }

  return true;
}

/** Permanent delete an item from the Shared Vault */
export async function deleteSharedVaultItem(itemId: string, actorUserId?: string): Promise<boolean> {
  const local = getLocalSharedVaultItems().filter(i => i.id !== itemId);
  saveLocalSharedVaultItems(local);

  if (backendIsSupabase()) {
    try {
      let query = supabase.from('shared_vault_items').delete().eq('id', itemId);
      if (actorUserId) {
        query = query.eq('saved_by', actorUserId);
      }
      await query;
    } catch (err) {
      console.warn('[shared-vault] permanent delete error:', err);
    }
  }

  return true;
}

/** Clone a shared vault item to personal gallery */
export async function cloneToPersonalVault(
  sharedItem: SharedVaultItem,
  userId: string
): Promise<GalleryItem | null> {
  const newGalleryItem: GalleryItem = {
    id: `gal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    user_id: userId,
    image_url: sharedItem.media_url,
    storage_path: sharedItem.storage_path || '',
    caption: sharedItem.caption ? `Shared: ${sharedItem.caption}` : 'Saved from Shared Vault',
    created_at: new Date().toISOString(),
    is_favorite: false,
  };

  if (!backendIsSupabase()) {
    return newGalleryItem;
  }

  try {
    const { data } = await supabase
      .from('gallery_items')
      .insert({
        user_id: userId,
        image_url: sharedItem.media_url,
        storage_path: sharedItem.storage_path || null,
        caption: sharedItem.caption ? `Shared: ${sharedItem.caption}` : 'Saved from Shared Vault',
      })
      .select()
      .single();

    return (data as unknown as GalleryItem) || newGalleryItem;
  } catch (err) {
    console.warn('[shared-vault] clone error:', err);
    return newGalleryItem;
  }
}

/** Admin: List all conversation shared vaults */
export async function listAdminSharedVaults(): Promise<AdminSharedVaultSummary[]> {
  if (!backendIsSupabase()) {
    return [];
  }

  try {
    const [convRes, itemsRes, profRes] = await Promise.all([
      supabase.from('conversations').select('id, user_a, user_b, created_at, updated_at'),
      supabase.from('shared_vault_items').select('conversation_id, media_type, created_at').is('deleted_at', null),
      supabase.from('profiles').select('id, username, display_name, avatar_url'),
    ]);

    const convs = (convRes.data ?? []) as Array<{ id: string; user_a: string; user_b: string; created_at: string; updated_at: string }>;
    const items = (itemsRes.data ?? []) as Array<{ conversation_id: string; media_type: string; created_at: string }>;
    const profs = (profRes.data ?? []) as UserProfile[];

    const profMap = new Map<string, UserProfile>(profs.map(p => [p.id, p]));

    const fallbackUser = (id: string): UserProfile => ({
      id,
      uid: id,
      username: 'unknown',
      display_name: 'Unknown User',
      avatar_url: null,
      role: 'user',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const summaries: AdminSharedVaultSummary[] = [];

    for (const c of convs) {
      const convItems = items.filter(i => i.conversation_id === c.id);
      if (convItems.length === 0) continue;

      let lastAct = c.updated_at || c.created_at;
      for (const it of convItems) {
        if (new Date(it.created_at).getTime() > new Date(lastAct).getTime()) {
          lastAct = it.created_at;
        }
      }

      summaries.push({
        conversation_id: c.id,
        user_a: profMap.get(c.user_a) || fallbackUser(c.user_a),
        user_b: profMap.get(c.user_b) || fallbackUser(c.user_b),
        total_photos: convItems.filter(i => i.media_type === 'image').length,
        total_videos: convItems.filter(i => i.media_type === 'video').length,
        total_audio: convItems.filter(i => i.media_type === 'audio').length,
        total_text_memories: convItems.filter(i => i.media_type === 'text_memory').length,
        last_activity_at: lastAct,
        created_at: c.created_at,
      });
    }

    return summaries.sort((a, b) => new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime());
  } catch (err) {
    console.error('[admin] shared vault list error:', err);
    return [];
  }
}

/** Admin alias */
export async function listAllSharedVaultsForAdmin(_adminId?: string): Promise<AdminSharedVaultSummary[]> {
  return listAdminSharedVaults();
}

/** Admin: Purge an entire shared vault */
export async function purgeSharedVaultAsAdmin(conversationId: string, adminId: string): Promise<boolean> {
  if (!backendIsSupabase()) return true;

  try {
    const { error } = await supabase.from('shared_vault_items').delete().eq('conversation_id', conversationId);
    if (error) throw error;

    await logAdminAction(adminId, 'purge_shared_vault', conversationId, JSON.stringify({ conversation_id: conversationId }));
    return true;
  } catch (err) {
    console.error('[admin] purge shared vault failed:', err);
    throw err;
  }
}
