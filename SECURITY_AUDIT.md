# Security Incident Review: serene-brahmagupta

- **Date:** 23 Sep 2026
- **Scope:** every SQL file, migration, seed, setup/bootstrap script, env file and auth-related frontend file in the repository (commit `a1f7b16`, which is pushed to the public GitHub repo `hemendra1315/2048`). Also read-only checks of the live site and both Supabase projects referenced by the repository.
- **Method:**
  - Static review of every file.
  - Each migration applied to a local Postgres database that mimics Supabase's roles.
  - Database state compared before and after the unsafe script and the remediation migration.
  - Read-only HTTP checks against production. No accounts were created and no credentials were used.

---

## Executive summary

The repository contains a **production backdoor**. `supabase/init_schema_and_admin.sql` created a **super-admin account directly in `auth.users` with a password written in the file**, and it was committed and pushed to a **public GitHub repository** (commit `96307f0`). The same script:

- added permissive RLS policies that override the hardened ones,
- let any signed-in user insert their own `profiles` row with `role = 'super_admin'`,
- made the private `gallery` bucket public.

The deployed frontend (live bundle `index-BwViZTm8.js`) also contains fallback sign-in and sign-up code. It:

- bypasses the server-side sign-in function and its lockouts,
- assigns `super_admin` to the username `sanah` in client code,
- trusts user-editable auth metadata for role and status.

Public sign-up is **enabled** on production (`disable_signup: false`).

The live checks show that the unsafe script's storage section was **not** applied on either project: the `gallery` bucket is not public on `bdztdcadfhxlegtiffli` or on `dddsplxihciighvmaqqt`. Whether its account or policies were applied **cannot be confirmed from outside the database**. Run `supabase/security_verification.sql` in each project.

Everything below is fixed in code. None of it is live until you deploy:

- `20260923000006_security_incident_remediation.sql` removes every effect of the unsafe script if it ran, and neutralises out-of-band super admins. It is idempotent.
- Safe replacements for both setup scripts.
- The frontend fallbacks are removed.

| Severity | Count | Open after deploying the fixes |
|---|---|---|
| Critical | 4 | 0 (credential rotation needs owner action) |
| High | 4 | 1 (public sign-up setting, dashboard only) |
| Medium | 5 | 2 (see "Remaining") |
| Low / Info | 5 | n/a |

---

## Critical

### C1: Hardcoded super-admin credential committed to a public repository
- **File:** `supabase/init_schema_and_admin.sql`, lines 239–300 (lines 244–266 insert into `auth.users`; line 262 has the plaintext password inside `crypt()`; line 265 puts `role: super_admin` in the metadata). It is also in git history at commit `96307f0` on `origin/main`.
- **Risk:** anyone who reads the repository knows the email (`sanah@vault.local`) and the password of a super-admin account.
- **Attack scenario:** read the file on GitHub, then sign in with that email and password through the public Supabase Auth API or the frontend fallback (C3). The result is super-admin access to every profile, conversation, message, gallery item and the audit log.
- **Production impact:** full data exposure, if the script ran on that project. This is unverified; see query 1 and query 2 in `security_verification.sql`.
- **Fix:**
  - The file is replaced with a safe stub that has no schema and no accounts.
  - Migration `…000006` demotes to `user`, suspends and **replaces the password** of every super admin created outside the approved flow: any super admin without an `account_secrets` row, or with an `@vault.local` email. Each one is logged as `REVOKE_SUPER_ADMIN`.
  - Owner actions are listed under Remediation below.

### C2: Self-service privilege escalation via profile INSERT policy
- **File:** `supabase/init_schema_and_admin.sql` lines 198–200 (`"Users can insert own profile"`, `WITH CHECK (auth.uid() = id OR is_super_admin())`).
- **Risk:** the hardened schema only guards profile UPDATEs. With this policy, a user who has an Auth account but no profile can INSERT their own row with any `role`.
- **Attack scenario:** public sign-up is enabled (H1), so anyone can create an Auth user directly, then insert a `profiles` row with `role = 'super_admin'`.
- **Production impact:** anyone can become super admin, if the script ran.
- **Fix:**
  - Migration `…000006` drops the policy.
  - It revokes `INSERT` on `profiles` from `anon` and `authenticated`.
  - It adds a `guard_profile_insert` trigger that refuses inserts from end-user roles.
  - Profiles are created only by `auth_provision_profile` (service role, from the vault-auth function).

### C3: Frontend fallback authentication bypasses the server
- **File:** `src/context/AuthContext.tsx`:
  - lines 200–213: on **any** vault-auth error, including wrong password or 429 lockout, it retries with `supabase.auth.signInWithPassword` against `<username>@vault.local`;
  - lines 298–352: on any register error, including "username taken", it calls `supabase.auth.signUp` directly;
  - line 308: `role = username === 'sanah' ? 'super_admin' : 'user'`, placed in user metadata and upserted into `profiles`.
- **Risk:**
  - It skips the lockouts, the username-uniqueness check and the password rules.
  - It is exactly the path that makes C1 usable from the UI.
  - Registering a taken username produces a fake local account and a recovery key that doesn't work.
- **Attack scenario:** sign in as the C1 account through the normal login form. Or register `sanah` while the fallback path is active.
- **Production impact:** **live now.** The deployed bundle contains `vault.local`, `sanah` and a direct `signUp(` call. The damage is limited only because production's `gallery` bucket and (probably) its policies were not changed by the script.
- **Fix:** all three fallbacks are removed. Sign-in, sign-up and reset go only through vault-auth.

### C4: Role and status taken from user-editable auth metadata
- **File:** `src/context/AuthContext.tsx` lines 84–98. If the profile row can't be read, the app builds a profile from `session.user.user_metadata`, including `role`, and always sets `status: 'active'`.
- **Risk:** any user can set their own `user_metadata` with `supabase.auth.updateUser({ data: { role: 'super_admin' } })`. Banned users with an unreadable profile appear active.
- **Attack scenario:**
  1. Sign up directly (public sign-up is on).
  2. Set `role` in the metadata.
  3. Load the app: the admin UI renders. Data is still protected by RLS, so this exposes the admin UI, not admin data.
- **Production impact:** **live now**, as a client-side privilege display bypass.
- **Fix:** no fallback profile. A session without a readable server profile is signed out.

---

## High

### H1: Public sign-up enabled on production
- **Where:** Supabase dashboard setting. Verified live: `GET /auth/v1/settings` returned `disable_signup: false`.
- **Risk:** anyone can create Auth users outside vault-auth. That feeds C2 and C4 and creates orphan `auth.users` rows.
- **Fix (owner):** **Authentication → Sign In / Providers → turn off "Allow new users to sign up".** vault-auth creates users with the service role, so the app is unaffected. After `…000006`, such users can't get a profile anyway.

### H2: Permissive RLS policies override the hardened ones
- **File:** `supabase/init_schema_and_admin.sql`. Policies are OR-combined, so each one below widens access:
  - line 192: `profiles` SELECT `USING (true)`. Every signed-in user reads every profile.
  - lines 195–196: `profiles` UPDATE for the owner, with no `WITH CHECK`.
  - lines 213–214: `messages` INSERT `WITH CHECK (auth.uid() = sender_id)`, with no membership check. Anyone can post into any conversation whose id they know.
  - lines 204–227: duplicates for `messages` and `gallery_items`.
- **Fix:** migration `…000006` drops all eight policies by name. The verification query 6b checks that no policy is left as `true`.

### H3: Private gallery bucket made public
- **File:** `supabase/init_schema_and_admin.sql` lines 230–232 (`('gallery','gallery', true) … ON CONFLICT DO UPDATE SET public = true`).
- **Risk:** every private photo is readable by anyone who has or guesses its URL. Storage policies don't apply to public URLs.
- **Production impact:** **not applied.** Verified live: `/storage/v1/object/public/gallery/…` returns "Bucket not found" (private) on both projects.
- **Fix:** migration `…000006` forces `gallery.public = false`. The script is replaced.

### H4: Broken all-in-one schema script
- **File:** `supabase/complete_setup.sql`. It skipped migrations `…000001` and `…000002`, so it **fails part-way** on a new project (at the `account_secrets` copy, with "column p.password_hash does not exist"). That leaves a half-built schema, with no lockout tables and no vault functions. It also carried an older copy of the policies.
- **Fix:** regenerated from all seven migrations, in order, with no accounts or credentials. It runs cleanly on an empty database (verified: 26 policies, gallery private, 0 profiles).

---

## Medium

| # | File / line | Issue | Fix |
|---|---|---|---|
| M1 | `supabase/migrations/20260923000005_super_admin_user_inspector.sql` 10–13 | A new `admin_access_log` INSERT policy without `admin_id = auth.uid()`. OR'd with the original, it lets an admin write log rows that name another admin as the actor, which undermines the audit trail. | `…000006` drops it and restores the single policy `is_super_admin() AND admin_id = auth.uid()`. |
| M2 | same file, 16–41 | `log_admin_action` redefined as SECURITY DEFINER **without** a pinned `search_path`. | `…000006` sets `search_path = public` (and on `is_super_admin()`). |
| M3 | `src/components/gallery/UploadModal.tsx` 63 | Stores `getPublicUrl()` for the **private** gallery bucket, so uploaded images don't display. That creates pressure to "fix" it by making the bucket public (H3). | **Open.** Store only `storage_path` and display through `createSignedUrl` (as `adminApi.ts` already does). Never make `gallery` public. |
| M4 | `src/components/camera/CameraView.tsx` 141, 171 | Stores captured photos as base64 data URLs in `gallery_items.image_url`, not in Storage. Private images end up in database backups, logs and every query result, and rows can be several MB. | **Open.** Upload to the private bucket like `UploadModal`. |
| M5 | `supabase/functions/vault-auth` + Supabase Auth | Password lockout is enforced in vault-auth, but the public Auth endpoint `/auth/v1/token?grant_type=password` still takes email and password directly. Emails are `<user-id>@users.arcade-vault.invalid`, and user ids are visible to a user's connections and to admins. | Partly mitigated by Supabase's own rate limits. Consider turning off the email provider's password grant for end users, or enabling Auth CAPTCHA. |

## Low / Info

| # | File / line | Note |
|---|---|---|
| L1 | `supabase/.temp/*` (tracked in git) | Project ref, pooler host and DB user are public. No password is present (checked in current files and full history). Add `supabase/.temp` to `.gitignore` and untrack it. |
| L2 | `.env`, `.env.local` | Not tracked (in `.gitignore`). They contain only the **anon** key, for project `dddsplxihciighvmaqqt`, a **different** project from the deployed one (`bdztdcadfhxlegtiffli`). No service-role key or `sb_secret_` key appears anywhere in the repository or in git history. |
| L3 | `migrations/20260922000001_initial_schema.sql` 266 | The original `handle_new_user` trigger took `role` from sign-up metadata. Removed by `…000003` (still in history; harmless once migrated). |
| L4 | `migrations/20260923000001_frictionless_auth.sql` 20–30 | `GRANT ALL … TO anon` on every table. Revoked by `…000003`; production confirmed (`anon` read of `profiles` → 401). |
| L5 | `src/lib/mockBackend.ts` | Demo data and accounts exist only for offline development. Every sign-in entry point throws in production builds, and the demo switcher is compiled out. Verified in the live bundle: no "Quick Switch". |

---

## Verification results

### Local database (Supabase-like roles), state compared before and after remediation

| Check | After unsafe script | After `…000006` |
|---|---|---|
| Permissive policies present | 9 | 0 |
| `gallery` bucket public | true | false |
| Super admins without `account_secrets` / `@vault.local` | 1 | 0 (demoted, suspended, password replaced, audit-logged) |
| `authenticated` can INSERT `profiles` | true | false |
| `log_admin_action` search_path pinned | no | yes |

Clean install of migrations 1–6: all rows in the "after" state. The existing regression suites still pass with `…000006`: 94 RLS/ownership checks, 37 super-admin checks, 59 auth/WebAuthn checks.

### Live, read-only

- Production bundle contains the C3/C4 fallback code.
- `disable_signup: false` on production.
- `gallery` bucket private on both projects.
- Old client-trusting RPCs are gone (404).
- `grant_super_admin` / `admin_set_user_status` / `verify_vault_unlock` refuse `anon`.

### Checklist

| Requirement | Status |
|---|---|
| No hardcoded passwords | ✅ after fix. ⚠ **Still in git history (`96307f0`)**; treat as leaked. |
| No hardcoded admin credentials | ✅ after fix |
| No public super-admin accounts | ⚠ unknown until query 1/2 is run; `…000006` neutralises them |
| No default production accounts | ✅ in code; ⚠ run query 2/3 |
| No privilege-escalation paths | ✅ after `…000006` plus the frontend fix |
| No RLS bypasses | ✅ after `…000006` (query 6/6b) |
| No accidentally public buckets | ✅ verified live |
| No insecure SECURITY DEFINER functions | ✅ after `…000006` (query 10) |
| No service_role exposure | ✅ (repo, history and bundle checked) |
| No direct `auth.users` manipulation outside approved flows | ✅ in code. `…000006` updates `auth.users` only to replace the password of out-of-band admins. |

---

## Remediation steps (owner)

1. **Do not run** the old `init_schema_and_admin.sql` or `complete_setup.sql` from any earlier commit, download or copy.
2. Deploy the fixes **to every project that might have run the old scripts**, `bdztdcadfhxlegtiffli` **and** `dddsplxihciighvmaqqt`:
   ```bash
   npx supabase db push                       # applies 20260923000006
   npm run build && npx vercel --prod --yes   # removes the frontend fallbacks (C3/C4)
   ```
3. In each project's SQL editor, run `supabase/security_verification.sql` and compare with the expected results in the file.
4. **Rotate or delete the leaked account.**
   - `…000006` has already demoted and suspended it and replaced its password.
   - If query 2 still shows the account, delete it: **Authentication → Users → the `@vault.local` user → Delete**.
   - If you reused that password anywhere else, change it there.
5. Turn off **Allow new users to sign up** (H1). Then review query 3 for Auth users with no profile, and delete any you don't recognise.
6. Re-create admins only through the approved workflow:
   1. Register in the app.
   2. Run `select public.grant_super_admin('<username>', null);`.
   3. Confirm the `GRANT_SUPER_ADMIN` audit row.
7. **Optional history clean-up:** the credential is in public history. Once the account is neutralised (step 4), the credential no longer works. Rewriting history (`git filter-repo --path supabase/init_schema_and_admin.sql --invert-paths`, then a force push) removes the file from future clones, but copies made before then keep it.
8. Stop the other assistant from running SQL or pushing to `main` until this review is merged.

## Files changed in this review

| File | Change |
|---|---|
| `supabase/migrations/20260923000006_security_incident_remediation.sql` | **new**: removes the unsafe script's effects; profile-insert guard; audit-log fix; out-of-band admin neutralisation |
| `supabase/init_schema_and_admin.sql` | **replaced** with a safe stub (no schema, no accounts) |
| `supabase/complete_setup.sql` | **regenerated** from all migrations; verified on an empty database |
| `supabase/security_verification.sql` | **new**: read-only production verification queries |
| `src/context/AuthContext.tsx` | removed the direct sign-in and sign-up fallbacks, the hardcoded `sanah` role and the metadata-derived profiles |
| `SECURITY_AUDIT.md` | this report |

## Remaining (not fixed in this review; not critical or high once deployed)

- M3 and M4: gallery and camera image storage.
- M5: direct Auth password grant.
- H1: dashboard setting (owner).
- L1: `supabase/.temp` tracked in git.
