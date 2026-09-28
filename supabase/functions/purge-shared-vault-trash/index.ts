// Supabase Edge Function: permanently purges Shared Vault items that have sat
// in Trash for 30+ days -- both the database row AND the underlying storage
// object (when one was recorded), mirroring purge-gallery-trash's approach
// since Postgres/pg_cron can schedule this call (via pg_net) but cannot
// itself reach the Storage API.
//
// Deploy:  supabase functions deploy purge-shared-vault-trash
// Invoked by the 'purge-deleted-shared-vault-items' pg_cron job using the
// public anon key -- JWT verification only checks the caller presented a
// validly-signed project key, not that they're an authenticated user; the
// actual privileged work happens via this function's own service-role
// client, never exposed to the caller.

import { createClient } from 'npm:@supabase/supabase-js@2';

const url = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !serviceKey) throw new Error('Missing Supabase environment variables');

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const RETENTION_DAYS = 30;
const BATCH_SIZE = 200;

Deno.serve(async () => {
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: items, error: selectError } = await admin
      .from('shared_vault_items')
      .select('id, storage_path')
      .not('deleted_at', 'is', null)
      .lte('deleted_at', cutoff)
      .limit(BATCH_SIZE);

    if (selectError) throw selectError;
    if (!items || items.length === 0) {
      return new Response(JSON.stringify({ purged: 0 }), { headers: { 'Content-Type': 'application/json' } });
    }

    // Most Shared Vault uploads only record a signed media_url, not a storage_path, so
    // this will often be empty -- still attempt it for the items that do have one.
    const paths = items.map(i => i.storage_path).filter((p): p is string => Boolean(p));
    if (paths.length > 0) {
      const { error: removeError } = await admin.storage.from('chat-media').remove(paths);
      // Don't abandon the whole batch over one storage error (e.g. an already-missing
      // object) -- log it and still clean up the DB rows so trash doesn't get stuck.
      if (removeError) console.error('[purge-shared-vault-trash] storage removal error:', removeError.message);
    }

    const ids = items.map(i => i.id);
    const { error: deleteError } = await admin.from('shared_vault_items').delete().in('id', ids);
    if (deleteError) throw deleteError;

    return new Response(JSON.stringify({ purged: ids.length }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[purge-shared-vault-trash] failed:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
