import assert from 'node:assert/strict';

// Mock localStorage in Node environment
const mockStorage = new Map();
globalThis.localStorage = {
  getItem: (key) => mockStorage.get(key) ?? null,
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
};
globalThis.window = globalThis;

import { getCustomWallpaper, setCustomWallpaper, removeCustomWallpaper } from '../../src/lib/chatWallpaper.ts';

// Test 1: getCustomWallpaper returns null initially
assert.equal(getCustomWallpaper('conv-123'), null);

// Test 2: setCustomWallpaper stores per conversation
setCustomWallpaper('conv-123', 'data:image/jpeg;base64,sample123');
assert.equal(getCustomWallpaper('conv-123'), 'data:image/jpeg;base64,sample123');
assert.equal(getCustomWallpaper('conv-456'), null);

// Test 3: removeCustomWallpaper clears only targeted conversation
setCustomWallpaper('conv-456', 'data:image/jpeg;base64,sample456');
removeCustomWallpaper('conv-123');
assert.equal(getCustomWallpaper('conv-123'), null);
assert.equal(getCustomWallpaper('conv-456'), 'data:image/jpeg;base64,sample456');

console.log('chatWallpaper unit tests passed');
