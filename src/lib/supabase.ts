import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('http') &&
    !supabaseUrl.includes('placeholder')
  );
};

/**
 * The offline mock backend accepts any password and exists only for local UI work.
 * It is never available in a production build.
 */
export const isMockBackendAllowed = (): boolean => !isSupabaseConfigured() && !import.meta.env.PROD;

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);

export class VaultAuthError extends Error {
  code: string;
  status: number;
  retryAfter?: number;
  constructor(status: number, code: string, message: string, retryAfter?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

/**
 * Calls the vault-auth Edge Function, which performs every credential check on the server
 * (password, recovery key, WebAuthn signature) and returns a Supabase session.
 */
export async function callVaultAuth<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  if (!isSupabaseConfigured()) {
    throw new VaultAuthError(503, 'not_configured', 'Server is not configured');
  }
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${supabaseUrl}/functions/v1/vault-auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${session?.access_token ?? supabaseAnonKey}`,
    },
    body: JSON.stringify({ action, ...body }),
  });
  let payload: Record<string, unknown> = {};
  try {
    payload = await res.json();
  } catch {
    // non-JSON error page
  }
  if (!res.ok) {
    const retryAfter = typeof payload.retryAfter === 'number' ? payload.retryAfter : undefined;
    let message = typeof payload.message === 'string' ? payload.message : 'Request failed';
    if (res.status === 429 && retryAfter) {
      message = `Too many attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`;
    }
    throw new VaultAuthError(res.status, String(payload.error ?? 'error'), message, retryAfter);
  }
  return payload as T;
}
