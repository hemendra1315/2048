// Supabase Edge Function: send-push-notification
//
// Called ONLY by the database trigger public.handle_new_message_push() (via pg_net).
// Sends a disguised notification through the FCM HTTP v1 API.
//
// Deploy:   supabase functions deploy send-push-notification --no-verify-jwt
//           (auth is the shared PUSH_WEBHOOK_SECRET checked below, not a user JWT)
// Secrets:  supabase secrets set PUSH_WEBHOOK_SECRET=<random 32+ chars>
//           supabase secrets set FCM_SERVICE_ACCOUNT_JSON="$(cat service-account.json)"
//
// Privacy: the FCM payload carries only the disguised title/body and opaque data.
// The HTTP response never echoes titles, phrases or sounds back to the caller.

import { createClient } from 'npm:@supabase/supabase-js@2';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_TITLE = '🎮 Daily puzzle ready';
const DEFAULT_BODY = 'Open Games to continue.';
const DEFAULT_CHANNEL = 'game_updates';
// Must match MainActivity.SOUND_CHANNELS and res/raw/<name>.wav
const ALLOWED_SOUNDS = new Set(['chime', 'arcade', 'coins', 'ping']);
const CHANNEL_VERSION = 'v2';

export const soundChannelId = (sound: string | null | undefined): string =>
  sound && ALLOWED_SOUNDS.has(sound) ? `${DEFAULT_CHANNEL}_${sound}_${CHANNEL_VERSION}` : DEFAULT_CHANNEL;

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

// ---------------------------------------------------------------------------
// Caller authentication (constant-time compare against PUSH_WEBHOOK_SECRET)
// ---------------------------------------------------------------------------
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function isAuthorized(req: Request, secret: string | undefined): boolean {
  if (!secret || secret.length < 32) return false;
  const header = req.headers.get('x-push-secret') ?? '';
  return header.length > 0 && timingSafeEqual(header, secret);
}

// ---------------------------------------------------------------------------
// FCM HTTP v1: OAuth2 access token from a service account (RS256 JWT grant)
// ---------------------------------------------------------------------------
interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

const b64url = (data: ArrayBuffer | Uint8Array | string): string => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), c => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

export async function buildSignedJwt(sa: ServiceAccount, nowSec: number): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: sa.token_uri ?? 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const key = await importPrivateKey(sa.private_key);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${b64url(sig)}`;
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.value;
  const assertion = await buildSignedJwt(sa, now);
  const res = await fetch(sa.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`OAuth token request failed: ${res.status}`);
  const tok = await res.json();
  cachedToken = { value: tok.access_token, expiresAt: now + (tok.expires_in ?? 3600) };
  return cachedToken.value;
}

export function buildFcmMessage(token: string, title: string, body: string, sound: string | null) {
  const channelId = soundChannelId(sound);
  const custom = sound && ALLOWED_SOUNDS.has(sound) ? sound : null;
  return {
    message: {
      token,
      notification: { title, body },
      android: {
        priority: 'HIGH',
        notification: {
          channel_id: channelId,
          // Android 8+ takes the sound from the channel; this covers Android 7 and below.
          ...(custom ? { sound: custom } : { default_sound: true }),
          visibility: 'PUBLIC',
        },
      },
      // Opaque only: no user IDs, conversation IDs, names or content.
      data: { type: 'game_alert', hidden: 'true' },
    },
  };
}

// FCM v1 errors that mean the token is dead and should be removed.
const isDeadToken = (status: number, errBody: unknown): boolean => {
  const text = JSON.stringify(errBody ?? '');
  return status === 404 || text.includes('UNREGISTERED') ||
    (status === 400 && text.includes('registration token'));
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!isAuthorized(req, Deno.env.get('PUSH_WEBHOOK_SECRET'))) return json(401, { error: 'unauthorized' });

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const saRaw = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON');
  if (!url || !serviceKey) return json(500, { error: 'server_misconfigured' });
  if (!saRaw) {
    console.error('FCM_SERVICE_ACCOUNT_JSON is not set; no notification sent.');
    return json(500, { error: 'fcm_not_configured' });
  }

  let sa: ServiceAccount;
  try {
    sa = JSON.parse(saRaw);
    if (!sa.project_id || !sa.client_email || !sa.private_key) throw new Error('incomplete');
  } catch {
    console.error('FCM_SERVICE_ACCOUNT_JSON is not a valid service-account key.');
    return json(500, { error: 'fcm_not_configured' });
  }

  let input: { sender_id?: string; recipient_id?: string; conversation_id?: string; message_id?: string };
  try {
    input = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  const { sender_id, recipient_id, conversation_id, message_id } = input;
  if (![sender_id, recipient_id, conversation_id, message_id].every(v => typeof v === 'string' && UUID_RE.test(v))) {
    return json(400, { error: 'invalid_parameters' });
  }
  if (sender_id === recipient_id) return json(400, { error: 'invalid_parameters' });

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // Defence in depth: the message must exist, be from sender, in this conversation,
  // and the recipient must be the other participant.
  const { data: msg, error: msgErr } = await supabase
    .from('messages')
    .select('id, sender_id, conversation_id, conversations!inner(user_a, user_b)')
    .eq('id', message_id!)
    .maybeSingle();
  if (msgErr) {
    console.error('message lookup failed:', msgErr.code);
    return json(500, { error: 'lookup_failed' });
  }
  const conv = (msg as unknown as { conversations?: { user_a: string; user_b: string } } | null)?.conversations;
  const participants = conv ? [conv.user_a, conv.user_b] : [];
  if (!msg || msg.sender_id !== sender_id || msg.conversation_id !== conversation_id ||
      !participants.includes(sender_id!) || !participants.includes(recipient_id!)) {
    return json(403, { error: 'not_a_participant' });
  }

  // Fail closed: if preferences can't be read we don't know whether the user chose "silent".
  const { data: payload, error: rpcError } = await supabase.rpc('get_disguised_notification_payload', {
    p_recipient_id: recipient_id,
    p_sender_id: sender_id,
    p_conversation_id: conversation_id,
  });
  if (rpcError || !payload) {
    console.error('preference lookup failed:', rpcError?.code);
    return json(500, { error: 'lookup_failed' });
  }
  if (payload.should_send === false) return json(200, { sent: 0, skipped: true });

  const title = typeof payload.title === 'string' && payload.title.trim() ? payload.title.trim() : DEFAULT_TITLE;
  const body = DEFAULT_BODY;
  const sound = typeof payload.sound === 'string' ? payload.sound : null;

  const { data: subs, error: subsError } = await supabase
    .from('push_subscriptions')
    .select('fcm_token')
    .eq('user_id', recipient_id!);
  if (subsError) {
    console.error('subscription lookup failed:', subsError.code);
    return json(500, { error: 'lookup_failed' });
  }
  const tokens = [...new Set((subs ?? []).map(s => s.fcm_token).filter(Boolean))];
  if (tokens.length === 0) return json(200, { sent: 0, skipped: true });

  let accessToken: string;
  try {
    accessToken = await getAccessToken(sa);
  } catch (e) {
    console.error('FCM auth failed:', e instanceof Error ? e.message : e);
    return json(502, { error: 'fcm_auth_failed' });
  }

  let sent = 0, failed = 0;
  const dead: string[] = [];
  await Promise.all(tokens.map(async token => {
    try {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: 'POST',
        headers: { ...JSON_HEADERS, Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(buildFcmMessage(token, title, body, sound)),
      });
      if (res.ok) { sent++; return; }
      failed++;
      const errBody = await res.json().catch(() => null);
      if (isDeadToken(res.status, errBody)) dead.push(token);
      else console.warn('FCM send failed with status', res.status);
    } catch (e) {
      failed++;
      console.warn('FCM send error:', e instanceof Error ? e.message : e);
    }
  }));

  if (dead.length) {
    await supabase.from('push_subscriptions').delete().in('fcm_token', dead);
  }

  return json(200, { sent, failed, pruned: dead.length });
});
