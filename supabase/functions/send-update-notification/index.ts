// Supabase Edge Function: send-update-notification
//
// Admin-triggered broadcast: pushes an "update available" notification to every
// device with a stored FCM token. Called from the App Updates admin page
// (src/components/admin/AppUpdateView.tsx) with the admin's own session JWT --
// NOT by a database trigger, so this checks is_super_admin() itself instead of
// the shared-secret pattern send-push-notification uses.
//
// Unlike incoming-message pushes, this notification does NOT need to be
// disguised: a real "Update available" push is completely unremarkable for
// what looks like an ordinary game app, and is the honest, expected thing for
// an app to send. No per-recipient preference lookup either -- this is a
// broadcast, not a per-contact disguised alert.
//
// Deploy:  supabase functions deploy send-update-notification
// Secrets: reuses FCM_SERVICE_ACCOUNT_JSON (already set for send-push-notification)

import { createClient } from 'npm:@supabase/supabase-js@2';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const CHANNEL_ID = 'game_updates';

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

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

async function buildSignedJwt(sa: ServiceAccount, nowSec: number): Promise<string> {
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

function buildFcmMessage(token: string, title: string, body: string) {
  return {
    message: {
      token,
      notification: { title, body },
      android: {
        priority: 'HIGH',
        notification: { channel_id: CHANNEL_ID, default_sound: true, visibility: 'PUBLIC' },
      },
      data: { type: 'app_update' },
    },
  };
}

const isDeadToken = (status: number, errBody: unknown): boolean => {
  const text = JSON.stringify(errBody ?? '');
  return status === 404 || text.includes('UNREGISTERED') ||
    (status === 400 && text.includes('registration token'));
};

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
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

  // Caller must be a real, currently-authenticated super admin -- checked with their own
  // forwarded JWT (so auth.uid()/is_super_admin() reflect the real caller), not the
  // service-role client used later only for the broadcast itself.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json(401, { error: 'unauthorized' });
  const userClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: isAdmin, error: adminCheckError } = await userClient.rpc('is_super_admin');
  if (adminCheckError || !isAdmin) return json(403, { error: 'forbidden' });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: notice, error: noticeError } = await admin
    .from('app_update_notice')
    .select('latest_version')
    .eq('id', true)
    .maybeSingle();
  if (noticeError || !notice) return json(400, { error: 'no_update_published' });

  const title = 'Update Available';
  const body = `Version ${notice.latest_version} is ready. Tap to update.`;

  const { error: logError } = await userClient.rpc('log_admin_action', {
    p_action_type: 'NOTIFY_APP_UPDATE',
    p_metadata: { latest_version: notice.latest_version },
  });
  if (logError) {
    // Audit-log write failed -- don't block the broadcast over it, but this must be
    // visible somewhere, since a silently-skipped log entry defeats the point of the
    // audit trail for who triggered a mass notification and when.
    console.error('[send-update-notification] audit log write failed:', logError);
  }

  const { data: subs, error: subsError } = await admin.from('push_subscriptions').select('fcm_token');
  if (subsError) return json(500, { error: 'lookup_failed' });
  const tokens = [...new Set((subs ?? []).map(s => s.fcm_token).filter(Boolean))];
  if (tokens.length === 0) return json(200, { sent: 0, failed: 0, pruned: 0 });

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
        body: JSON.stringify(buildFcmMessage(token, title, body)),
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
    await admin.from('push_subscriptions').delete().in('fcm_token', dead);
  }

  return json(200, { sent, failed, pruned: dead.length });
});
