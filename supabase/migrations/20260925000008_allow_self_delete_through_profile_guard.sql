-- Migration: 20260925000008_allow_self_delete_through_profile_guard.sql
--
-- delete_own_account() (20260925000007) failed with "Not allowed to change role or status":
-- guard_profile_update (20260923000003) fires on every UPDATE to public.profiles regardless of
-- who called it, including from inside a SECURITY DEFINER function - a trigger sees the calling
-- session's auth.role()/auth.uid(), not the function owner's privilege. Its role/status branch
-- only allowed an admin changing someone ELSE's status, so a user's own self-deletion UPDATE
-- (status -> 'deleted') was rejected exactly like any other self-service status change would be.
--
-- This adds one narrow exception: a user may set their OWN status to 'deleted' (and only that
-- value, and only when role is unchanged) without being a super admin. Every other role/status
-- transition - suspending, banning, un-banning, promoting - still requires is_super_admin() and
-- still cannot target the admin's own row, exactly as before.

CREATE OR REPLACE FUNCTION public.guard_profile_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  -- Only end-user requests are restricted; the service role and migrations are trusted.
  IF coalesce(auth.role(), '') <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.uid IS DISTINCT FROM OLD.uid
     OR NEW.username IS DISTINCT FROM OLD.username
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'These profile fields cannot be changed' USING ERRCODE = '42501';
  END IF;

  IF NEW.biometric_enabled AND NOT OLD.biometric_enabled THEN
    RAISE EXCEPTION 'Enable fingerprint unlock by enrolling a device' USING ERRCODE = '42501';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      -- Self-deletion: the one status change a non-admin may make to their own row.
      OLD.id = auth.uid() AND NEW.role IS NOT DISTINCT FROM OLD.role AND NEW.status = 'deleted'
    ) THEN
      IF NOT public.is_super_admin() OR OLD.id = auth.uid() THEN
        RAISE EXCEPTION 'Not allowed to change role or status' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$func$;
