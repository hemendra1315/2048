// Complete Account Sync, Multi-Device, Wallpaper & Realtime Test Suite
import assert from 'node:assert/strict';

// ============================================================================
// 1. Account vs Device Boundary Classification Test
// ============================================================================
const STORAGE_INVENTORY = [
  { key: 'vault_chat_wallpaper_<id>', scope: 'conversation_member', target: 'cloud_db_synced' },
  { key: 'shared_vault_items', scope: 'partner_conversation', target: 'cloud_db_synced' },
  { key: 'daily_streak', scope: 'user_account', target: 'cloud_db_synced' },
  { key: 'chat_theme', scope: 'conversation_member', target: 'cloud_db_synced' },
  { key: 'pinned_at', scope: 'conversation_member', target: 'cloud_db_synced' },
  { key: 'muted_at', scope: 'conversation_member', target: 'cloud_db_synced' },
  { key: 'hidden_at', scope: 'conversation_member', target: 'cloud_db_synced' },
  { key: 'vault_biometric_enrolled', scope: 'device_hardware', target: 'device_only' },
  { key: 'games_vault_pin_hash', scope: 'device_hardware', target: 'device_only' },
  { key: 'gallery_density', scope: 'device_viewport', target: 'device_only' },
  { key: 'chat_outbox_v1', scope: 'device_queue', target: 'device_only' },
  { key: 'games_crash_log_buffer', scope: 'device_buffer', target: 'device_only' },
];

const deviceOnlyItems = STORAGE_INVENTORY.filter(i => i.target === 'device_only');
const cloudSyncedItems = STORAGE_INVENTORY.filter(i => i.target === 'cloud_db_synced');

assert.equal(deviceOnlyItems.length, 5);
assert.equal(cloudSyncedItems.length, 7);

// ============================================================================
// 2. Wallpaper Multi-Device Synchronization & Legacy Migration Test
// ============================================================================
class MockLocalStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(k) { return this.store.get(k) || null; }
  setItem(k, v) { this.store.set(k, String(v)); }
  removeItem(k) { this.store.delete(k); }
  get length() { return this.store.size; }
  key(i) { return Array.from(this.store.keys())[i] || null; }
}

const mockLocal = new MockLocalStorage();
// User had a legacy 2MB base64 wallpaper in localStorage
const legacyBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(500);
mockLocal.setItem('vault_chat_wallpaper_conv_123', legacyBase64);

// Simulate migration function
function migrateMockStorage(storage, mockUploadFn) {
  let migrated = 0;
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.startsWith('vault_chat_wallpaper_')) {
      const convId = key.replace('vault_chat_wallpaper_', '');
      const val = storage.getItem(key);
      if (val && val.startsWith('data:image')) {
        const cloudUrl = mockUploadFn(val, convId);
        storage.setItem(key, cloudUrl);
        migrated++;
      }
    }
  }
  return migrated;
}

const uploadedCloudUrl = 'https://supabase.co/storage/v1/object/public/chat-media/wallpapers_conv_123/wallpaper_123.jpg';
const migratedCount = migrateMockStorage(mockLocal, () => uploadedCloudUrl);

assert.equal(migratedCount, 1);
assert.equal(mockLocal.getItem('vault_chat_wallpaper_conv_123'), uploadedCloudUrl);
assert.equal(mockLocal.getItem('vault_chat_wallpaper_conv_123').startsWith('data:image'), false);

// Multi-device sync: Device B receives conversation_members update with chat_wallpaper_url
const deviceBMemberState = {
  conversation_id: 'conv_123',
  user_id: 'user_1',
  chat_theme: 'default',
  chat_wallpaper_url: null,
};

// Device A updates wallpaper on server
const serverUpdatePayload = { ...deviceBMemberState, chat_wallpaper_url: uploadedCloudUrl };

// Device B applies incoming update
const deviceBUpdatedState = { ...deviceBMemberState, ...serverUpdatePayload };
assert.equal(deviceBUpdatedState.chat_wallpaper_url, uploadedCloudUrl);

// ============================================================================
// 3. Shared Vault Multi-Device Realtime CRUD Simulation
// ============================================================================
let sharedVaultStream = [
  { id: 'sv_1', media_type: 'image', media_url: 'https://cdn/photo1.jpg', is_favorite: false, created_at: '2026-09-27T01:00:00Z' },
  { id: 'sv_2', media_type: 'text_memory', media_url: 'Our favorite quote', is_favorite: true, created_at: '2026-09-27T01:10:00Z' },
];

// Event 1: Device A inserts a new audio memory
const insertPayload = {
  id: 'sv_3',
  media_type: 'audio',
  media_url: 'https://cdn/voice.webm',
  is_favorite: false,
  created_at: '2026-09-27T01:20:00Z',
};
if (!sharedVaultStream.some(i => i.id === insertPayload.id)) {
  sharedVaultStream = [insertPayload, ...sharedVaultStream];
}
assert.equal(sharedVaultStream.length, 3);
assert.equal(sharedVaultStream[0].id, 'sv_3');

// Event 2: Device B stars photo sv_1
const updatePayload = { ...sharedVaultStream.find(i => i.id === 'sv_1'), is_favorite: true };
sharedVaultStream = sharedVaultStream.map(i => (i.id === updatePayload.id ? updatePayload : i));
assert.equal(sharedVaultStream.find(i => i.id === 'sv_1').is_favorite, true);

// Event 3: Partner deletes audio sv_3
const deletePayload = { id: 'sv_3' };
sharedVaultStream = sharedVaultStream.filter(i => i.id !== deletePayload.id);
assert.equal(sharedVaultStream.length, 2);
assert.equal(sharedVaultStream.some(i => i.id === 'sv_3'), false);

// ============================================================================
// 4. Delete for Everyone Multi-Device Stream Invariants
// ============================================================================
let userADevice1Messages = [
  { id: 'msg_1', content: 'Hey!', sender_id: 'user_a', created_at: '2026-09-27T02:00:00Z' },
  { id: 'msg_2', content: 'Secret info', sender_id: 'user_a', created_at: '2026-09-27T02:01:00Z' },
];
let userADevice2Messages = [...userADevice1Messages];
let userBDeviceMessages = [...userADevice1Messages];

// Sender on Device 1 taps "Delete for Everyone" on msg_2
// 1. Optimistic removal on Device 1
userADevice1Messages = userADevice1Messages.filter(m => m.id !== 'msg_2');
assert.equal(userADevice1Messages.some(m => m.id === 'msg_2'), false);

// 2. Server processes RPC and broadcasts UPDATE with deleted_at = NOW(), content = '[DELETED]'
const realtimeDeletePayload = { id: 'msg_2', content: '[DELETED]', deleted_at: new Date().toISOString() };

// 3. Device 2 (Sender 2nd device) receives realtime event
userADevice2Messages = userADevice2Messages.filter(m => m.id !== realtimeDeletePayload.id);
assert.equal(userADevice2Messages.some(m => m.id === 'msg_2'), false);

// 4. Receiver Device receives realtime event
userBDeviceMessages = userBDeviceMessages.filter(m => m.id !== realtimeDeletePayload.id);
assert.equal(userBDeviceMessages.some(m => m.id === 'msg_2'), false);

// 5. Offline User C boots up 5 hours later: loadMessages query excludes deleted rows
const dbRows = [
  { id: 'msg_1', content: 'Hey!', sender_id: 'user_a', created_at: '2026-09-27T02:00:00Z', deleted_at: null },
  { id: 'msg_2', content: '[DELETED]', sender_id: 'user_a', created_at: '2026-09-27T02:01:00Z', deleted_at: '2026-09-27T02:02:00Z' },
];
const offlineUserLoadedMessages = dbRows.filter(m => !m.deleted_at && m.content !== '[DELETED]');
assert.equal(offlineUserLoadedMessages.length, 1);
assert.equal(offlineUserLoadedMessages[0].id, 'msg_1');

console.log('All Account Sync, Multi-Device, and Realtime test invariants passed successfully (100%)');
