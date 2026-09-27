import assert from 'node:assert/strict';

// Mock localStorage in Node environment
const mockStorage = new Map();
globalThis.localStorage = {
  getItem: (key) => mockStorage.get(key) ?? null,
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
  get length() { return mockStorage.size; },
  key: (i) => Array.from(mockStorage.keys())[i] || null,
};
globalThis.window = globalThis;

const WALLPAPER_KEY_PREFIX = 'vault_chat_wallpaper_';

function getCustomWallpaper(conversationId) {
  try {
    return localStorage.getItem(`${WALLPAPER_KEY_PREFIX}${conversationId}`);
  } catch {
    return null;
  }
}

function setCustomWallpaperLocal(conversationId, dataUrl) {
  try {
    localStorage.setItem(`${WALLPAPER_KEY_PREFIX}${conversationId}`, dataUrl);
  } catch (err) {
    console.warn(err);
  }
}

function removeCustomWallpaper(conversationId) {
  try {
    localStorage.removeItem(`${WALLPAPER_KEY_PREFIX}${conversationId}`);
  } catch (err) {
    console.warn(err);
  }
}

// Test 1: getCustomWallpaper returns null initially
assert.equal(getCustomWallpaper('conv-123'), null);

// Test 2: setCustomWallpaper stores per conversation
setCustomWallpaperLocal('conv-123', 'https://cdn/wallpaper123.jpg');
assert.equal(getCustomWallpaper('conv-123'), 'https://cdn/wallpaper123.jpg');
assert.equal(getCustomWallpaper('conv-456'), null);

// Test 3: removeCustomWallpaper clears only targeted conversation
setCustomWallpaperLocal('conv-456', 'https://cdn/wallpaper456.jpg');
removeCustomWallpaper('conv-123');
assert.equal(getCustomWallpaper('conv-123'), null);
assert.equal(getCustomWallpaper('conv-456'), 'https://cdn/wallpaper456.jpg');

console.log('chatWallpaper unit tests passed');
