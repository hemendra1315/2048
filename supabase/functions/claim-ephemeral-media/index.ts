// Supabase Edge Function: the ONLY way to get a viewable URL for View Once / Allow
// Replay chat media.
//
// Previously, the client called claim_ephemeral_media() to atomically consume a view,
// then SEPARATELY called supabase.storage.from('chat-media').createSignedUrl() itself.
// That second call went through the ordinary chat_media_select_policy, which only checks
// conversation membership -- it has no idea the object belongs to a view-once message or
// that its view count is exhausted. So any conversation member could call createSignedUrl
// for that same path directly, any number of times, forever (the object is never deleted),
// completely bypassing the single-view guarantee the claim RPC was supposed to enforce.
//
// The fix: chat_media_select_policy (see migration 20260927000016) now flatly denies
// direct client signing for any object that belongs to a view_once/allow_replay message,
// full stop. The ONLY way to get a signed URL for that object is through this function,
// which claims the view server-side (as the calling user, via their forwarded JWT) and
// only signs the URL -- using its own service-role client, which bypasses RLS -- if the
// claim actually succeeded. A failed claim (already viewed, replays exhausted, not a
// member, etc.) never produces a signed URL at all.
//
// Deploy:  supabase functions deploy claim-ephemeral-media

import { createClient } from 'npm:@supabase/supabase-js@2';

const url = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
if (!url || !serviceKey) throw new Error('Missing Supabase environment variables');

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

/** Same parsing rule as src/lib/mediaUrls.ts's chatMediaPath(). */
function chatMediaPath(contentOrUrl: string | null | undefined): string | null {
  if (!contentOrUrl) return null;
  const m = contentOrUrl.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/chat-media\/([^?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

Deno.serve(async req => {
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, reason: 'unauthorized' }), { status: 401 });
    }

    let body: { message_id?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ success: false, reason: 'bad_request' }), { status: 400 });
    }
    const messageId = body.message_id;
    if (!messageId) {
      return new Response(JSON.stringify({ success: false, reason: 'bad_request' }), { status: 400 });
    }

    // Runs as the caller (their JWT is forwarded), so auth.uid() inside claim_ephemeral_media
    // is the real signed-in user -- membership/ownership checks apply exactly as they do
    // when called directly from the client.
    const userClient = createClient(url!, anonKey, {
      ...clientOptions,
      global: { headers: { Authorization: authHeader } },
    });

    const { data, error } = await userClient.rpc('claim_ephemeral_media', { p_message_id: messageId });
    if (error) {
      const reason = error.code === '42501' ? 'unauthorized' : 'network_error';
      return new Response(JSON.stringify({ success: false, reason }), { status: 200 });
    }
    if (!data?.success) {
      return new Response(JSON.stringify(data), { status: 200 });
    }

    const path = chatMediaPath(data.content);
    if (!path) {
      return new Response(JSON.stringify({ success: false, reason: 'not_found' }), { status: 200 });
    }

    const { data: signed, error: signError } = await admin.storage.from('chat-media').createSignedUrl(path, 300);
    if (signError || !signed?.signedUrl) {
      return new Response(JSON.stringify({ success: false, reason: 'unavailable' }), { status: 200 });
    }

    return new Response(JSON.stringify({ ...data, signedUrl: signed.signedUrl }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[claim-ephemeral-media] failed:', err);
    return new Response(JSON.stringify({ success: false, reason: 'network_error' }), { status: 500 });
  }
});
