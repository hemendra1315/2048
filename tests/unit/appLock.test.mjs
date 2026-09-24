// Leaving the app locks it, except when it leaves for the camera or a photo picker.
// Drafts are per chat and cleared on sign-out.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = rel => import(pathToFileURL(path.join(repo, rel)).href);

const ext = await load('src/lib/externalActivity.ts');

// Leaving without announcing it: lock.
assert.equal(ext.leavingForExternalActivity(), false, 'plain background must lock');
assert.equal(ext.isAwayForExternalActivity(), false);

// Camera announced, app leaves right after: stay unlocked and pause the idle timer until back.
ext.expectExternalActivity();
assert.equal(ext.leavingForExternalActivity(), true, 'camera must not lock');
assert.equal(ext.isAwayForExternalActivity(), true, 'idle timer must wait while away');
ext.returnedToApp();
assert.equal(ext.isAwayForExternalActivity(), false);

// One announcement covers one trip out: the next time the app is left, it locks.
assert.equal(ext.leavingForExternalActivity(), false, 'announcement must not carry over');

// An announcement that never led anywhere (e.g. permission denied) expires.
const realNow = Date.now;
ext.expectExternalActivity();
Date.now = () => realNow() + 6000;
assert.equal(ext.leavingForExternalActivity(), false, 'stale announcement must expire');
Date.now = realNow;

const drafts = await load('src/lib/chatDrafts.ts');
drafts.setDraft('a', 'hello');
drafts.setDraft('b', 'other chat');
assert.equal(drafts.getDraft('a'), 'hello');
assert.equal(drafts.getDraft('b'), 'other chat');
drafts.setDraft('a', '');
assert.equal(drafts.getDraft('a'), '', 'empty text removes the draft');
drafts.clearDrafts();
assert.equal(drafts.getDraft('b'), '', 'sign-out clears drafts');
