// send-push-notification: caller auth, participant checks, FCM v1 payload, token pruning.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unit-'));
// Node harness for supabase/functions/send-push-notification/index.ts
// Mocks Deno.serve, Deno.env, supabase-js and fetch (OAuth + FCM v1).
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const src = fs.readFileSync(path.join(repo, 'supabase/functions/send-push-notification/index.ts'), 'utf8')
  .replace(/import \{ createClient \} from 'npm:@supabase\/supabase-js@2';/, 'const { createClient } = (globalThis as any).__mock;');
const target = path.join(tmpDir, 'fn_under_test.ts');
fs.writeFileSync(target, src);

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const SECRET = 'x'.repeat(40);
const SA = { project_id: 'proj-123', client_email: 'fcm@proj.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: 'https://oauth2.googleapis.com/token' };
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc', PUSH_WEBHOOK_SECRET: SECRET,
  FCM_SERVICE_ACCOUNT_JSON: JSON.stringify(SA) };

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const CONV = '44444444-4444-4444-8444-444444444444';
const MSG = '55555555-5555-4555-8555-555555555555';

let db, fcmCalls, oauthCalls, deleted;
function reset() {
  db = {
    message: { id: MSG, sender_id: A, conversation_id: CONV, conversations: { user_a: A, user_b: B } },
    payload: { should_send: true, title: 'Level up!', body: 'Open Games to continue.', sound: 'chime', channel_id: 'game_updates_chime_v2' },
    rpcError: null,
    subs: [{ fcm_token: 'tok-good' }],
  };
  fcmCalls = []; oauthCalls = 0; deleted = [];
}
globalThis.__mock = {
  createClient: () => ({
    from(table) {
      const q = { _t: table,
        select() { return q; }, eq() { return q; },
        maybeSingle: async () => ({ data: table === 'messages' ? db.message : null, error: null }),
        delete() { return { in: async (_c, vals) => { deleted.push(...vals); return { error: null }; } }; },
        then(res) { return Promise.resolve(table === 'push_subscriptions' ? { data: db.subs, error: null } : { data: null, error: null }).then(res); },
      };
      return q;
    },
    rpc: async () => db.rpcError ? { data: null, error: db.rpcError } : { data: db.payload, error: null },
  }),
};
globalThis.Deno = { serve: h => { globalThis.__handler = h; }, env: { get: k => env[k] } };
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://oauth2.googleapis.com/token')) {
    oauthCalls++;
    const assertion = new URLSearchParams(init.body.toString()).get('assertion');
    const [h, p, s] = assertion.split('.');
    const ok = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), publicKey, Buffer.from(s, 'base64url'));
    assert.ok(ok, 'JWT signature must verify');
    const claims = JSON.parse(Buffer.from(p, 'base64url'));
    assert.equal(claims.scope, 'https://www.googleapis.com/auth/firebase.messaging');
    assert.equal(claims.iss, SA.client_email);
    return new Response(JSON.stringify({ access_token: 'at-1', expires_in: 3600 }), { status: 200 });
  }
  if (String(url) === 'https://fcm.googleapis.com/v1/projects/proj-123/messages:send') {
    assert.equal(init.headers.Authorization, 'Bearer at-1');
    const body = JSON.parse(init.body);
    fcmCalls.push(body);
    if (body.message.token === 'tok-dead') return new Response(JSON.stringify({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }), { status: 404 });
    return new Response('{"name":"projects/proj-123/messages/1"}', { status: 200 });
  }
  throw new Error('unexpected fetch ' + url);
};

await import(new URL('file://' + target.replace(/\\/g, '/').replace(/^([A-Za-z]:)/, '/$1')).href);
const handler = globalThis.__handler;
const call = (body, headers = { 'x-push-secret': SECRET }) =>
  handler(new Request('https://f/', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }));
const good = { message_id: MSG, sender_id: A, recipient_id: B, conversation_id: CONV };
let r, j, n = 0;
const t = async (name, fn) => { reset(); await fn(); n++; console.log('ok -', name); };

await t('rejects missing secret', async () => { r = await call(good, {}); assert.equal(r.status, 401); });
await t('rejects wrong secret', async () => { r = await call(good, { 'x-push-secret': 'y'.repeat(40) }); assert.equal(r.status, 401); });
await t('rejects anon-key style bearer', async () => { r = await call(good, { Authorization: 'Bearer anon' }); assert.equal(r.status, 401); });
await t('rejects GET', async () => { r = await handler(new Request('https://f/', { method: 'GET' })); assert.equal(r.status, 405); });
await t('rejects bad uuids', async () => { r = await call({ ...good, recipient_id: 'x' }); assert.equal(r.status, 400); });
await t('rejects non-participant recipient', async () => { r = await call({ ...good, recipient_id: C }); assert.equal(r.status, 403); assert.equal(fcmCalls.length, 0); });
await t('rejects forged sender', async () => { r = await call({ ...good, sender_id: B, recipient_id: A }); assert.equal(r.status, 403); });
await t('rejects unknown message', async () => { db.message = null; r = await call(good); assert.equal(r.status, 403); });
await t('fails closed when prefs unreadable', async () => { db.rpcError = { code: 'X' }; r = await call(good); assert.equal(r.status, 500); assert.equal(fcmCalls.length, 0); });
await t('silent sends nothing', async () => { db.payload = { should_send: false }; r = await call(good); j = await r.json(); assert.equal(j.sent, 0); assert.equal(fcmCalls.length, 0); });
await t('no devices sends nothing', async () => { db.subs = []; r = await call(good); j = await r.json(); assert.equal(j.sent, 0); assert.equal(fcmCalls.length, 0); });
await t('missing FCM config -> 500', async () => { const s = env.FCM_SERVICE_ACCOUNT_JSON; delete env.FCM_SERVICE_ACCOUNT_JSON; r = await call(good); env.FCM_SERVICE_ACCOUNT_JSON = s; assert.equal(r.status, 500); });
await t('sends FCM v1 message with custom sound channel', async () => {
  r = await call(good); j = await r.json();
  assert.equal(r.status, 200); assert.deepEqual(j, { sent: 1, failed: 0, pruned: 0 });
  const m = fcmCalls[0].message;
  assert.equal(m.token, 'tok-good');
  assert.deepEqual(m.notification, { title: 'Level up!', body: 'Open Games to continue.' });
  assert.equal(m.android.notification.channel_id, 'game_updates_chime_v2');
  assert.equal(m.android.notification.sound, 'chime');
  assert.deepEqual(m.data, { type: 'game_alert', hidden: 'true' });
  const wire = JSON.stringify(fcmCalls[0]);
  for (const id of [A, B, CONV, MSG]) assert.ok(!wire.includes(id), 'no IDs in FCM payload');
});
await t('unknown sound falls back to default channel', async () => { db.payload.sound = '../evil'; r = await call(good); const m = fcmCalls[0].message; assert.equal(m.android.notification.channel_id, 'game_updates'); assert.equal(m.android.notification.default_sound, true); });
await t('body names the recipient\'s own launcher name, not a hardcoded one', async () => {
  db.payload.body = 'Open Retro Arcade to continue.';
  r = await call(good);
  assert.equal(fcmCalls[0].message.notification.body, 'Open Retro Arcade to continue.');
});
await t('malformed body falls back to default', async () => { db.payload.body = 123; r = await call(good); assert.equal(fcmCalls[0].message.notification.body, 'Open Games to continue.'); });
await t('response never echoes disguise settings', async () => { r = await call(good); const txt = await r.text(); assert.ok(!txt.includes('Level up') && !txt.includes('chime')); });
await t('prunes dead tokens', async () => { db.subs = [{ fcm_token: 'tok-good' }, { fcm_token: 'tok-dead' }]; r = await call(good); j = await r.json(); assert.deepEqual(j, { sent: 1, failed: 1, pruned: 1 }); assert.deepEqual(deleted, ['tok-dead']); });
await t('caches OAuth token', async () => { await call(good); await call(good); assert.equal(oauthCalls, 0, 'token from earlier test still cached'); });
console.log(`\n${n} tests passed`);
