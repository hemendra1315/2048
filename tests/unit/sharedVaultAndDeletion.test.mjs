// Unit test: Shared Vault operations, filters, and Delete-for-Everyone streaming invariants
import assert from 'node:assert/strict';

// 1. Test Delete For Everyone filtering invariant
const activeStream = [
  { id: 'm1', content: 'Hello', created_at: '2026-09-27T00:00:00Z', is_read: true },
  { id: 'm2', content: 'Secret photo', created_at: '2026-09-27T00:01:00Z', is_read: true },
  { id: 'm3', content: 'See you there', created_at: '2026-09-27T00:02:00Z', is_read: false },
];

// Receiver receives Realtime UPDATE with deleted_at
const updatePayload = { id: 'm2', content: '[DELETED]', deleted_at: '2026-09-27T00:03:00Z' };
const afterRealtimeUpdate = activeStream.filter(m => m.id !== updatePayload.id);

assert.equal(afterRealtimeUpdate.length, 2);
assert.equal(afterRealtimeUpdate.some(m => m.id === 'm2'), false);
assert.deepEqual(afterRealtimeUpdate.map(m => m.id), ['m1', 'm3']);

// Offline Receiver fetching messages later
const rawFromDb = [
  { id: 'm1', content: 'Hello', created_at: '2026-09-27T00:00:00Z' },
  { id: 'm2', content: '[DELETED]', deleted_at: '2026-09-27T00:03:00Z' },
  { id: 'm3', content: 'See you there', created_at: '2026-09-27T00:02:00Z' },
];
const offlineFiltered = rawFromDb.filter(m => !m.deleted_at && m.content !== '[DELETED]');
assert.equal(offlineFiltered.length, 2);
assert.equal(offlineFiltered.some(m => m.id === 'm2'), false);

// 2. Test Shared Vault Filter Categorization & Counting
const vaultItems = [
  { id: 'v1', media_type: 'image', media_url: 'https://cdn/img1.jpg', is_favorite: true, created_at: '2026-09-27T01:00:00Z' },
  { id: 'v2', media_type: 'image', media_url: 'https://cdn/img2.jpg', is_favorite: false, created_at: '2026-09-27T01:05:00Z' },
  { id: 'v3', media_type: 'audio', media_url: 'https://cdn/voice.webm', is_favorite: true, created_at: '2026-09-27T01:10:00Z' },
  { id: 'v4', media_type: 'text_memory', media_url: 'Late night conversation quote', is_favorite: false, created_at: '2026-09-27T01:15:00Z' },
  { id: 'v5', media_type: 'video', media_url: 'https://cdn/vid.mp4', is_favorite: false, created_at: '2026-09-27T01:20:00Z' },
];

const counts = {
  all: vaultItems.length,
  image: vaultItems.filter(i => i.media_type === 'image').length,
  video: vaultItems.filter(i => i.media_type === 'video').length,
  audio: vaultItems.filter(i => i.media_type === 'audio').length,
  text_memory: vaultItems.filter(i => i.media_type === 'text_memory').length,
  favorites: vaultItems.filter(i => i.is_favorite).length,
};

assert.equal(counts.all, 5);
assert.equal(counts.image, 2);
assert.equal(counts.video, 1);
assert.equal(counts.audio, 1);
assert.equal(counts.text_memory, 1);
assert.equal(counts.favorites, 2);

// Test Realtime Event Reducers
let currentVault = [...vaultItems];

// INSERT event
const newInserted = { id: 'v6', media_type: 'text_memory', media_url: 'New memory', is_favorite: false, created_at: '2026-09-27T02:00:00Z' };
if (!currentVault.some(i => i.id === newInserted.id)) {
  currentVault = [newInserted, ...currentVault];
}
assert.equal(currentVault.length, 6);
assert.equal(currentVault[0].id, 'v6');

// UPDATE event (star toggle)
const updatedItem = { ...currentVault[1], is_favorite: !currentVault[1].is_favorite };
currentVault = currentVault.map(i => (i.id === updatedItem.id ? updatedItem : i));
assert.equal(currentVault.find(i => i.id === 'v1').is_favorite, false);

// DELETE event
const deletedId = 'v3';
currentVault = currentVault.filter(i => i.id !== deletedId);
assert.equal(currentVault.length, 5);
assert.equal(currentVault.some(i => i.id === 'v3'), false);

console.log('Shared Vault and Delete-for-Everyone tests passed');
