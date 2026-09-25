# Untracked live schema (drift reference)

This document exists because a `supabase db advisors` pass on the live project
(`dddsplxihciighvmaqqt`) turned up tables, functions, and RLS policies that do
not appear anywhere in `supabase/migrations/`. They were built directly
against the live database and never committed. This file is a point-in-time
snapshot (captured 2026-09-24, via the Dashboard SQL Editor since Docker
wasn't available locally for `supabase db dump`/`db diff`) so the drift is at
least tracked in git, even though it isn't yet expressed as real migrations.

**Nothing in this file has been applied anywhere. It's a reference, not a
migration.** Treat it as the starting point for either (a) writing proper
migration files that reconstruct this schema, or (b) pulling a full
`supabase db dump` once Docker is available and replacing this file with the
real thing.

## What this reveals

The live backend has fully-implemented, RLS-protected support for features
with **no corresponding frontend code in this repo**:

- Message reactions
- Disappearing messages (with an archive table for audit/undo)
- Message edit and delete-for-everyone (15-minute window), with reply-to
- Online/offline presence, with per-user read-receipt and presence-sharing toggles
- Push notifications (FCM), including a "disguised" notification payload that
  shows a fake "🎮 Daily puzzle ready" alert instead of leaking a message preview
- A tic-tac-toe game playable inline inside a chat thread
- Pinned chats (max 3) and per-chat themes
- A user reporting/moderation queue, with severity levels and an admin resolution flow
- Admin notes on user accounts
- Client-side crash reporting (a real backend companion to the app's crash screen)
- A second, complete WebAuthn implementation (credentials + challenges) -
  separate from the `biometric_enabled` flag flow the frontend currently uses
- Blocking is enforced at the trigger level for messages, reactions, and game
  moves, not just in application code

## Untracked tables

| Table | Purpose (inferred) |
|---|---|
| `admin_user_notes` | Free-text admin notes on a user account |
| `auth_throttle` | Login/unlock rate-limiting (failures, lockouts) - tracked in this repo's migrations already, columns match |
| `chat_games` | In-chat tic-tac-toe game state |
| `client_crash_reports` | Client-submitted crash reports |
| `contact_notification_preferences` | Per-contact notification mode (default/silent/custom), custom phrase and sound |
| `conversation_members.is_typing` / `.typing_updated_at` / `.pinned_at` / `.chat_theme` | Extra columns beyond what this repo's `conversation_members` migration defines |
| `conversations.disappear_after_seconds` | Extra column beyond what this repo's `conversations` migration defines |
| `disappearing_message_archive` | Archived content of disappearing/deleted messages |
| `message_reactions` | Emoji reactions keyed by (message_id, user_id) |
| `messages.client_id` / `.reply_to_id` / `.edited_at` / `.deleted_at` / `.expires_at` | Extra columns beyond what this repo's `messages` migration defines |
| `push_subscriptions` | FCM push tokens per user/device |
| `user_presence` | Online/offline + sharing preferences |
| `user_reports` | Moderation reports filed by users against other users |
| `webauthn_challenges` / `webauthn_credentials` | A full WebAuthn ceremony implementation |

Full column listing (from `information_schema.columns`, `public` schema):

```
account_secrets: user_id uuid NOT NULL, legacy_password_hash text, legacy_pin_hash text,
  recovery_code_hash text, unlock_password_hash text, auth_migrated_at timestamptz, updated_at timestamptz NOT NULL default now()

admin_access_log: id uuid NOT NULL default gen_random_uuid(), admin_id uuid, action_type text NOT NULL,
  target_user_id uuid, target_resource_id text, metadata jsonb NOT NULL default '{}', ip_address text,
  user_agent text, created_at timestamptz NOT NULL default now()

admin_user_notes: id uuid NOT NULL default gen_random_uuid(), user_id uuid NOT NULL, admin_id uuid default auth.uid(),
  category text NOT NULL default 'general', note text NOT NULL, created_at timestamptz NOT NULL default now()

auth_throttle: bucket text NOT NULL, failures integer NOT NULL default 0, window_started_at timestamptz NOT NULL default now(),
  lockouts integer NOT NULL default 0, locked_until timestamptz, updated_at timestamptz NOT NULL default now()

chat_games: id uuid NOT NULL default gen_random_uuid(), conversation_id uuid NOT NULL, game_type text NOT NULL default 'tictactoe',
  player_x uuid NOT NULL, player_o uuid NOT NULL, board text NOT NULL default '.........', turn uuid,
  status text NOT NULL default 'active', winner uuid, is_draw boolean NOT NULL default false,
  created_at timestamptz NOT NULL default now(), updated_at timestamptz NOT NULL default now()

client_crash_reports: id bigint NOT NULL, user_id uuid NOT NULL default auth.uid(), client_report_id text NOT NULL,
  component text, message text NOT NULL, stack text, platform text NOT NULL, app_path text,
  occurred_at timestamptz NOT NULL, received_at timestamptz NOT NULL default now()

contact_notification_preferences: id uuid NOT NULL default gen_random_uuid(), owner_id uuid NOT NULL, contact_id uuid NOT NULL,
  notification_mode text NOT NULL default 'default', custom_phrase text, custom_sound text,
  created_at timestamptz NOT NULL default now(), updated_at timestamptz NOT NULL default now()

conversation_members (extra columns beyond this repo's migration): is_typing boolean NOT NULL default false,
  typing_updated_at timestamptz NOT NULL default now(), pinned_at timestamptz, chat_theme text NOT NULL default 'default'

conversations (extra column): disappear_after_seconds integer

disappearing_message_archive: id uuid NOT NULL default gen_random_uuid(), message_id uuid NOT NULL, conversation_id uuid,
  sender_id uuid, content text NOT NULL, sent_at timestamptz NOT NULL, expires_at timestamptz,
  deleted_at timestamptz NOT NULL default now(), deleted_by uuid, how text NOT NULL

message_reactions: message_id uuid NOT NULL, user_id uuid NOT NULL, emoji text NOT NULL, created_at timestamptz NOT NULL default now()

messages (extra columns beyond this repo's migration): client_id text, reply_to_id uuid, edited_at timestamptz,
  deleted_at timestamptz, expires_at timestamptz

push_subscriptions: id uuid NOT NULL default gen_random_uuid(), user_id uuid NOT NULL, fcm_token text NOT NULL,
  device_info text, created_at timestamptz NOT NULL default now(), updated_at timestamptz NOT NULL default now(),
  device_platform text NOT NULL default 'android', device_id text

user_presence: user_id uuid NOT NULL, share_presence boolean NOT NULL default true, is_online boolean NOT NULL default false,
  last_seen_at timestamptz, share_read_receipts boolean NOT NULL default true

user_reports: id uuid NOT NULL default gen_random_uuid(), reporter_id uuid, reported_user_id uuid NOT NULL,
  conversation_id uuid, message_id uuid, message_snapshot text, category text NOT NULL, severity text NOT NULL,
  status text NOT NULL default 'pending', reason text NOT NULL default '', resolution_notes text, handled_by uuid,
  created_at timestamptz NOT NULL default now(), updated_at timestamptz NOT NULL default now()

webauthn_challenges: challenge text NOT NULL, purpose text NOT NULL, user_id uuid, rp_id text NOT NULL, origin text NOT NULL,
  expires_at timestamptz NOT NULL, consumed_at timestamptz, created_at timestamptz NOT NULL default now()

webauthn_credentials: id text NOT NULL, user_id uuid NOT NULL, public_key_spki text NOT NULL, algorithm integer NOT NULL,
  sign_count bigint NOT NULL default 0, rp_id text NOT NULL, created_at timestamptz NOT NULL default now(), last_used_at timestamptz
```

Note: primary keys, foreign keys (beyond the fkey names the advisor output
named in passing), check constraints, and indexes for these tables are
**not** captured above - `information_schema.columns` doesn't carry them.
A real `supabase db dump` is needed to get those exactly right before writing
migrations from this.

## Untracked functions

All `SECURITY DEFINER` unless noted, with `search_path` already pinned on
every one of them (the live schema is *not* missing this hardening - only
`generate_unique_uid` and `set_updated_at_timestamp` were, which
`20260925000001_advisor_remediation.sql` and this file respectively now cover).

- `_unlock_password_matches`, `auth_after_password_reset`, `auth_check_legacy_password`,
  `auth_check_recovery_code`, `auth_get_profile`, `auth_mark_migrated`, `auth_provision_profile`,
  `auth_resolve_account`, `auth_touch_login`, `throttle_clear`, `throttle_fail`, `throttle_locked_until`
  - Auth/password/recovery-code machinery. Overlaps with, but is more complete than, this repo's
    `20260923000001_frictionless_auth.sql` / `20260923000002_password_auth.sql` / `20260923000003_session_auth_hardening.sql`.
- `claim_push_token`, `release_push_token` - push token lifecycle
- `delete_message_for_everyone`, `edit_message` - message mutation (15-min window)
- `get_chat_list`, `mark_conversation_read`, `set_chat_pinned`, `set_chat_theme`, `set_disappearing_messages` - chat list/settings
- `get_presence`, `presence_heartbeat`, `presence_offline`, `set_presence_sharing`, `set_read_receipts` - presence/receipts
- `set_reaction` - message reactions
- `start_chat_game`, `play_chat_game_move` - in-chat tic-tac-toe
- `get_block_status`, `is_blocked_between`, `guard_blocked_game_move`, `guard_blocked_reaction`,
  `guard_blocked_timer_change`, `guard_message_insert` - blocking enforcement (mostly trigger functions)
- `submit_report`, `admin_update_report` - user reports/moderation
- `get_disguised_notification_payload`, `handle_new_message_push` - push notification content + delivery
  (calls `net.http_post` to a URL/secret stored in Supabase Vault; no-ops if unconfigured)
- `archive_disappearing_message`, `archive_before_message_delete` - disappearing-message archival
- `webauthn_create_challenge`, `webauthn_consume_challenge`, `webauthn_save_credential`,
  `webauthn_get_credential`, `webauthn_list_credentials`, `webauthn_touch_credential` - WebAuthn ceremony
- `grant_super_admin`, `revoke_super_admin` - console-run admin role management (this repo has
  `grant_super_admin` referenced in `SECURITY_REMEDIATION_REPORT.md` but not as a committed migration)
- `guard_connection_request`, `guard_conversation_member`, `guard_profile_update` - extra guard triggers
  beyond what this repo's migrations define for these tables
- `set_updated_at_timestamp` - generic `updated_at` trigger helper (flagged by the advisor for a
  missing `search_path`; not fixed here since I've only now seen its body)

Full `pg_get_functiondef()` output for every one of these was captured in this
session's transcript (2026-09-24) but is too large to duplicate here - see
the chat history, or re-run this against the live project to get it fresh:

```sql
select pg_get_functiondef(p.oid) || ';' as def
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;
```

## Untracked / duplicate RLS policies

Two things showed up here:

1. **Genuinely untracked policies** on the untracked tables above (e.g.
   `chat_games_select_members`, `reactions_select_members`,
   `presence_select_own`, `user_reports_admin_select`,
   `crash_reports_insert_own`/`crash_reports_select_admin`,
   `admin_notes_select`/`admin_notes_insert`/`admin_notes_delete`,
   `disappearing_archive_admin_select`, `webauthn_credentials_own_select`/`_own_delete`,
   the `chat-media` storage bucket policies, and a second push_subscriptions/
   contact_notification_preferences policy pair scoped `TO public` instead of
   `TO authenticated`).

2. **True duplicates** of policies this repo already defines, confirmed
   identical now that both versions have been read side by side:
   - `conversations_select` duplicates `conversations_select_policy`
   - `messages_select` duplicates `messages_select_policy`
   - `messages_insert` is *not* identical to `messages_insert_policy` - the
     `_policy` version additionally blocks non-active accounts from sending
   - `gallery_select` duplicates `gallery_select_policy`
   - `gallery_delete` duplicates `gallery_delete_policy`
   - `gallery_insert` is *not* identical - `_policy` additionally blocks
     non-active accounts
   - `profiles_select` was *not* identical - it was much broader (any active
     profile visible to anyone) vs. `profiles_select_policy`'s
     connections/requests-scoped visibility. **Resolved** in
     `20260925000002_profiles_visibility_alignment.sql`: the permissive
     behavior was kept (this repo's own "Add a friend" UID lookup requires
     it - a stranger's profile has to be visible before any connection
     exists) and made the one tracked policy, dropping the untracked
     duplicate. `profiles` carries no sensitive columns (no email, no
     password/PIN hashes - those are in `account_secrets`), so broad
     lookup-by-UID is a low-risk, intentional choice for this app, not an
     oversight.
   - `admin_log_select` duplicates `admin_log_select_policy`
   - `admin_log_insert` is *not* identical - `_policy` additionally requires
     `admin_id = auth.uid()`

   The genuine duplicates (`conversations_select`, `messages_select`,
   `gallery_select`, `gallery_delete`, `admin_log_select`) are safe to drop in
   a follow-up migration - same logic, just redundant.

## Feature frontend status

Reactions, edit/delete-for-everyone/reply, pinned chats + the unified
`get_chat_list()`, and presence now have frontend (see the git history for
the commit that added them). In-chat tic-tac-toe, per-contact notification
preferences, the user-report/moderation queue, and admin notes on accounts
are being built next. Push notifications remain deliberately unbuilt - they
need a Firebase project (VAPID keys, service account) not available in this
environment.

## Suggested next steps (not done here)

1. Get a real `supabase db dump`/`db diff` once Docker Desktop is available,
   to replace this hand-assembled reference with an exact one (constraints,
   indexes, defaults this file couldn't capture).
2. Drop the confirmed-identical duplicate policies listed above.
