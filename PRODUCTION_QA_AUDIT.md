# Production QA, Security and UX Audit: serene-brahmagupta.vercel.app

**Date:** 23 Sep 2026 · **Build:** `index-BDtd8Mxu.js` · **Backend:** Supabase `dddsplxihciighvmaqqt` · **Method:** live browser testing in Chrome, read-only API probes as `anon` and as the signed-in session, plus source review of commit `6149a45`

---

## 1. Executive summary

The backend is in much better shape than on 22 Sep. Production now points at `dddsplxihciighvmaqqt`, and all 8 migrations appear to be applied. Anonymous access is denied on every table and every sensitive RPC. The old client-trusting RPCs are gone, and `account_secrets`, `auth_throttle` and `webauthn_*` are closed even to signed-in users.

The app still isn't ready to launch. Five problems stand out:

1. **Real-time messaging, connections and gallery updates can't work in production.** No table is added to the `supabase_realtime` publication, so every `postgres_changes` subscription receives nothing. New DMs and requests only show up after a manual reload.
2. **Read receipts are broken.** `messages` has no UPDATE policy, so the client's `is_read = true` update changes 0 rows without reporting an error.
3. **Gallery uploads save a public URL for a private bucket,** so images won't render (`UploadModal.tsx:63`).
4. **The audit log can be forged by any super admin** (`admin_id` isn't tied to the caller). There is also a super admin, `gopika`, whose promotion has no audit record, and the incident-remediated account `sanah` was un-banned.
5. **The disguise gives itself away.** The cover screen says "Cover Launcher", "Hold title 1s to authenticate", "Interactive Cover Simulation" and "App customization saved".

**Coverage limit:** I didn't enter your vault password and I didn't create accounts, because both are outside what I'm allowed to do. Section 7 lists what that left untested. It includes every in-vault screen: DMs, connections, gallery, profile, camera and the Super Admin hub UI. On top of that, the production database has only 2 profiles and 0 connections, conversations, messages or gallery items, so none of the social flows can be exercised yet even with a sign-in.

| Score | Value | Why |
|---|---|---|
| **Security** | **6 / 10** | RLS and the auth design are solid. The audit log can be forged, one privilege grant has no audit record, security headers are missing, public sign-up is enabled, and the vault gate is enforced only on the client |
| **Production readiness** | **3.5 / 10** | Real-time updates, read receipts and gallery images are broken on the production path, and the core social flows are unverified with no data |
| **UX** | **6 / 10** | Polished visuals and good mobile layouts. The disguise leaks, two of six games are fake, and there are modal and accessibility gaps |

**Recommendation: NO-GO for a public launch.** It's fine for a closed internal alpha once the must-fix items in section 8 are done and the untested flows in section 7 pass.

---

## 2. Test environment and evidence

| Item | Result |
|---|---|
| Supabase URL in the bundle | only `https://dddsplxihciighvmaqqt.supabase.co` (no `service_role` string, no source map) |
| Bundle size | 615 KB, one JS chunk |
| Load (desktop, warm) | TTFB 114 ms · DOMContentLoaded 1.28 s · load 1.39 s |
| Console errors on load and play | none |
| Network on load | 200 on everything. As the signed-in user: `profiles?id=eq.<self>` 200, `user_preferences?user_id=eq.<self>` 200 |
| Deep links | `/admin` returns 404 and unknown paths return 404 (no SPA rewrite; fine while the app has no routes) |

Screenshots (in `Claude outputs/qa-audit/`):

- `01-cover-2048-desktop.jpg`
- `02-games-modal-bleedthrough.jpg`
- `03-customization-toast-on-cover.jpg`
- `04-security-gate.jpg`
- `05-mobile-390-360-320.jpg`
- `06-mobile-modals.jpg`
- `07-tablet-768.jpg`

### Security probes run (read-only)

| Probe | Result |
|---|---|
| `anon` SELECT on 15 tables (profiles, account_secrets, messages, gallery_items, admin_access_log, …) | all **401 / 42501** ✅ |
| `anon` RPC `grant_super_admin`, `admin_set_user_status`, `log_admin_action`, `verify_vault_unlock`, `update_my_profile` | all **401 permission denied** ✅ |
| Old RPCs `login_frictionless_user`, `biometric_login_user`, `reset_user_pin`, `handle_new_user` | **404, removed** ✅ |
| Storage listing on `gallery` and `avatars` as anon | 200 with an empty list (no objects exposed) ✅ |
| `vault-auth` Edge Function | deployed; an unknown action returns `400 unknown_action` ✅ |
| Signed-in user reading `account_secrets` / `auth_throttle` | **403** ✅ |
| Signed-in super admin inserting `admin_access_log` with a different `admin_id` | the request **passed RLS** and failed only on the foreign key (409 / 23503) ❌ (see S1) |
| `/auth/v1/settings` | `disable_signup=false`, email provider on ⚠️ |
| HTTP security headers | HSTS present. **No CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy or Permissions-Policy** ⚠️ |

---

## 3. Security findings

### S1 · HIGH: any super admin can write audit entries attributed to someone else

- **Evidence:** as super admin `gopika`, a POST to `/rest/v1/admin_access_log` with `admin_id=00000000-…-0001` got through RLS and failed only on the FK check (`409 23503 Key is not present in table "profiles"`). PostgreSQL checks RLS WITH CHECK before foreign keys, so a valid profile id would have been accepted. (I didn't try that, to avoid writing a fake row into your append-only log.)
- **Cause:** migration `…0005` creates `admin_access_log_insert_policy WITH CHECK (is_super_admin())`. Either `…0006` (which drops it) ran before `…0005`, or `…0005` was re-run afterwards. RLS policies are OR-combined, so the looser policy wins.
- **Expected:** `admin_id = auth.uid()` is enforced.
- **Fix:** run `DROP POLICY IF EXISTS "admin_access_log_insert_policy" ON public.admin_access_log;` and delete lines 10–14 from `…0005` so a re-run can't bring the policy back. Better still, remove direct INSERT entirely (`REVOKE INSERT … FROM authenticated`) and log only through `log_admin_action`, which already sets `admin_id := auth.uid()`.

### S2 · HIGH: super admin `gopika` has no audit record of being granted

- **Evidence:** `admin_access_log` has 3 rows: `REVOKE_SUPER_ADMIN` (migration 6, for `sanah`), `VIEW_USER_PROFILE` and `UNBAN_USER` (both by `gopika`). There is no `GRANT_SUPER_ADMIN` row. `gopika` (NEXUS-1255) was created on 23 Sep, after migration 6.
- **Meaning:** the role was set outside `grant_super_admin()`, probably with a direct SQL UPDATE in the dashboard. That may well have been you, but the system can't tell a legitimate admin from an attacker's.
- **Fix:** confirm `gopika` is intended. Then re-grant through the approved path so it's audited: `select public.revoke_super_admin('gopika'); select public.grant_super_admin('gopika', null);`. Add a trigger that writes an audit row whenever `profiles.role` changes, whoever changes it.

### S3 · MEDIUM: the remediated account `sanah` was reactivated

- **Evidence:** `UNBAN_USER` on `d8dde55b` (`sanah`) by `gopika` at 00:03. That profile now shows `user / active`.
- **Risk:** this is the account from the unsafe bootstrap script. Migration 6 randomised its password, so the leaked password should no longer work. It still has no approved-flow history.
- **Fix:** keep it suspended, or delete it. If it's a real person's account, have them re-register through the app.

### S4 · MEDIUM: the vault lock is enforced only on the client

- **Evidence:** the Supabase access token sits in `localStorage` (`sb-dddsplxihciighvmaqqt-auth-token`) while the app shows the locked cover screen. With it I could read the user's own profile, preferences and admin data directly from devtools without the vault password.
- **Risk:** for a stealth vault, the main threat is someone else holding the unlocked phone. The password gate stops casual taps but not a browser console or a synced browser profile.
- **Fix, choose one:**
  - (a) Sign out on lock and re-issue the session only after `vault-auth` verifies the password.
  - (b) Keep a short-lived "unlocked" claim (for example, a 10-minute JWT issued by `vault-auth`) and require it in RLS for messages and gallery.
  - (c) At minimum, use `sessionStorage` and a short refresh lifetime.

### S5 · MEDIUM: public email sign-up is enabled on Supabase Auth

- `disable_signup=false`. Accounts made this way get no profile (the INSERT guard blocks it), so they can't do anything, but they can fill `auth.users` with junk and use up email quota.
- **Fix:** Dashboard → Authentication → Sign In / Providers → turn off "Allow new users to sign up". `vault-auth` uses the admin API and isn't affected.

### S6 · MEDIUM: security headers are missing

- There's no `Content-Security-Policy` (important because the app renders user content and base64 images), no `X-Frame-Options` / `frame-ancestors` (clickjacking of the unlock prompt), no `X-Content-Type-Options`, no `Referrer-Policy` and no `Permissions-Policy` (camera and microphone are in use).
- **Fix:** add a `headers` block to `vercel.json`. Start with `default-src 'self'; connect-src 'self' https://dddsplxihciighvmaqqt.supabase.co wss://dddsplxihciighvmaqqt.supabase.co; img-src 'self' data: blob: https://*.supabase.co https://api.dicebear.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-ancestors 'none'`.

### S7 · LOW: demo data is written to production localStorage

- **Evidence:** 8 `vault_mock_*` keys, including demo profiles (`admin: super_admin`) and unsalted SHA-256 `unlock_secret_hash` values. `mockBackend` runs `seedDefaultsIfEmpty()` in its constructor even though the production code paths never use it.
- **Risk:** little direct risk, but it's confusing, and any code that falls back to the mock would see a fake `super_admin`.
- **Fix:** create the mock instance lazily behind `isMockBackendAllowed()`. Clear `vault_mock_*` keys on boot in production.

### S8 · LOW: `user-scalable=no, maximum-scale=1.0` in the viewport meta

This is an accessibility failure (WCAG 1.4.4). Remove both.

---

## 4. Functional bugs

| # | Sev | Area | Repro | Expected | Actual | Fix |
|---|---|---|---|---|---|---|
| B1 | **Critical** | Realtime (DMs, connections, gallery, conversation list) | User A sends a DM or request to user B while B has the app open | B sees it at once | B sees nothing until reload. No migration runs `ALTER PUBLICATION supabase_realtime ADD TABLE …`, so the `postgres_changes` channels in `ChatRoom`, `MessagesView`, `ConnectionsView` and `GalleryView` never fire | New migration: `alter publication supabase_realtime add table public.messages, public.conversations, public.connections, public.connection_requests, public.gallery_items;` (RLS still filters what each client receives) |
| B2 | **High** | Read receipts | Open a conversation with unread messages | Messages marked read | `ChatRoom.tsx:65` runs `update messages set is_read=true`. `messages` has only SELECT, INSERT and DELETE policies, so 0 rows change and no error is shown | Add a `mark_conversation_read(conversation_id)` SECURITY DEFINER RPC that sets only `is_read` for messages where the caller is a member and not the sender. Don't add a broad UPDATE policy (it would let people edit message content) |
| B3 | **High** | Gallery upload | Upload a photo in Gallery | Thumbnail shows | `UploadModal.tsx:63` stores `getPublicUrl()` for the **private** `gallery` bucket, so the image is broken for everyone | Store only `storage_path`. Render with `createSignedUrl(path, 300)` as `adminApi.ts` already does |
| B4 | **High** | Camera / chat attachments | Capture a photo or send an attachment | Stored in Storage | `ChatRoom.tsx:207/251` and the camera use `readAsDataURL` and put base64 into DB rows (often more than 1 MB), which bloats `messages` and realtime payloads | Upload to Storage and send a reference |
| B5 | Medium | Cover game | Select Sudoku, Minesweeper or another non-playable game and tap "Tap to Play" | A game | Each tap just adds random points to the score. The panel says "Engine Mode: Interactive Cover Simulation" | Hide non-playable games or finish them. Remove the label |
| B6 | Medium | Cover game switch | Pick a game in the Games modal | Game switches without drawing attention | A toast says **"App customization saved"**, and each switch PATCHes `user_preferences` | Switch without a toast on the cover screen. Save quietly |
| B7 | Medium | Games modal | Open Games on the 2048 cover | Opaque dialog | 2048 tiles show through the dialog list (`02-…jpg`, `06-…jpg`) | Add a solid backdrop (`bg-black/80`) and give the dialog a higher z-index than the board |
| B8 | Low | Security gate | Open the gate and press Escape, or submit empty | Esc closes. Empty submit shows "Enter your password" | Esc does nothing. Empty submit only recolours the button with no message | Handle Esc, add inline validation, and move focus into the dialog |
| B9 | Low | Toast | Change game, then click the header icons within ~3 s | Header buttons clickable | The toast covers the shield and sound buttons | Move toasts to the bottom on the cover screen, or make them non-blocking |
| B10 | Low | 2048 score | Play 2048, switch to a stub game and back | Scores separate per game | "Best" carried stub-game points (24) while on the stub, then reverted | Store best score per game key |

---

## 5. UX, layout and accessibility

**Mobile (390, 360, 320) is good.** There's no horizontal overflow, controls fit, and the on-screen D-pad appears on touch widths (`05-…jpg`). At 320×568 the page scrolls about 25 px vertically; making the board slightly smaller would stop that.

**Tablet (768) works but wastes space.** It keeps the phone column, and there's a large empty band between the header and the board (`07-…jpg`).

**The disguise gives the app away.** "v2.4 Cover Launcher", "Hold title 1s to authenticate", the shield icon labelled "Access Security Gate", the success toast and the "Cover Simulation" label all tell an onlooker that this is a vault. For a stealth product, that is the most important UX defect. Use neutral copy ("v2.4", no hint) and a neutral icon.

**"Offline Ready" is false.** No service worker is registered and there's no manifest.

**Accessibility:**

- Icon buttons use `title` without `aria-label` (the dialog close and Unlock buttons have no accessible name at all).
- The dialogs have no `role="dialog"` / `aria-modal` and no focus trap. Background buttons stay reachable by Tab.
- Pinch-zoom is disabled (S8).

---

## 6. Performance

- 615 KB single JS bundle (159 KB gzipped, measured). The whole social app, admin hub and six games load before the cover screen is shown. Code-split the vault, admin and each game with `React.lazy`, so the cover loads about 150 KB.
- Google Fonts is render-blocking. Self-host the fonts or add `preconnect` / `font-display: swap` (swap is already set).
- There's no caching strategy for `/assets/*`. Vercel's defaults are fine, but add `Cache-Control: immutable` for the hashed assets.

---

## 7. Not tested, and why

| Area | Blocker | How to finish it |
|---|---|---|
| Sign-up, login, logout, password change or reset, UID flows | Would need me to create accounts or type passwords, which I'm not allowed to do | You create two test accounts (A and B) in the app. I can then drive every screen in your Chrome tab while you're signed in |
| Vault screens: profile edit, avatar upload, search, requests, accept or reject, DMs, delete, blocking, reporting, notifications, gallery | The vault password is required, and the DB has 0 connections, messages and gallery items | Unlock the vault in the tab and tell me. With A and B signed in on two browser profiles I can test every cross-user flow and IDOR case |
| Super Admin hub UI (5 tabs, ban, gallery delete, conversation view) | Same | Same (sign in as `gopika`) |
| Brute-force throttling live | Would need me to submit guesses against your live endpoint | Already covered by 59 handler tests. You can verify by entering a wrong password 6 times |
| Dark mode | The app has only a dark theme (`theme_preference` exists but no light UI was found) | n/a |

---

## 8. Must fix before launch

1. **B1:** add the tables to `supabase_realtime`.
2. **B2:** add a `mark_conversation_read` RPC.
3. **B3 / B4:** use signed URLs for the gallery, and put camera and attachment media in Storage instead of base64.
4. **S1:** drop `admin_access_log_insert_policy` and fix migration 5.
5. **S2 / S3:** confirm `gopika`, re-grant through `grant_super_admin()`, re-suspend `sanah`, and add a trigger that audits role changes.
6. **S4:** decide how locking affects the session (sign out on lock, or require an unlock claim).
7. **S5 / S6:** turn off public sign-up and add security headers.
8. Remove the disguise leaks (B5, B6 and the cover copy).
9. Run the section 7 test pass with two real test accounts.

## 9. Nice to have

- Code-split the bundle.
- Lazy-create the mock backend and clear `vault_mock_*` keys.
- Add a real service worker or remove "Offline Ready".
- Fix dialog accessibility (Esc, focus trap, aria labels) and re-enable zoom.
- Use a wider layout on tablet and store best scores per game.
- Add error monitoring (for example, Sentry). The 38 `console.error` calls are currently the only error reporting.

## 10. Verification SQL for the findings (read-only)

```sql
-- S1: expect only admin_log_insert_policy with (is_super_admin() AND admin_id = auth.uid())
select policyname, with_check from pg_policies where tablename = 'admin_access_log' and cmd = 'INSERT';
-- B1: expect the 5 tables listed
select tablename from pg_publication_tables where pubname = 'supabase_realtime';
-- B2: expect no broad UPDATE policy on messages
select policyname, cmd from pg_policies where tablename = 'messages';
-- S2/S3
select p.username, p.role, p.status, exists(select 1 from account_secrets s where s.user_id = p.id) has_secrets
from profiles p order by created_at;
```
