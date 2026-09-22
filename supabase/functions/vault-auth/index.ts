// Supabase Edge Function entry point: wires the handler to Supabase Auth and the database.
// Deploy:  supabase functions deploy vault-auth --no-verify-jwt
// (JWT verification is done inside the handler for the actions that need a signed-in user;
//  login and sign-up must be reachable before the caller has a session.)

import { createClient } from 'npm:@supabase/supabase-js@2';
import { createHandler, type AuthBackend, type Db, type Session } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
const allowedOrigins = (Deno.env.get('WEBAUTHN_ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
if (!url || !serviceKey || !anonKey) throw new Error('Missing Supabase environment variables');
if (allowedOrigins.length === 0) throw new Error('Set WEBAUTHN_ALLOWED_ORIGINS, e.g. https://serene-brahmagupta.vercel.app');

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, serviceKey, clientOptions);
const publicClient = () => createClient(url, anonKey, clientOptions);

const toSession = (s: { access_token: string; refresh_token: string; expires_in?: number; expires_at?: number; token_type?: string }): Session => ({
  access_token: s.access_token,
  refresh_token: s.refresh_token,
  expires_in: s.expires_in,
  expires_at: s.expires_at,
  token_type: s.token_type,
});

const auth: AuthBackend = {
  async createUser({ id, email, password }) {
    const { error } = await admin.auth.admin.createUser({
      id,
      email,
      password,
      email_confirm: true,
      app_metadata: { provider: 'vault' },
    });
    if (error) throw error;
  },
  async deleteUser(id) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
  },
  async userExists(id) {
    const { data, error } = await admin.auth.admin.getUserById(id);
    if (error && error.status !== 404) throw error;
    return Boolean(data?.user);
  },
  async setPassword(id, password) {
    const { error } = await admin.auth.admin.updateUserById(id, { password });
    if (error) throw error;
  },
  async passwordSignIn(email, password) {
    const { data, error } = await publicClient().auth.signInWithPassword({ email, password });
    if (error) {
      if (error.status === 400 || error.code === 'invalid_credentials') return null;
      throw error;
    }
    return data.session ? toSession(data.session) : null;
  },
  async mintSession(email) {
    // The server has already verified the WebAuthn assertion; exchange a one-time magic-link token
    // for a session without sending any email.
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (error) throw error;
    const tokenHash = data.properties?.hashed_token;
    if (!tokenHash) throw new Error('No token returned');
    const { data: verified, error: verifyError } = await publicClient().auth.verifyOtp({
      token_hash: tokenHash,
      type: 'magiclink',
    });
    if (verifyError || !verified.session) throw verifyError ?? new Error('No session returned');
    return toSession(verified.session);
  },
  async userIdFromAccessToken(token) {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  },
};

const db: Db = {
  async rpc(fn, args) {
    const { data, error } = await admin.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data;
  },
};

Deno.serve(
  createHandler({
    auth,
    db,
    config: {
      allowedOrigins,
      rpId: Deno.env.get('WEBAUTHN_RP_ID') || undefined,
      rpName: Deno.env.get('WEBAUTHN_RP_NAME') || 'Retro Arcade',
      emailDomain: Deno.env.get('VAULT_ACCOUNT_EMAIL_DOMAIN') || 'users.arcade-vault.invalid',
    },
  }),
);
