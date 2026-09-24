/**
 * Zero-Leak Privacy-Preserving Crash Reporting & Telemetry
 * Captures uncaught runtime errors, unhandled rejections, and component crashes.
 * Never captures user messages, credentials, PINs, or private media.
 */

import { Capacitor } from '@capacitor/core';
import { supabase, isSupabaseConfigured } from './supabase';

export interface CrashReport {
  id: string;
  timestamp: string;
  message: string;
  stack?: string;
  component?: string;
  platform: 'android' | 'ios' | 'web';
  userAgent: string;
  url: string;
}

const CRASH_BUFFER_KEY = 'games_crash_log_buffer';
const MAX_BUFFERED_CRASHES = 20;

class CrashReporter {
  private isInitialized = false;

  public init(): void {
    if (this.isInitialized || typeof window === 'undefined') return;
    this.isInitialized = true;

    // 1. Global Window Error Listener
    window.addEventListener('error', (event: ErrorEvent) => {
      this.recordCrash({
        message: event.message || 'Uncaught Error',
        stack: event.error?.stack,
        component: 'window.onerror',
      });
    });

    // 2. Unhandled Promise Rejection Listener
    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason || 'Unhandled Promise Rejection');
      const stack = reason instanceof Error ? reason.stack : undefined;
      this.recordCrash({
        message,
        stack,
        component: 'unhandledrejection',
      });
    });

    // 3. Flush buffered errors if online
    if (navigator.onLine) {
      void this.flushBuffer();
    }
  }

  public recordCrash(details: { message: string; stack?: string; component?: string }): void {
    const report: CrashReport = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      timestamp: new Date().toISOString(),
      message: details.message.substring(0, 500),
      stack: details.stack ? details.stack.substring(0, 2000) : undefined,
      component: details.component || 'generic',
      platform: Capacitor.getPlatform() as 'android' | 'ios' | 'web',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      url: typeof window !== 'undefined' ? window.location.pathname : '/',
    };

    console.error(`[CrashReporter:${report.component}]`, report.message, report.stack);

    try {
      const existingRaw = localStorage.getItem(CRASH_BUFFER_KEY);
      const list: CrashReport[] = existingRaw ? JSON.parse(existingRaw) : [];
      list.unshift(report);
      if (list.length > MAX_BUFFERED_CRASHES) {
        list.length = MAX_BUFFERED_CRASHES;
      }
      localStorage.setItem(CRASH_BUFFER_KEY, JSON.stringify(list));
    } catch {
      // Storage failure shouldn't crash app
    }

    if (navigator.onLine) {
      void this.flushBuffer();
    }
  }

  private isFlushing = false;

  public async flushBuffer(): Promise<void> {
    if (this.isFlushing) return;
    this.isFlushing = true;
    try {
      const existingRaw = localStorage.getItem(CRASH_BUFFER_KEY);
      if (!existingRaw) return;
      const list: CrashReport[] = JSON.parse(existingRaw);
      if (list.length === 0) return;

      if (!isSupabaseConfigured()) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return; // keep buffered until someone is signed in

      const rows = list.map(crash => ({
        client_report_id: crash.id,
        component: crash.component?.substring(0, 120) ?? null,
        message: crash.message.substring(0, 500),
        stack: crash.stack ? crash.stack.substring(0, 2000) : null,
        platform: crash.platform,
        app_path: crash.url.substring(0, 200),
        occurred_at: crash.timestamp,
      }));

      // ignoreDuplicates: a retry after a partial failure must not error on reports already saved.
      const { error } = await supabase
        .from('client_crash_reports')
        .upsert(rows, { onConflict: 'user_id,client_report_id', ignoreDuplicates: true });
      if (error) {
        console.warn('[CrashReporter] Upload failed; keeping reports for next time:', error.code);
        return;
      }

      // Remove only what was uploaded; reports recorded meanwhile stay buffered.
      const sentIds = new Set(list.map(c => c.id));
      const remaining = this.getBufferedCrashes().filter(c => !sentIds.has(c.id));
      if (remaining.length) localStorage.setItem(CRASH_BUFFER_KEY, JSON.stringify(remaining));
      else localStorage.removeItem(CRASH_BUFFER_KEY);
    } catch (err) {
      console.warn('[CrashReporter] Failed to flush crash buffer:', err);
    } finally {
      this.isFlushing = false;
    }
  }

  public getBufferedCrashes(): CrashReport[] {
    try {
      const raw = localStorage.getItem(CRASH_BUFFER_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
}

export const crashReporter = new CrashReporter();
