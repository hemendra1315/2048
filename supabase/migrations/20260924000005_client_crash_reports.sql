-- =============================================================================
-- Migration: 20260924000005_client_crash_reports.sql
-- Dedicated, insert-only table for app crash reports (kept out of admin_access_log,
-- which is the admin audit trail and only accepts rows written by super admins).
-- Users can add and read reports for themselves only; super admins can read all.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.client_crash_reports (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    client_report_id TEXT NOT NULL CHECK (char_length(client_report_id) <= 64),
    component TEXT CHECK (component IS NULL OR char_length(component) <= 120),
    message TEXT NOT NULL CHECK (char_length(message) <= 500),
    stack TEXT CHECK (stack IS NULL OR char_length(stack) <= 2000),
    platform TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
    app_path TEXT CHECK (app_path IS NULL OR char_length(app_path) <= 200),
    occurred_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, client_report_id)
);

CREATE INDEX IF NOT EXISTS idx_client_crash_reports_received ON public.client_crash_reports (received_at DESC);

ALTER TABLE public.client_crash_reports ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.client_crash_reports FROM anon, authenticated;
GRANT INSERT (client_report_id, component, message, stack, platform, app_path, occurred_at)
    ON public.client_crash_reports TO authenticated;
GRANT SELECT ON public.client_crash_reports TO authenticated;

DROP POLICY IF EXISTS "crash_reports_insert_own" ON public.client_crash_reports;
CREATE POLICY "crash_reports_insert_own" ON public.client_crash_reports
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Users see only their own reports (needed for the duplicate-safe upload retry);
-- super admins see all.
DROP POLICY IF EXISTS "crash_reports_select_admin" ON public.client_crash_reports;
CREATE POLICY "crash_reports_select_admin" ON public.client_crash_reports
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_super_admin());
