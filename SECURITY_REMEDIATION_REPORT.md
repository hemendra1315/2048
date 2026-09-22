# Security Remediation Report: authentication and authorization hotfix

- **Date:** 23 Sep 2026
- **Repository:** serene-brahmagupta
- **Base commit:** `a1f7b16` (pushed to `origin/main`)
- **Scope:** security fixes only. No features, no unrelated refactoring.

## 1. Findings verified

Every finding was confirmed by reading the file at base commit `a1f7b16`. Line numbers refer to that commit.

| # | Question | Before (a1f7b16) | Evidence | Now |
|---|---|---|---|---|
| 1 | AuthContext falls back to direct Supabase login when vault-auth fails | **Yes** | `src/context/AuthContext.tsx` 200–213: on *any* error it calls `supabase.auth.signInWithPassword` with `<name>@vault.local` | **Removed** |
| 2 | AuthContext falls back to direct Supabase sign-up | **Yes** | same file, 298–352: `supabase.auth.signUp`, then `profiles.upsert`, then a fake local session and recovery key | **Removed** |
| 3 | Role/status read from user metadata when the profile fails to load | **Yes** | same file, 84–98: profile built from `user_metadata`, `status: 'active'` hard-coded | **Removed** |
| 4 | Hard-coded username granted admin in frontend | **Yes** | lines 92 and 308: `username === 'sanah' ? 'super_admin' : 'user'` | **Removed** (0 matches for `sanah`/`vault.local` in `src/` and in the built bundle) |
| 5 | SQL script creates accounts directly in `auth.users` | **Yes** | `supabase/init_schema_and_admin.sql` 239–300 | **Removed** (file replaced; 0 matches repo-wide) |
| 6 | SQL script contains a plaintext password | **Yes** | same file, line 262 (`crypt('<literal>', …)`); also in git history at `96307f0` | **Removed** from the working tree. ⚠ Still in history, and the repo is public. |
| 7 | A policy allows self-assignment of `role='super_admin'` | **Yes**, if the script was run | same file, 198–200: `"Users can insert own profile"`; the UPDATE guard doesn't cover INSERT | **Fixed** by migration `…000006`: policy dropped, INSERT revoked, `guard_profile_insert` trigger |
| 8 | A bucket is accidentally public | **Yes**, in that script (lines 230–232). Migrations: `gallery` private, `avatars` public by design | Live check: `gallery` is private on both projects | `…000006` forces `gallery` private |
| 9 | Abusable SECURITY DEFINER functions | Two trigger functions (`handle_connection_accepted`, `handle_conversation_created`) had no pinned `search_path` and were executable by `anon`/`authenticated`. `log_admin_action` was redefined in `…000005` without a pinned `search_path`. | `pg_proc` listing | `…000006` pins `log_admin_action`. New `…000007` pins and revokes the two trigger functions. Every other SECURITY DEFINER function checks `auth.uid()`/`is_super_admin()` or is executable by the service role only (see `security_verification.sql` query 10). |

`supabase/functions/vault-auth/*` was re-checked. Its only `signInWithPassword` call is the approved server-side one: it runs after the lockout check, with a fresh anon client, inside the function. It refuses suspended and banned accounts (403) on password login, fingerprint login and reset.

## 2. Files changed

| File | Change |
|---|---|
| `src/context/AuthContext.tsx` | Fallback login, fallback sign-up, metadata-derived profile and hard-coded admin username removed (previous review). **This hotfix:** role and status are taken only from `public.profiles`; any non-`active` status ends the session, including sessions opened before a suspension; `adoptSession` no longer falls back to the response body; diagnostic logging added. |
| `supabase/init_schema_and_admin.sql` | Replaced with an inert stub (no schema, accounts or credentials) that documents the approved admin workflow |
| `supabase/complete_setup.sql` | Regenerated from all 8 migrations, in order. Verified on an empty database. |
| `supabase/migrations/20260923000006_security_incident_remediation.sql` | New: removes the unsafe script's policies; profile INSERT guard; `gallery` private; audit-log insert check; neutralises out-of-band super admins |
| `supabase/migrations/20260923000007_definer_trigger_hardening.sql` | New (this hotfix): pins `search_path` on, and revokes EXECUTE for, the two SECURITY DEFINER trigger functions |
| `supabase/security_verification.sql` | New: read-only production verification queries |

No other application files were touched.

## 3. Exact code removed and 4. exact code added

Full diff of `src/context/AuthContext.tsx` against `a1f7b16`:

```diff
--- a/src/context/AuthContext.tsx
+++ b/src/context/AuthContext.tsx
@@ -58,18 +58,31 @@ export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) =>
   }, []);
 
-  /** Loads the signed-in user's profile. Identity comes from the Supabase session, never from local storage. */
-  const loadProfile = useCallback(async (userId: string | undefined, sessionUser?: { email?: string; user_metadata?: Record<string, unknown>; created_at?: string }) => {
+  /**
+   * Loads the signed-in user's profile. Identity, role and status come ONLY from public.profiles
+   * (read under RLS with the Supabase session). Never from auth metadata, JWT claims or local storage.
+   */
+  const loadProfile = useCallback(async (userId: string | undefined, hasSession = false) => {
     if (!userId) {
       setUser(null);
       return null;
     }
+    let profileMissing = false;
     try {
       const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
+      // PGRST116 = no row visible for this user: the session has no server-side profile.
+      if (error?.code === 'PGRST116') profileMissing = true;
       if (!error && data) {
         const profile = data as unknown as UserProfile;
-        if (profile.status === 'banned') {
+        if (profile.status !== 'active') {
+          // Suspended or banned accounts keep no session, including sessions opened before the change.
+          console.warn('[auth] profile status is not active; signing out', { status: profile.status });
           await supabase.auth.signOut();
           setUser(null);
-          showToast('This account has been permanently suspended by administration.', 'error');
+          showToast(
+            profile.status === 'banned'
+              ? 'This account has been permanently suspended by administration.'
+              : 'This account is suspended.',
+            'error',
+          );
           return null;
         }
@@ -78,25 +91,13 @@ export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) =>
       }
     } catch (e) {
-      console.warn('Could not query profiles table:', e);
+      console.warn('[auth] could not load profile', e);
     }
 
-    if (sessionUser) {
-      const meta = sessionUser.user_metadata || {};
-      const username = (meta.username as string) || sessionUser.email?.split('@')[0] || 'User';
-      const fallback: UserProfile = {
-        id: userId,
-        uid: (meta.uid as string) || `PHOENIX-${Math.floor(1000 + Math.random() * 9000)}`,
-        username: username,
-        display_name: (meta.display_name as string) || username,
-        avatar_url: (meta.avatar_url as string) || null,
-        role: (meta.role as 'user' | 'super_admin') || (username.toLowerCase() === 'sanah' ? 'super_admin' : 'user'),
-        status: 'active',
-        created_at: sessionUser.created_at || new Date().toISOString(),
-        updated_at: new Date().toISOString(),
-      };
-      setUser(fallback);
-      return fallback;
+    // No fallback: a session without a readable server-side profile is not signed in, and no role
+    // or status is inferred. (Auth user_metadata is user-editable and is never read.)
+    if (hasSession && profileMissing) {
+      console.warn('[auth] session has no profile row; signing out');
+      await supabase.auth.signOut();
     }
-
     setUser(null);
     return null;
@@ -108,5 +109,5 @@ export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) =>
         const { data: { session } } = await supabase.auth.getSession();
         if (session) {
-          await loadProfile(session.user.id, session.user);
+          await loadProfile(session.user.id, true);
         } else {
           setUser(null);
@@ -151,5 +152,5 @@ export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) =>
       const { data } = supabase.auth.onAuthStateChange((event, session) => {
         if (event === 'SIGNED_OUT') setUser(null);
-        else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') void loadProfile(session?.user?.id, session?.user);
+        else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') void loadProfile(session?.user?.id, Boolean(session));
       });
       return () => {
@@ -177,5 +178,10 @@ export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) =>
     });
     if (error) throw error;
-    const profile = (await loadProfile(result.profile.id)) ?? result.profile;
+    // The UI identity is the profile row read back under the new session, not the response body.
+    const profile = await loadProfile(result.profile.id, true);
+    if (!profile) {
+      await supabase.auth.signOut();
+      throw new Error('Could not load your profile. Please sign in again.');
+    }
     return profile;
   };
@@ -186,4 +192,7 @@ export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) =>
       return await fn();
     } catch (err) {
+      // Diagnostics only: error code/status, never credentials.
+      const e = err as { code?: string; status?: number; message?: string };
+      console.warn('[auth] request failed', { code: e?.code, status: e?.status, message: e?.message });
       showToast(err instanceof Error ? err.message : fallback, 'error');
       throw err;
@@ -198,19 +207,6 @@ export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) =>
       const cleanId = identifier.trim();
       if (isSupabaseConfigured()) {
-        try {
-          profile = await adoptSession(await callVaultAuth<AuthResult>('login', { identifier: cleanId, password }));
-        } catch (vaultErr) {
-          console.warn('Edge function vault-auth unavailable, falling back to direct Supabase Auth:', vaultErr);
-          const email = cleanId.includes('@') ? cleanId : `${cleanId.toLowerCase()}@vault.local`;
-          const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
-            email,
-            password,
-          });
-          if (authError) throw authError;
-          if (!authData.user || !authData.session) throw new Error('No user session returned');
-          const loaded = await loadProfile(authData.user.id, authData.user);
-          if (!loaded) throw new Error('Could not load user profile');
-          profile = loaded;
-        }
+        // All credential checks, lockouts and legacy-account migration happen in vault-auth.
+        profile = await adoptSession(await callVaultAuth<AuthResult>('login', { identifier: cleanId, password }));
       } else if (useMock) {
         profile = await mockBackend.loginWithPassword(cleanId, password);
@@ -275,82 +271,25 @@ export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) =>
       const cleanUsername = params.username.toLowerCase().trim();
       if (isSupabaseConfigured()) {
-        try {
-          const result = await callVaultAuth<AuthResult>('register', {
-            username: cleanUsername,
-            password: params.password,
-          });
-          // Show the recovery key before the vault opens.
-          setRecoveryCodeToShow(result.recoveryCode ?? null);
-          const profile = await adoptSession(result);
-          if (params.enableBiometrics) {
-            try {
-              const options = await callVaultAuth<{ publicKey: ServerCreationOptions }>('webauthn-register-options');
-              const credential = await BiometricService.createCredential(options.publicKey);
-              const res = await callVaultAuth<{ profile: UserProfile }>('webauthn-register-verify', { credential });
-              BiometricService.setLocalEnrollment(true);
-              setUser(res.profile);
-            } catch (err) {
-              showToast(`Fingerprint not enabled: ${err instanceof Error ? err.message : 'cancelled'}`, 'info');
-            }
-          }
-          showToast('Vault identity activated', 'success');
-          return { user: profile, recoveryCode: result.recoveryCode ?? '' };
-        } catch (vaultErr) {
-          console.warn('Edge function vault-auth unavailable, falling back to direct Supabase signup:', vaultErr);
-          const email = `${cleanUsername}@vault.local`;
-          const generatedUid = `PHOENIX-${Math.floor(1000 + Math.random() * 9000)}`;
-          const recoveryCode = Array.from(crypto.getRandomValues(new Uint8Array(16)))
-            .map(b => b.toString(16).padStart(2, '0'))
-            .join('')
-            .toUpperCase()
-            .match(/.{1,4}/g)!
-            .join('-');
-          const role = cleanUsername === 'sanah' ? 'super_admin' : 'user';
-
-          const { data: authData, error: authError } = await supabase.auth.signUp({
-            email,
-            password: params.password,
-            options: {
-              data: {
-                username: cleanUsername,
-                display_name: params.username.trim(),
-                uid: generatedUid,
-                role,
-              },
-            },
-          });
-
-          if (authError) throw authError;
-          if (!authData.user) throw new Error('Registration failed');
-
+        // Accounts are created only by vault-auth (server-side validation, throttling, bcrypt).
+        const result = await callVaultAuth<AuthResult>('register', {
+          username: cleanUsername,
+          password: params.password,
+        });
+        // Show the recovery key before the vault opens.
+        setRecoveryCodeToShow(result.recoveryCode ?? null);
+        const profile = await adoptSession(result);
+        if (params.enableBiometrics) {
           try {
-            await supabase.from('profiles').upsert({
-              id: authData.user.id,
-              uid: generatedUid,
-              display_name: params.username.trim(),
-              role,
-              status: 'active',
-            });
-          } catch (e) {
-            console.warn('Could not upsert to public.profiles:', e);
+            const options = await callVaultAuth<{ publicKey: ServerCreationOptions }>('webauthn-register-options');
+            const credential = await BiometricService.createCredential(options.publicKey);
+            const res = await callVaultAuth<{ profile: UserProfile }>('webauthn-register-verify', { credential });
+            BiometricService.setLocalEnrollment(true);
+            setUser(res.profile);
+          } catch (err) {
+            showToast(`Fingerprint not enabled: ${err instanceof Error ? err.message : 'cancelled'}`, 'info');
           }
-
-          const profile: UserProfile = {
-            id: authData.user.id,
-            uid: generatedUid,
-            username: cleanUsername,
-            display_name: params.username.trim(),
-            avatar_url: null,
-            role,
-            status: 'active',
-            created_at: new Date().toISOString(),
-            updated_at: new Date().toISOString(),
-          };
-
-          setUser(profile);
-          setRecoveryCodeToShow(recoveryCode);
-          showToast('Vault identity activated', 'success');
-          return { user: profile, recoveryCode };
         }
+        showToast('Vault identity activated', 'success');
+        return { user: profile, recoveryCode: result.recoveryCode ?? '' };
       }
       if (!useMock) throw new Error(NOT_CONFIGURED);
```

SQL additions are the complete contents of `20260923000006_security_incident_remediation.sql` and `20260923000007_definer_trigger_hardening.sql`. SQL removals are the entire previous body of `init_schema_and_admin.sql` (in git at `a1f7b16`; not reproduced here because it contains the leaked credential).

## Validation performed

**Browser tests.** The production bundle, built from this code, ran in headless Chromium at 390×844 against the real `vault-auth` handler and all 8 migrations in local Postgres. Supabase Auth and PostgREST were simulated for the test; every query ran as the signed-in role, so RLS applied. The harness counted every request the app made to the direct Supabase Auth endpoints (`/auth/v1/signup` and `/auth/v1/token?grant_type=password`), which only the removed fallback code would call.

| Attempt | Result |
|---|---|
| Wrong password | Error shown; no session; 0 direct-Auth calls ✅ |
| Locked account (5 failures, then the correct password) | "Too many attempts"; no session; 0 direct-Auth calls ✅ |
| Duplicate username at sign-up | "taken" error; no fake local account or recovery key; 0 sign-up calls ✅ |
| Banned account | Refused; no session ✅ |
| Account suspended while signed in | Session ended on the next load ✅ |
| Session with no profile row, carrying `role: super_admin` metadata | Signed out; no signed-in UI; no admin toggle or hub ✅ |
| Normal user with fake `super_admin` / `active` metadata | No admin toggle, no ADMIN badge ✅ |
| Direct admin access (`/admin`, `/#/admin`, `?admin=1`, `/#admin`) | No admin UI (the app has no admin route; the hub only renders when the profile row says `super_admin`) ✅ |
| Same user calling admin endpoints directly | `admin_access_log` returns 0 rows; `admin_set_user_status` refused ✅ |

Result: **27 passed, 0 failed.** Regression suites with migrations 1–7 also pass:
- RLS and ownership: 94 checks
- Super admin: 37 checks
- Auth and WebAuthn handler: 59 checks

Screenshots: `screenshots-hotfix/` (wrong password, locked, suspended session ended, ghost session, fake metadata).

### Build and lint (your machine)

| Command | Result |
|---|---|
| `npm run lint` | ✅ **passed** (exit 0) |
| `npm run build` → `tsc -b` | ✅ **passed** (exit 0) |
| `npm run build` → `vite build` | ❌ **could not run in this environment.** `Cannot find module @rollup/rollup-linux-x64-gnu`: `node_modules` was installed on Windows and holds only the Windows Rollup binary; my Linux workspaces can't install packages (registry blocked). This is an environment limit, not a code error. |

**`npm run build` is therefore not confirmed passing.** Run it on Windows before deploying (step 1 below). The app was also bundled with Bun in production mode as a stand-in: it succeeded, and the bundle contains no `vault.local` or `sanah` and no demo switcher.

## 5. Remaining risks

1. **The leaked credential is in public git history** (`96307f0`). `…000006` neutralises the account in any database it's applied to (demote, suspend, random password). Anyone who copied the repo still has the password, so never reuse it.
2. **Unknown database state.** It's not known whether either Supabase project (`bdztdcadfhxlegtiffli`, `dddsplxihciighvmaqqt`) ever ran the unsafe script. Run `supabase/security_verification.sql` in both.
3. **Public sign-up is enabled** on production (`disable_signup: false`, verified live). Direct Auth users can no longer obtain a profile or UI access, but they still create orphan `auth.users` rows. Turn it off.
4. **Direct password grant.** Supabase Auth's own `/auth/v1/token?grant_type=password` still accepts email and password without the app's lockout. Supabase's own rate limits apply. Consider Auth CAPTCHA.
5. **Out of scope for this hotfix (no feature work):**
   - Gallery uploads use `getPublicUrl` on the private bucket, so images are broken. Never "fix" this by making the bucket public.
   - The camera stores images as base64 in the database.
   - `supabase/.temp` is tracked in git.

## 6. Deployment steps

1. On Windows, in the project folder: `npm run build` and `npm run lint`. Both must pass.
2. Commit only these security files (below).
3. For **each** Supabase project (`bdztdcadfhxlegtiffli` and `dddsplxihciighvmaqqt`): run `npx supabase link --project-ref <ref>`, then `npx supabase db push` (applies `…000006`, `…000007`).
4. Deploy the frontend: `npx vercel --prod --yes`.
5. In each project's SQL editor, run `supabase/security_verification.sql` and compare against the expected results.
6. Delete the `@vault.local` user if query 2 lists one: **Authentication → Users**.
7. Turn off **Authentication → Sign In / Providers → Allow new users to sign up**.
8. Re-promote legitimate admins only with `select public.grant_super_admin('<username>', null);`.

### Commit (security fixes only)

```bash
git add src/context/AuthContext.tsx supabase/init_schema_and_admin.sql supabase/complete_setup.sql \
        supabase/migrations/20260923000006_security_incident_remediation.sql \
        supabase/migrations/20260923000007_definer_trigger_hardening.sql \
        supabase/security_verification.sql SECURITY_AUDIT.md SECURITY_REMEDIATION_REPORT.md
git commit -m "security: remove auth fallbacks and metadata-derived roles; neutralise hardcoded admin; harden RLS and definer functions"
```
