-- =============================================================================
-- Migration: 20260927000012_dedupe_update_my_profile.sql
-- 20260927000011 added a new 5-arg overload of update_my_profile via
-- CREATE OR REPLACE, but that only replaces an exact-signature match — it
-- left two older overloads live, making every named-argument RPC call
-- ambiguous ("function is not unique"). Drop the stale overloads so only
-- the current 5-arg version remains.
-- =============================================================================

DROP FUNCTION IF EXISTS public.update_my_profile(TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.update_my_profile(TEXT, TEXT, BOOLEAN, TEXT);
