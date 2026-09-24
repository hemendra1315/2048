// Offline outbox: queued messages are delivered once, in order, only for the signed-in user.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unit-'));
// Tests for src/lib/chatOutbox.ts with a fake Supabase client and localStorage.
import assert from 'node:assert/strict';

const src = fs.readFileSync(path.join(repo, 'src/lib/chatOutbox.ts'), 'utf8')
  .replace("import { supabase } from './supabase';", 'const supabase = (globalThis as any).__sb;')
  .replace("import { MessageItem } from '../types';", 'type MessageItem = any;');
const target = path.join(tmpDir, 'outbox_under_test.ts');
fs.writeFileSync(target, src);

const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, writable: true, configurable: true });

let mode = 'ok';
let inserts = 0;
const stored = [];
globalThis.__sb = {
  from() {
    const q = {
      insert(row) { q._row = row; return q; },
      select() { return q; },
      eq() { return q; },
      async single() {
        inserts++;
        if (mode === 'network') return { data: null, error: { message: 'TypeError: Failed to fetch', code: '' } };
        if (mode === 'rls') return { data: null, error: { message: 'new row violates row-level security', code: '42501' } };
        if (mode === 'dup') return { data: null, error: { message: 'duplicate key', code: '23505' } };
        const msg = { id: 'srv-' + inserts, ...q._row };
        stored.push(msg);
        return { data: msg, error: null };
      },
      async maybeSingle() { return { data: stored[0] ?? { id: 'srv-existing', client_id: q._row?.client_id }, error: null }; },
    };
    return q;
  },
};

const ob = await import(new URL('file://' + target.replace(/\\/g, '/').replace(/^([A-Za-z]:)/, '/$1')).href);
const events = [];
ob.onOutboxEvent(e => events.push(e));
const mk = (id, sender = 'u1') => ({ client_id: id, conversation_id: 'c1', sender_id: sender, content: 'hi ' + id, reply_to_id: null, created_at: new Date().toISOString() });
let n = 0;
const t = async (name, fn) => { events.length = 0; await fn(); n++; console.log('ok -', name); };

await t('sends and removes from outbox', async () => {
  mode = 'ok'; ob.enqueue(mk('a')); await ob.deliver(mk('a'));
  assert.equal(events[0].type, 'sent'); assert.equal(events[0].message.client_id, 'a');
  assert.equal(ob.pendingFor('c1', 'u1').length, 0);
});
await t('network failure keeps it queued', async () => {
  mode = 'network'; ob.enqueue(mk('b')); await ob.deliver(mk('b'));
  assert.equal(events[0].type, 'queued'); assert.equal(ob.pendingFor('c1', 'u1').length, 1);
});
await t('offline flush does nothing', async () => {
  navigator.onLine = false; const before = inserts; await ob.flushOutbox('u1');
  assert.equal(inserts, before); navigator.onLine = true;
});
await t('flush delivers when back online', async () => {
  mode = 'ok'; await ob.flushOutbox('u1');
  assert.equal(events[0].type, 'sent'); assert.equal(ob.pendingFor('c1', 'u1').length, 0);
});
await t('duplicate (earlier attempt landed) counts as sent', async () => {
  mode = 'dup'; stored.length = 0; ob.enqueue(mk('c')); await ob.deliver(mk('c'));
  assert.equal(events[0].type, 'sent'); assert.equal(ob.pendingFor('c1', 'u1').length, 0);
});
await t('real server error fails and drops it', async () => {
  mode = 'rls'; ob.enqueue(mk('d')); await ob.deliver(mk('d'));
  assert.equal(events[0].type, 'failed'); assert.equal(ob.pendingFor('c1', 'u1').length, 0);
});
await t('only the signed-in user\'s messages are flushed', async () => {
  mode = 'network'; ob.enqueue(mk('e', 'someone-else')); mode = 'ok';
  const before = inserts; await ob.flushOutbox('u1');
  assert.equal(inserts, before); assert.equal(ob.pendingFor('c1', 'someone-else').length, 1);
});
await t('clearOutbox empties it (sign-out)', async () => {
  ob.clearOutbox(); assert.equal(ob.pendingFor('c1', 'someone-else').length, 0);
});
await t('concurrent deliver of same item sends once', async () => {
  mode = 'ok'; const before = inserts; const it = mk('f'); ob.enqueue(it);
  await Promise.all([ob.deliver(it), ob.deliver(it)]);
  assert.equal(inserts - before, 1);
});
console.log(`\n${n} outbox tests passed`);
