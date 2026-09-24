// Message formats: stickers, score cards, game invites, voice notes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unit-'));
import assert from 'node:assert/strict';
const target = path.join(tmpDir, 'chatExtras.ts');
fs.copyFileSync(path.join(repo, 'src/lib/chatExtras.ts'), target);
const x = await import(new URL('file://' + target.replace(/\\/g, '/').replace(/^([A-Za-z]:)/, '/$1')).href);
// voice notes: old and new format
let v = x.parseVoiceNote('[VOICE_NOTE:0:07]https://a/b.webm');
assert.deepEqual(v, { duration: '0:07', levels: null, url: 'https://a/b.webm' });
v = x.parseVoiceNote('[VOICE_NOTE:1:02|w=0az5]https://a/c.webm');
assert.equal(v.duration, '1:02'); assert.equal(v.url, 'https://a/c.webm');
assert.deepEqual(v.levels.map(n => Math.round(n * 35)), [0, 10, 35, 5]);
assert.equal(x.parseVoiceNote('hello'), undefined);
// stickers
assert.equal(x.parseSticker('[STICKER:fire]').art, '🔥');
assert.equal(x.parseSticker('[STICKER:nope]'), undefined);
assert.equal(x.parseSticker('[STICKER:fire] extra'), undefined);
// scores
assert.deepEqual(x.parseScore('[SCORE:snake:120]'), { gameId: 'snake', score: 120 });
assert.equal(x.parseScore('[SCORE:snake:-1]'), undefined);
// games
assert.equal(x.parseGame('[GAME:tictactoe:11111111-1111-4111-8111-111111111111]').id, '11111111-1111-4111-8111-111111111111');
assert.equal(x.parseGame('[GAME:tictactoe:../../x]'), undefined);
// previews & themes
assert.equal(x.extraPreview('[STICKER:gg]'), 'Sticker');
assert.equal(x.extraPreview('plain'), undefined);
assert.equal(x.themeById('ocean').id, 'ocean'); assert.equal(x.themeById('bogus').id, 'default');
assert.equal(new Set(x.STICKERS.map(s => s.id)).size, x.STICKERS.length);
console.log('chatExtras tests passed');
