# Instagram-style DMs + Google Photos-style Gallery — Redesign Report

## 1. Objective

Elevate the app's two primary experiences — private DMs and the private media
vault (Gallery) — toward the interaction quality of modern Instagram Direct
Messages and Google Photos, respectively, **without** adding any public social
features (no feed, Stories, Explore, followers, or public activity). The
product remains a private 1:1 encrypted vault messenger with the same four
destinations: Chats, Gallery, Camera, Profile.

## 2. Pre-Implementation Audit

Before writing any code, three parallel audits mapped the actual current
implementation (not assumptions):

- **DM/chat architecture** — inbox (`MessagesView.tsx`), chat screen and
  bubbles (`ChatRoom.tsx`), reactions/reply/edit/delete (`MessageActionSheet`),
  voice notes (`chatExtras.ts` waveform/playback), and confirmed there is
  **no** `message_requests`, in-thread pin, or forward mechanism anywhere in
  the schema or client.
- **View Once security model** — schema, RLS, storage policy, and the claim
  RPC. This produced the single most important finding of the whole pass (see
  §4).
- **Gallery architecture** — grid/density/filters/scrubber/multi-select
  (`GalleryView.tsx`), lightbox (`LightboxViewer.tsx`), storage helpers
  (`storageHelper.ts`, `mediaUrls.ts`), and confirmed there was **no** albums
  table, no soft-delete/Trash, no favorites, and no user-facing search —
  `performUniversalSearch` in `safetyApi.ts` is admin-only oversight tooling,
  not a feature available to the vault's own owner.

## 3. Critical Finding: View Once Was Not Live in Production

The migration file `supabase/migrations/20260926000001_view_once_media.sql`
(already present in the repo) describes `is_view_once`/`view_once_opened_at`
columns and a `claim_view_once_media()` RPC. Checking the **live** database
(`list_migrations`, `information_schema.columns`, `pg_proc`) before writing
any new SQL showed that migration was **never applied** — those columns and
that function did not exist in production. A real user tapping "View Once"
before this pass would get a `network_error` toast and could never open the
media (fails closed, not open — not a data leak, but a fully broken feature).

This means Stage 2 below is the **first time** ephemeral media becomes
functional in production, not an upgrade of a working feature. The new
migration was written directly against the live `guard_message_insert()` body
(read via `pg_get_functiondef` immediately before writing), not the stale file.

## 4. DM Changes

**Inbox** (`src/components/messages/MessagesView.tsx`):
- Added **Mute** and **Delete** (hide-for-me-only, reappears if the other
  person messages again) via a new swipe gesture on each conversation row,
  reusing the same touch-tracking approach as message swipe-to-reply.
- Added **Mark as unread** and extended the long-press "chat options" sheet
  with Mute/Unmute, Mark as unread, and Delete alongside the existing Pin.
- Backend: new migration `20260927000001_conversation_mute_hide_unread.sql` —
  `muted_at`/`hidden_at` columns on `conversation_members` (same per-member
  pattern as the existing `pinned_at`), `set_chat_muted`, `set_chat_hidden`,
  and `mark_conversation_unread` RPCs, and `get_chat_list()` updated to expose
  `muted_at` and skip hidden threads unless a newer message arrived.

**Chat screen** (`src/components/messages/ChatRoom.tsx`):
- **Voice notes**: replaced tap-to-start/tap-to-stop recording with genuine
  **hold-to-record + slide-to-cancel**: pointer-down starts recording,
  dragging left past a threshold cancels with a "Slide to cancel" hint that
  tracks the drag, releasing short of that sends. A race condition (releasing
  before mic permission resolves) is handled explicitly so no phantom
  recording is left running.
- Existing bubble grouping, reactions, reply, and the `MessageActionSheet`
  actions were left untouched — the earlier pass this session already
  confirmed these meet the bar.

**Not built** (per the plan's own conditional language — no backend exists
for these): a Message Requests pending-inbox, in-thread message Forward, and
in-thread message Pin.

## 5. Ephemeral Media: View Once → Three Modes

**Schema** (`supabase/migrations/20260927000002_ephemeral_media_modes.sql`):
- `messages.view_mode` (`view_once` | `allow_replay` | `keep_in_chat`,
  default `keep_in_chat`) and `messages.view_count` (server-authoritative).
- `guard_message_insert()` extended to detect `[IMAGE:ALLOW_REPLAY]` /
  `[VOICE_NOTE:ALLOW_REPLAY:` tags alongside the existing `VIEW_ONCE` ones,
  and to force `view_count := 0` server-side on every insert.
- New `claim_ephemeral_media(p_message_id)` RPC: atomic
  `UPDATE ... WHERE view_count < max_views` (max 1 for `view_once`, 2 for
  `allow_replay`) — the same compare-and-swap pattern the old (never-deployed)
  RPC used, generalized to a configurable cap. `keep_in_chat` media never
  calls this RPC at all — it resolves a signed URL directly, exactly like a
  normal (non-ephemeral) attachment already does today.

**Client**:
- `src/lib/viewOnceApi.ts`: new `claimEphemeralMedia()`; `claimViewOnceMedia`
  kept as an alias for back-compat.
- `src/lib/chatExtras.ts`: added `isAllowReplayContent`/`isEphemeralContent`,
  and extended `parseVoiceNote`/`readableMessagePreview` for the new tag —
  every existing `VIEW_ONCE` behavior is untouched.
- `src/lib/mockBackend.ts`: offline/dev-mode claim logic extended to the same
  view-count model, for parity.
- Composer: the single View-Once toggle was replaced with a compact
  **View Once | Allow Replay | Keep in Chat** picker, directly in the
  composer (not buried in a settings sheet).
- Message bubbles (`ChatMedia.tsx`'s `ViewOnceImageBubble`/`ViewOnceAudioBubble`):
  extended with a `viewMode`/`viewsUsed` prop pair so Allow Replay media shows
  "1/2 viewed", a "replay left" affordance, and a distinct "Replays used"
  exhausted state, instead of View Once's binary "Opened" state.

**Regression protection**:
- `tests/unit/viewOnce.test.mjs` extended with new assertions for
  `ALLOW_REPLAY` tag parsing — every existing assertion is unchanged.
- The new RPC was **manually verified against real database rows** (disposable
  test profiles/conversation, created and fully cleaned up afterward, never
  touching real user data): a `view_once` message could be claimed exactly
  once (second attempt → `already_viewed`); an `allow_replay` message could be
  claimed exactly twice (third attempt → `max_replays_reached`); a non-member
  of the conversation was correctly rejected with `42501`.

## 6. Gallery Changes

**Schema** (`supabase/migrations/20260927000003_gallery_google_photos_schema.sql`):
- `gallery_items` gained `media_type`, `is_favorite`, `deleted_at` (soft-delete),
  and `album_id` (FK to new `gallery_albums` table, RLS owner-scoped).
- `gallery_items` previously had **no UPDATE policy at all** (only
  select/insert/delete) — added one, scoped strictly to the owner (or super
  admin), needed for favorite/restore/soft-delete to work from the client.
- `purge_deleted_gallery_items()`, scheduled via `pg_cron` where available
  (same pattern as the existing expired-messages cleanup), permanently
  removing Trash rows after 30 days — matching the "30 days" copy shown in
  the UI with a real mechanism behind it, not an invented number.

**Grid & organization** (`GalleryView.tsx`):
- Replaced the previous 3-bucket grouping (This Week / This Month / Month-Year)
  with real **two-level day-under-month headers** (month sticky header, then
  a day sub-heading per day using the existing `formatDayHeading` helper).
- Added **Burst stacks**: consecutive photos (photos only, not videos) taken
  within 5 seconds of each other are grouped into a stack tile with a count
  badge and a dedicated stack viewer. This is explicitly a timestamp-only
  grouping, labeled "Burst," not a claim of visual similarity detection — per
  the scope decision made before implementation.
- Added **Favorites** (heart toggle on tiles, in the lightbox, and as a batch
  action) and **Trash** (soft-delete, Restore from the lightbox or in bulk,
  permanent delete only from within Trash, with a visible 30-day notice).
- Added a **Collections** bar: Photos, Favorites, Videos, Screenshots (by
  filename heuristic), Recently Added, Trash.
- Added a real **user-facing search** (caption, date, media type, favorite) —
  distinct from and without touching the existing admin-only
  `performUniversalSearch`.

**Lightbox** (`LightboxViewer.tsx`):
- Added a favorite toggle and a Restore action (shown instead of Delete when
  viewing an item from Trash, where Delete now means permanent).
- Existing zoom/pan/swipe-dismiss/HUD-toggle/metadata sheet were left as-is —
  the earlier audit found these already solid.

**Deferred, not built this pass** (documented honestly rather than rushed):
- **Albums UI.** The schema (`gallery_albums` table, `album_id` column, RLS)
  is live, but no create/rename/assign UI was built — there wasn't enough
  remaining scope in this pass to do it properly.
- **Grid virtualization** (`@tanstack/react-virtual` or similar). Not added.
  The grid still renders every item as a real DOM node; this is fine at the
  library sizes likely in a private vault app but would need addressing for
  very large libraries.
- **Lightbox swipe-between-media / filmstrip.** Not added — the lightbox
  still opens exactly one item at a time (from the grid or from inside a
  Burst stack), with no next/prev gesture between them yet.
- **Known limitation**: `purge_deleted_gallery_items()` only deletes the
  database row — Postgres cannot call Supabase Storage directly, so the
  underlying file for a purged item is not automatically removed from
  storage. A future Edge Function on a schedule (or extending the purge
  function via `pg_net`) would be needed to close this gap.

## 7. Security Regression Check

- `get_advisors(type: security)` run immediately after both new migrations:
  no new RLS-gap or policy-drift findings attributable to this pass. Every
  `authenticated`-callable `SECURITY DEFINER` RPC flagged is the same
  intentional pattern already used by every other RPC in this codebase (each
  does its own internal `auth.uid()`/membership check).
- Storage RLS for `chat-media` (from `20260924000013_private_media_and_blocking.sql`)
  was not touched.
- Android `FLAG_SECURE` (`MainActivity.java:31`) was not touched.
- The ephemeral-media claim path was traced end-to-end: `resolveChatMediaUrl`
  is only ever called after a successful `claimEphemeralMedia` response for
  `view_once`/`allow_replay` media; `keep_in_chat` media uses the same direct
  resolution path as any ordinary attachment, which was already the case for
  non-ephemeral media before this pass.

## 8. Verification

| Check | Command | Result |
|---|---|---|
| TypeScript (project mode) | `npx tsc -b` (also run via `npm run build`) | **PASS** |
| ESLint | `npm run lint` | **PASS** — 0 warnings, 0 errors |
| Unit tests | `npm test` | **PASS** — smoke tests + 5 suites, including the extended `viewOnce.test.mjs` |
| Vite build | `npm run build` | **PASS** (after one real fix — see below) |
| Capacitor sync | `npx cap sync android` | **PASS** |
| Android debug build | `cd android && .\gradlew.bat assembleDebug` | **PASS** — `BUILD SUCCESSFUL` |
| ADB device detection | `adb devices` | **PASS** — `00256664J000395` |
| APK installation | `adb install -r app-debug.apk` | **PASS** — `Success` |
| Activity launch | `adb shell am start ...` | **PASS** — confirmed foreground via `dumpsys`, process alive, zero `FATAL`/`AndroidRuntime` in logcat |
| Live RPC atomicity | Manual `execute_sql` against disposable test rows | **PASS** — see §5 |

One real bug was caught by this chain: `npx tsc --noEmit` alone passed, but
`npm run build`'s `tsc -b` (project-mode build, which this repo's build script
actually uses) caught a real type error in `mockBackend.ts` (`opened_at`
typed as `string | undefined` but actually nullable). Fixed and reverified —
this is a reminder that `tsc -b`, not `tsc --noEmit`, is this project's
authoritative type check.

## 9. Manual Testing — What Was and Wasn't Actually Observed

Kept strictly separate, per the explicit instruction not to conflate these:

- **Automated verification (this session, machine-run):** all of §8's
  TypeScript/ESLint/test/build/Gradle results.
- **Device deployment verification (this session, machine-run via adb):**
  APK installed, activity confirmed in the foreground, process confirmed
  alive, logcat confirmed free of crashes at launch.
- **Live database verification (this session, via Supabase MCP):** the new
  RPCs were exercised against real (disposable, fully cleaned-up) rows and
  behaved exactly as specified.
- **Physical visual verification (a human looking at the phone screen):**
  **Not performed.** No one visually inspected the redesigned Chat inbox
  swipe actions, the new ephemeral-mode composer picker, the Gallery
  Collections bar, Burst stacks, or Trash on the actual device screen.
  `adb screencap` cannot substitute for this — `FLAG_SECURE` makes any
  screenshot of this app render solid black by design, which is expected and
  is not evidence either way about the real UI.

## 10. Final Assessment

This pass delivered a real, working, security-verified backend for
server-authoritative three-mode ephemeral media (the single largest and
highest-risk piece), plus a genuinely more Instagram-like DM inbox (mute,
delete, mark-unread, hold-to-record voice) and a genuinely more Google
Photos-like Gallery (day-grouped, favorites, Trash, Burst stacks,
Collections, real search). It is **not** a complete implementation of every
item in the original 28-section brief — Albums UI, grid virtualization, and
lightbox swipe-between-media were explicitly scoped out and documented above
rather than rushed. Message Requests, in-thread Forward, and in-thread Pin
were not built because no backend exists for them and the brief's own
language conditioned them on that.

Physical visual verification of the running app remains the one thing that
still requires a human looking at the actual phone screen.
