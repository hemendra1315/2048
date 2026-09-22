# vault-auth Edge Function

Every sign-in path runs here, on the server. The function returns a normal Supabase Auth session,
so `auth.uid()` is set for every later request and Row Level Security applies.

| Action | Needs session | What the server checks |
| --- | --- | --- |
| `register` | no | username format, password 8–72 bytes, username free; creates the Auth user and profile, returns a one-time recovery key |
| `login` | no | password via Supabase Auth; accounts from before this change are checked against their old hash once, then moved into Supabase Auth |
| `reset` | no | recovery key (bcrypt, or the old SHA-256 format); sets the new password and issues a **new** recovery key |
| `webauthn-register-options` / `-verify` | yes | server challenge (single use, 2 min), origin, RP ID, user-verified flag, credential id; stores the public key |
| `webauthn-login-options` / `-verify` | no | server challenge, origin, RP ID, user-verified flag, **signature with the stored public key**, signature counter |

## Brute-force limits

Counted in `public.auth_throttle`. Each lock doubles on repeat (15 min → 30 min → 1 h …, capped at 24 h). A success clears the account's counter.

| Bucket | Limit | Lock |
| --- | --- | --- |
| Wrong password, per account | 5 in 15 min | 15 min |
| Wrong recovery key, per account | 5 in 1 h | 1 h |
| Failed fingerprint assertion, per account | 10 in 15 min | 15 min |
| Any failed sign-in, per client IP | 30 in 15 min | 15 min |
| Sign-ups, per client IP | 10 in 1 h | 1 h |
| Wrong vault unlock password, per user (SQL `verify_vault_unlock`) | 5 in 15 min | 15 min |

Locked requests get HTTP 429 with a `Retry-After` header.

## Deploy

1. Apply the migrations: `npx supabase db push`
2. Set secrets (the origin list must include every URL the app is served from):

   ```bash
   npx supabase secrets set WEBAUTHN_ALLOWED_ORIGINS=https://serene-brahmagupta.vercel.app,http://localhost:5173
   # optional: WEBAUTHN_RP_ID (defaults to the origin's hostname), WEBAUTHN_RP_NAME, VAULT_ACCOUNT_EMAIL_DOMAIN
   ```

3. Deploy the function (it checks the bearer token itself for enrollment; login must work without one):

   ```bash
   npx supabase functions deploy vault-auth --no-verify-jwt
   ```

4. In the Supabase dashboard, under **Authentication → Sign In / Providers**, turn off
   **Allow new users to sign up**. Accounts are created only by this function (with the service role),
   so the public `signUp` endpoint is not needed.

Accounts are stored in Supabase Auth as `<user id>@users.arcade-vault.invalid`. These addresses never
receive email; the domain only has to be syntactically valid.
