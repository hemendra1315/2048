import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unit-view-once-'));

// Test chatExtras with View Once messages
const extrasTarget = path.join(tmpDir, 'chatExtras.ts');
fs.copyFileSync(path.join(repo, 'src/lib/chatExtras.ts'), extrasTarget);
const extras = await import(new URL('file://' + extrasTarget.replace(/\\/g, '/').replace(/^([A-Za-z]:)/, '/$1')).href);

// 1. Parsing View Once photo tags
assert.equal(extras.isViewOnceContent('[IMAGE:VIEW_ONCE]https://storage/chat-media/conv1/photo.jpg'), true);
assert.equal(extras.isViewOnceContent('[IMAGE:view_once]https://storage/chat-media/conv1/photo.jpg'), true);
assert.equal(extras.isViewOnceContent('[IMAGE]https://storage/chat-media/conv1/photo.jpg'), false);

// 2. Parsing View Once voice notes
const vo = extras.parseVoiceNote('[VOICE_NOTE:VIEW_ONCE:0:12|w=0az9]https://storage/chat-media/conv1/voice.webm');
assert.ok(vo);
assert.equal(vo.duration, '0:12');
assert.equal(vo.isViewOnce, true);
assert.equal(vo.url, 'https://storage/chat-media/conv1/voice.webm');
assert.deepEqual(vo.levels.map(n => Math.round(n * 35)), [0, 10, 35, 9]);

// 3. Readable message previews
assert.equal(extras.readableMessagePreview('[IMAGE:VIEW_ONCE]https://...'), '1 View once photo');
assert.equal(extras.readableMessagePreview('[VOICE_NOTE:VIEW_ONCE:0:10]https://...'), '1 View once voice message');
assert.equal(extras.readableMessagePreview('[IMAGE]https://...'), '📷 Photo');
assert.equal(extras.readableMessagePreview('[VOICE_NOTE:0:10]https://...'), '🎤 Voice message');

console.log('View Once unit tests passed');

// -----------------------------------------------------------------------------
// Allow Replay (three-mode ephemeral media): same tag-parsing contract as View
// Once above, extended for the new ALLOW_REPLAY tag. None of the assertions
// above were changed to get here.
// -----------------------------------------------------------------------------

// 4. Parsing Allow Replay photo tags
assert.equal(extras.isAllowReplayContent('[IMAGE:ALLOW_REPLAY]https://storage/chat-media/conv1/photo.jpg'), true);
assert.equal(extras.isAllowReplayContent('[IMAGE:VIEW_ONCE]https://storage/chat-media/conv1/photo.jpg'), false);
assert.equal(extras.isAllowReplayContent('[IMAGE]https://storage/chat-media/conv1/photo.jpg'), false);

// 5. isEphemeralContent covers both modes, and only both modes
assert.equal(extras.isEphemeralContent('[IMAGE:VIEW_ONCE]https://...'), true);
assert.equal(extras.isEphemeralContent('[IMAGE:ALLOW_REPLAY]https://...'), true);
assert.equal(extras.isEphemeralContent('[IMAGE]https://...'), false);

// 6. Parsing Allow Replay voice notes
const ar = extras.parseVoiceNote('[VOICE_NOTE:ALLOW_REPLAY:0:12|w=0az9]https://storage/chat-media/conv1/voice.webm');
assert.ok(ar);
assert.equal(ar.duration, '0:12');
assert.equal(ar.isAllowReplay, true);
assert.equal(ar.isViewOnce, undefined);
assert.equal(ar.url, 'https://storage/chat-media/conv1/voice.webm');
assert.deepEqual(ar.levels.map(n => Math.round(n * 35)), [0, 10, 35, 9]);

// 7. Readable message previews for Allow Replay
assert.equal(extras.readableMessagePreview('[IMAGE:ALLOW_REPLAY]https://...'), 'Photo · Allow Replay');
assert.equal(extras.readableMessagePreview('[VOICE_NOTE:ALLOW_REPLAY:0:10]https://...'), 'Voice message · Allow Replay');

console.log('Allow Replay unit tests passed');
