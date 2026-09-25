// vault-auth request handler. All identity decisions happen here, on the server:
// passwords are checked by Supabase Auth (or the legacy hash check during migration),
// fingerprint logins by WebAuthn signature verification, and every failure is throttled.
// Dependencies are injected so the logic can be tested without a live Supabase project.

import {
  b64urlEncode,
  parseClientData,
  verifyAuthentication,
  verifyRegistration,
  WebAuthnError,
  COSE_ES256,
  COSE_RS256,
} from './webauthn.ts';

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
}

export interface AuthBackend {
  createUser(args: { id: string; email: string; password: string }): Promise<void>;
  deleteUser(id: string): Promise<void>;
  userExists(id: string): Promise<boolean>;
  setPassword(id: string, password: string): Promise<void>;
  /** Returns null for wrong credentials. */
  passwordSignIn(email: string, password: string): Promise<Session | null>;
  /** Issues a session for a user whose identity the server has already verified. */
  mintSession(email: string): Promise<Session>;
  /** Validates a Supabase access token and returns its user id, or null. */
  userIdFromAccessToken(token: string): Promise<string | null>;
}

export interface Db {
  rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T>;
}

export interface Config {
  allowedOrigins: string[];
  rpId?: string;
  rpName: string;
  emailDomain: string;
}

interface Limit {
  max: number;
  window: string;
  lock: string;
}

// Brute-force thresholds. Each lock doubles on repeat (15m, 30m, 1h, ... capped at 24h).
export const LIMITS: Record<string, Limit> = {
  loginAccount: { max: 5, window: '15 minutes', lock: '15 minutes' },   // wrong passwords per account
  recoveryAccount: { max: 5, window: '1 hour', lock: '1 hour' },        // wrong recovery keys per account
  biometricAccount: { max: 10, window: '15 minutes', lock: '15 minutes' }, // bad fingerprint assertions per account
  ip: { max: 30, window: '15 minutes', lock: '15 minutes' },             // any auth failure per client IP
  registerIp: { max: 10, window: '1 hour', lock: '1 hour' },             // sign-ups per client IP
};

const USERNAME_RE = /^[a-z0-9_]{2,24}$/;

interface Account {
  user_id: string;
  username: string;
  status: 'active' | 'suspended' | 'banned';
  biometric_enabled: boolean;
  auth_migrated: boolean;
}

class HttpError extends Error {
  status: number;
  code: string;
  retryAfter?: number;
  constructor(status: number, code: string, message: string, retryAfter?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

function passwordProblem(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < 8) return 'Password must be at least 8 characters';
  if (new TextEncoder().encode(password).length > 72) return 'Password must be at most 72 bytes';
  return null;
}

export function createHandler(deps: { auth: AuthBackend; db: Db; config: Config }) {
  const { auth, db, config } = deps;
  const emailFor = (userId: string) => `${userId}@${config.emailDomain}`;

  const lockedUntil = async (bucket: string): Promise<Date | null> => {
    const v = await db.rpc<string | null>('throttle_locked_until', { p_bucket: bucket });
    return v ? new Date(v) : null;
  };
  const assertNotLocked = async (...buckets: string[]) => {
    for (const b of buckets) {
      const until = await lockedUntil(b);
      if (until) {
        const secs = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000));
        throw new HttpError(429, 'locked', 'Too many attempts. Try again later.', secs);
      }
    }
  };
  const recordFailure = async (bucket: string, limit: Limit): Promise<Date | null> => {
    const v = await db.rpc<string | null>('throttle_fail', {
      p_bucket: bucket,
      p_max_failures: limit.max,
      p_window: limit.window,
      p_base_lock: limit.lock,
    });
    return v ? new Date(v) : null;
  };
  const clear = (bucket: string) => db.rpc('throttle_clear', { p_bucket: bucket });

  const resolve = (identifier: string) => db.rpc<Account | null>('auth_resolve_account', { p_identifier: identifier });
  const profileOf = (userId: string) => db.rpc<Record<string, unknown>>('auth_get_profile', { p_user_id: userId });

  const ensureAuthUser = async (userId: string, password: string) => {
    if (await auth.userExists(userId)) await auth.setPassword(userId, password);
    else await auth.createUser({ id: userId, email: emailFor(userId), password });
    await db.rpc('auth_mark_migrated', { p_user_id: userId });
  };

  const failAuth = async (accountBucket: string | null, accountLimit: Limit | null, ip: string, message: string) => {
    const locks = await Promise.all([
      accountBucket && accountLimit ? recordFailure(accountBucket, accountLimit) : Promise.resolve(null),
      recordFailure(`ip:${ip}`, LIMITS.ip),
    ]);
    const lock = locks.find(Boolean);
    if (lock) {
      throw new HttpError(429, 'locked', 'Too many attempts. Try again later.', Math.ceil((lock.getTime() - Date.now()) / 1000));
    }
    throw new HttpError(401, 'invalid_credentials', message);
  };

  const originOf = (req: Request): { origin: string; rpId: string } => {
    const origin = req.headers.get('origin') ?? '';
    if (!config.allowedOrigins.includes(origin)) throw new HttpError(403, 'origin_not_allowed', 'Origin not allowed');
    return { origin, rpId: config.rpId ?? new URL(origin).hostname };
  };

  const bearerUser = async (req: Request): Promise<string> => {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const userId = token ? await auth.userIdFromAccessToken(token) : null;
    if (!userId) throw new HttpError(401, 'not_signed_in', 'Sign in first');
    return userId;
  };

  // ------------------------------------------------------------------ actions
  const actions: Record<string, (req: Request, body: Record<string, unknown>, ip: string) => Promise<unknown>> = {
    async register(_req, body, ip) {
      const username = String(body.username ?? '').trim().toLowerCase();
      const password = body.password;
      await assertNotLocked(`register:${ip}`);
      await recordFailure(`register:${ip}`, LIMITS.registerIp); // counts every sign-up attempt
      if (!USERNAME_RE.test(username)) {
        throw new HttpError(400, 'invalid_username', 'Username must be 2-24 lowercase letters, numbers or underscores');
      }
      const problem = passwordProblem(password);
      if (problem) throw new HttpError(400, 'weak_password', problem);
      if (await resolve(username)) throw new HttpError(409, 'username_taken', 'That username is taken');

      const userId = crypto.randomUUID();
      await auth.createUser({ id: userId, email: emailFor(userId), password: password as string });
      let provisioned: { profile: Record<string, unknown>; recovery_code: string };
      try {
        provisioned = await db.rpc('auth_provision_profile', {
          p_user_id: userId,
          p_username: username,
          p_password: password,
        });
      } catch (err) {
        await auth.deleteUser(userId);
        if (String((err as Error).message).includes('username_taken')) {
          throw new HttpError(409, 'username_taken', 'That username is taken');
        }
        throw err;
      }
      const session = await auth.passwordSignIn(emailFor(userId), password as string);
      if (!session) throw new HttpError(500, 'session_failed', 'Could not start a session');
      return { session, profile: provisioned.profile, recoveryCode: provisioned.recovery_code };
    },

    async login(_req, body, ip) {
      const identifier = String(body.identifier ?? '').trim();
      const password = typeof body.password === 'string' ? body.password : '';
      await assertNotLocked(`ip:${ip}`);
      const account = identifier ? await resolve(identifier) : null;
      const bucket = account ? `login:${account.user_id}` : `login:unknown:${identifier.toLowerCase()}`;
      await assertNotLocked(bucket);

      let session: Session | null = null;
      let verified = false;
      if (account && password) {
        if (!account.auth_migrated) {
          // Pre-Supabase-Auth account: check the legacy hash once, then move it into Supabase Auth.
          verified = await db.rpc<boolean>('auth_check_legacy_password', { p_user_id: account.user_id, p_password: password });
          if (verified) await ensureAuthUser(account.user_id, password);
        } else {
          session = await auth.passwordSignIn(emailFor(account.user_id), password);
          verified = session !== null;
        }
      }
      if (!account || !verified) {
        return await failAuth(bucket, LIMITS.loginAccount, ip, 'Invalid username or password');
      }
      await clear(bucket);
      if (account.status !== 'active') throw new HttpError(403, 'account_suspended', 'This account is suspended');
      session ??= await auth.passwordSignIn(emailFor(account.user_id), password);
      if (!session) throw new HttpError(500, 'session_failed', 'Could not start a session');
      await db.rpc('auth_touch_login', { p_user_id: account.user_id });
      return { session, profile: await profileOf(account.user_id) };
    },

    async reset(_req, body, ip) {
      const identifier = String(body.identifier ?? '').trim();
      const code = String(body.recoveryCode ?? '');
      const newPassword = body.newPassword;
      await assertNotLocked(`ip:${ip}`);
      const problem = passwordProblem(newPassword);
      if (problem) throw new HttpError(400, 'weak_password', problem);
      const account = identifier ? await resolve(identifier) : null;
      const bucket = account ? `recovery:${account.user_id}` : `recovery:unknown:${identifier.toLowerCase()}`;
      await assertNotLocked(bucket);

      const ok = account
        ? await db.rpc<boolean>('auth_check_recovery_code', { p_user_id: account.user_id, p_code: code })
        : false;
      if (!account || !ok) {
        return await failAuth(bucket, LIMITS.recoveryAccount, ip, 'Invalid username or recovery key');
      }
      if (account.status !== 'active') throw new HttpError(403, 'account_suspended', 'This account is suspended');

      await ensureAuthUser(account.user_id, newPassword as string);
      const newCode = await db.rpc<string>('auth_after_password_reset', {
        p_user_id: account.user_id,
        p_new_password: newPassword,
      });
      await clear(bucket);
      await clear(`login:${account.user_id}`);
      const session = await auth.passwordSignIn(emailFor(account.user_id), newPassword as string);
      if (!session) throw new HttpError(500, 'session_failed', 'Could not start a session');
      return { session, profile: await profileOf(account.user_id), recoveryCode: newCode };
    },

    async 'webauthn-register-options'(req) {
      const userId = await bearerUser(req);
      const { origin, rpId } = originOf(req);
      const profile = await profileOf(userId);
      const challenge = await db.rpc<string>('webauthn_create_challenge', {
        p_purpose: 'register',
        p_user_id: userId,
        p_rp_id: rpId,
        p_origin: origin,
      });
      const existing = await db.rpc<{ id: string }[]>('webauthn_list_credentials', { p_user_id: userId });
      return {
        publicKey: {
          challenge,
          rp: { id: rpId, name: config.rpName },
          user: {
            id: b64urlEncode(new TextEncoder().encode(userId)),
            name: String(profile.username ?? 'user'),
            displayName: String(profile.display_name ?? profile.username ?? 'user'),
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: COSE_ES256 },
            { type: 'public-key', alg: COSE_RS256 },
          ],
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
          attestation: 'none',
          timeout: 60000,
          excludeCredentials: existing.map(c => ({ type: 'public-key', id: c.id })),
        },
      };
    },

    async 'webauthn-register-verify'(req, body) {
      const userId = await bearerUser(req);
      const cred = (body.credential ?? {}) as Record<string, unknown>;
      const clientData = parseClientData(String(cred.clientDataJSON ?? ''));
      const challenge = await db.rpc<{ user_id: string; rp_id: string; origin: string; challenge: string } | null>(
        'webauthn_consume_challenge',
        { p_challenge: clientData.challenge, p_purpose: 'register' },
      );
      if (!challenge || challenge.user_id !== userId) {
        throw new HttpError(400, 'challenge_invalid', 'Enrollment expired. Try again.');
      }
      const verified = await verifyRegistration(
        {
          credentialId: String(cred.id ?? ''),
          clientDataJSON: String(cred.clientDataJSON ?? ''),
          authenticatorData: String(cred.authenticatorData ?? ''),
          publicKey: String(cred.publicKey ?? ''),
          publicKeyAlgorithm: Number(cred.publicKeyAlgorithm),
        },
        { challenge: challenge.challenge, origin: challenge.origin, rpId: challenge.rp_id },
      );
      await db.rpc('webauthn_save_credential', {
        p_id: verified.credentialId,
        p_user_id: userId,
        p_public_key_spki: verified.publicKey,
        p_algorithm: verified.algorithm,
        p_sign_count: verified.signCount,
        p_rp_id: challenge.rp_id,
      });
      return { ok: true, credentialId: verified.credentialId, profile: await profileOf(userId) };
    },

    async 'webauthn-login-options'(req, body, ip) {
      await assertNotLocked(`ip:${ip}`);
      const { origin, rpId } = originOf(req);
      const identifier = String(body.identifier ?? '').trim();
      const account = identifier ? await resolve(identifier) : null;
      const creds = account ? await db.rpc<{ id: string }[]>('webauthn_list_credentials', { p_user_id: account.user_id }) : [];
      const challenge = await db.rpc<string>('webauthn_create_challenge', {
        p_purpose: 'login',
        p_user_id: account?.user_id ?? null,
        p_rp_id: rpId,
        p_origin: origin,
      });
      return {
        publicKey: {
          challenge,
          rpId,
          userVerification: 'required',
          timeout: 60000,
          allowCredentials: creds.map(c => ({ type: 'public-key', id: c.id })),
        },
      };
    },

    async 'webauthn-login-verify'(_req, body, ip) {
      await assertNotLocked(`ip:${ip}`);
      const cred = (body.credential ?? {}) as Record<string, unknown>;
      const clientData = parseClientData(String(cred.clientDataJSON ?? ''));
      const challenge = await db.rpc<{ user_id: string | null; rp_id: string; origin: string; challenge: string } | null>(
        'webauthn_consume_challenge',
        { p_challenge: clientData.challenge, p_purpose: 'login' },
      );
      if (!challenge) throw new HttpError(400, 'challenge_invalid', 'Fingerprint request expired. Try again.');

      const stored = await db.rpc<{ user_id: string; public_key_spki: string; algorithm: number; sign_count: number } | null>(
        'webauthn_get_credential',
        { p_id: String(cred.id ?? '') },
      );
      if (!stored) return await failAuth(null, null, ip, 'Fingerprint not recognised');
      const bucket = `bio:${stored.user_id}`;
      await assertNotLocked(bucket);
      if (challenge.user_id && challenge.user_id !== stored.user_id) {
        return await failAuth(bucket, LIMITS.biometricAccount, ip, 'Fingerprint not recognised');
      }

      let signCount: number;
      try {
        ({ signCount } = await verifyAuthentication(
          {
            credentialId: String(cred.id ?? ''),
            clientDataJSON: String(cred.clientDataJSON ?? ''),
            authenticatorData: String(cred.authenticatorData ?? ''),
            signature: String(cred.signature ?? ''),
          },
          { publicKey: stored.public_key_spki, algorithm: stored.algorithm, signCount: Number(stored.sign_count) },
          { challenge: challenge.challenge, origin: challenge.origin, rpId: challenge.rp_id },
        ));
      } catch (err) {
        if (err instanceof WebAuthnError) return await failAuth(bucket, LIMITS.biometricAccount, ip, 'Fingerprint not recognised');
        throw err;
      }

      const profile = await profileOf(stored.user_id);
      if (!profile || profile.status !== 'active') throw new HttpError(403, 'account_suspended', 'This account is suspended');
      if (!profile.biometric_enabled) throw new HttpError(401, 'biometrics_disabled', 'Fingerprint unlock is turned off');
      if (!(await auth.userExists(stored.user_id))) throw new HttpError(409, 'sign_in_with_password', 'Sign in with your password first');

      await db.rpc('webauthn_touch_credential', { p_id: String(cred.id), p_sign_count: signCount });
      await clear(bucket);
      await db.rpc('auth_touch_login', { p_user_id: stored.user_id });
      const session = await auth.mintSession(emailFor(stored.user_id));
      return { session, profile };
    },
  };

  const corsHeaders = (req: Request): Record<string, string> => {
    const origin = req.headers.get('origin') ?? '';
    const headers: Record<string, string> = {
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      Vary: 'Origin',
    };
    // Reflecting any *.vercel.app origin let an unrelated site on that shared,
    // multi-tenant domain read the JSON response (including session tokens and
    // recovery codes) of a browser-initiated register/login/reset call. Origins
    // must be explicitly listed in WEBAUTHN_ALLOWED_ORIGINS (which already includes
    // this app's real deployment URL) or be a local dev/native origin.
    if (
      config.allowedOrigins.includes(origin) ||
      origin.startsWith('http://localhost') ||
      origin.startsWith('https://localhost') ||
      origin.startsWith('capacitor://localhost')
    ) {
      headers['Access-Control-Allow-Origin'] = origin;
    }
    return headers;
  };

  const clientIp = (req: Request): string =>
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() ??
    'unknown';

  return async function handle(req: Request): Promise<Response> {
    const cors = corsHeaders(req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const json = (status: number, data: unknown, extra: Record<string, string> = {}) =>
      new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json', ...extra } });

    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: 'bad_request', message: 'Expected JSON' });
    }
    const action = actions[String(body.action ?? '')];
    if (!action) return json(400, { error: 'unknown_action' });

    try {
      return json(200, await action(req, body, clientIp(req) || 'unknown'));
    } catch (err) {
      if (err instanceof HttpError) {
        return json(
          err.status,
          { error: err.code, message: err.message, retryAfter: err.retryAfter },
          err.retryAfter ? { 'Retry-After': String(err.retryAfter) } : {},
        );
      }
      if (err instanceof WebAuthnError) return json(400, { error: err.code, message: 'Fingerprint verification failed' });
      console.error('vault-auth error', err);
      return json(500, { error: 'server_error', message: 'Something went wrong' });
    }
  };
}
