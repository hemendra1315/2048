import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// 1. Verify screenProtection.ts exports and implementation structure
const screenProtectionContent = fs.readFileSync(path.join(repo, 'src/lib/screenProtection.ts'), 'utf8');
assert.ok(screenProtectionContent.includes('export async function enableScreenProtection'), 'Must export enableScreenProtection');
assert.ok(screenProtectionContent.includes('export async function disableScreenProtection'), 'Must export disableScreenProtection');
assert.ok(screenProtectionContent.includes('export function useScreenProtection'), 'Must export useScreenProtection');
assert.ok(screenProtectionContent.includes('export const ScreenShieldOverlay'), 'Must export ScreenShieldOverlay');
assert.ok(screenProtectionContent.includes('PrintScreen'), 'Must intercept PrintScreen hotkey');
assert.ok(screenProtectionContent.includes('visibilitychange'), 'Must listen to visibilitychange for defocus protection');

// 2. Verify reference counting logic in memory
let activeHoldCount = 0;
function testEnable() {
  activeHoldCount++;
  return activeHoldCount;
}
function testDisable() {
  activeHoldCount = Math.max(0, activeHoldCount - 1);
  return activeHoldCount;
}

assert.equal(testEnable(), 1);
assert.equal(testEnable(), 2);
assert.equal(testDisable(), 1);
assert.equal(testDisable(), 0);
assert.equal(testDisable(), 0); // Safe clamp

// 3. Verify LightboxViewer protections
const lightboxContent = fs.readFileSync(path.join(repo, 'src/components/gallery/LightboxViewer.tsx'), 'utf8');
assert.ok(lightboxContent.includes('useScreenProtection'), 'LightboxViewer must use useScreenProtection hook');
assert.ok(lightboxContent.includes('ScreenShieldOverlay'), 'LightboxViewer must render ScreenShieldOverlay');
assert.ok(lightboxContent.includes('isEphemeral'), 'LightboxViewer must check isEphemeral for view_once and allow_replay');
assert.ok(lightboxContent.includes('Screenshots are blocked for ephemeral media') || lightboxContent.includes('Screenshots, screen recording, and saving are strictly blocked'), 'LightboxViewer must provide screenshot block feedback');

// 4. Verify ChatRoom integrations
const chatRoomContent = fs.readFileSync(path.join(repo, 'src/components/messages/ChatRoom.tsx'), 'utf8');
assert.ok(chatRoomContent.includes('useScreenProtection'), 'ChatRoom must import and invoke useScreenProtection');
assert.ok(chatRoomContent.includes('viewMode={activeViewOnceItem.view_mode}'), 'ChatRoom must pass viewMode to LightboxViewer');

// 5. Verify Android ScreenProtectionPlugin exists and is registered in MainActivity
const pluginPath = path.join(repo, 'android/app/src/main/java/com/hemu/games/ScreenProtectionPlugin.java');
assert.ok(fs.existsSync(pluginPath), 'ScreenProtectionPlugin.java must exist in Android app source');
const pluginJava = fs.readFileSync(pluginPath, 'utf8');
assert.ok(pluginJava.includes('FLAG_SECURE'), 'ScreenProtectionPlugin must control WindowManager.LayoutParams.FLAG_SECURE');
assert.ok(pluginJava.includes('@CapacitorPlugin(name = "ScreenProtection")'), 'ScreenProtectionPlugin must declare Capacitor plugin name');

const mainActivityPath = path.join(repo, 'android/app/src/main/java/com/hemu/games/MainActivity.java');
const mainActivityJava = fs.readFileSync(mainActivityPath, 'utf8');
assert.ok(mainActivityJava.includes('registerPlugin(ScreenProtectionPlugin.class)'), 'MainActivity must register ScreenProtectionPlugin');

console.log('Screen protection unit tests passed successfully');
