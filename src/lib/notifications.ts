import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { ContactNotificationPreference, NotificationMode } from '../types';
import { supabase, isSupabaseConfigured } from './supabase';
import { mockBackend } from './mockBackend';

export const GAME_UPDATES_CHANNEL_ID = 'game_updates';
export const GAME_UPDATES_CHANNEL_NAME = 'Game Updates';
export const GAME_UPDATES_CHANNEL_DESC = 'Game alerts and rewards';

export const DEFAULT_DISGUISED_TITLE = '🎮 Daily puzzle ready';
export const DEFAULT_DISGUISED_BODY = 'Open Games to continue.';

export const NOTIFICATION_SOUND_OPTIONS = [
  { id: 'default', label: 'Default' },
  { id: 'chime', label: 'Chime' },
  { id: 'arcade', label: 'Arcade Blip' },
  { id: 'coins', label: 'Coins' },
  { id: 'ping', label: 'Subtle Ping' },
];

/** Android channel for a sound option. Must match MainActivity.java (channels are versioned
 *  because Android never lets an app change the sound of an existing channel). */
export const soundChannelId = (sound: string | null | undefined): string =>
  sound && NOTIFICATION_SOUND_OPTIONS.some(s => s.id === sound && s.id !== 'default')
    ? `${GAME_UPDATES_CHANNEL_ID}_${sound}_v2`
    : GAME_UPDATES_CHANNEL_ID;

let isInitialized = false;
let currentPushToken: string | null = null;

/** Links this device's push token to the signed-in account (and unlinks it from any other). */
async function claimCurrentPushToken(): Promise<void> {
  if (!currentPushToken || !isSupabaseConfigured()) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { error } = await supabase.rpc('claim_push_token', {
      p_token: currentPushToken,
      p_platform: Capacitor.getPlatform() === 'ios' ? 'ios' : 'android',
    });
    if (error) console.warn('[notifications] Failed to link push token:', error.code);
  } catch (err) {
    console.warn('[notifications] Failed to link push token:', err);
  }
}

/**
 * Signs out after unlinking this device's push token, so the next person to use the
 * phone does not receive this account's notifications. Use instead of supabase.auth.signOut().
 */
export async function signOutAndReleasePush(): Promise<void> {
  if (currentPushToken && isSupabaseConfigured()) {
    try {
      const { error } = await supabase.rpc('release_push_token', { p_token: currentPushToken });
      if (error) console.warn('[notifications] Failed to unlink push token:', error.code);
    } catch (err) {
      console.warn('[notifications] Failed to unlink push token:', err);
    }
  }
  await supabase.auth.signOut();
}

/**
 * Sets up push registration and tap handlers. Android notification channels are created
 * natively in MainActivity.java before this runs. Safe to call before sign-in: the token is
 * linked to the account whenever a session appears.
 */
export async function initializeNotificationService(): Promise<void> {
  if (isInitialized || !Capacitor.isNativePlatform()) return;
  isInitialized = true;

  try {
    // Tapping any notification only opens the app (launcher cover); never deep-links to a chat.
    await LocalNotifications.addListener('localNotificationActionPerformed', () => {});

    if (isSupabaseConfigured()) {
      supabase.auth.onAuthStateChange(event => {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          // Defer: Supabase calls inside this callback can deadlock the auth lock.
          setTimeout(() => void claimCurrentPushToken(), 0);
        }
      });
    }

    const pushPerm = await PushNotifications.checkPermissions();
    if (pushPerm.receive !== 'granted') {
      const reqRes = await PushNotifications.requestPermissions();
      if (reqRes.receive !== 'granted') {
        console.warn('[notifications] Push notification permission not granted');
        return;
      }
    }

    await PushNotifications.addListener('registration', token => {
      currentPushToken = token.value;
      void claimCurrentPushToken();
    });

    await PushNotifications.addListener('registrationError', err => {
      console.warn('[notifications] Push registration error (check Firebase config):', err);
    });

    // In the foreground the push plugin itself shows the (already disguised) notification,
    // because capacitor.config.ts sets presentationOptions to include 'alert'.
    // Nothing is scheduled here, to avoid a duplicate.
    await PushNotifications.addListener('pushNotificationReceived', () => {});

    await PushNotifications.addListener('pushNotificationActionPerformed', () => {
      // Opens the launcher cover screen only; no deep links.
    });

    await PushNotifications.register();
  } catch (err) {
    console.warn('[notifications] Error initializing notification service:', err);
  }
}

/**
 * Fetches contact notification preferences from Supabase or Mock Backend
 */
export async function getContactNotificationPreference(
  ownerId: string,
  contactId: string
): Promise<ContactNotificationPreference> {
  const defaultPref: ContactNotificationPreference = {
    owner_id: ownerId,
    contact_id: contactId,
    notification_mode: 'default',
    custom_phrase: null,
    custom_sound: 'default',
  };

  if (!ownerId || !contactId) return defaultPref;

  try {
    if (isSupabaseConfigured()) {
      const { data, error } = await supabase
        .from('contact_notification_preferences')
        .select('*')
        .eq('owner_id', ownerId)
        .eq('contact_id', contactId)
        .maybeSingle();

      if (error) {
        console.warn('[notifications] Supabase preference fetch error:', error);
        return defaultPref;
      }

      if (data) {
        return {
          id: data.id,
          owner_id: data.owner_id,
          contact_id: data.contact_id,
          notification_mode: data.notification_mode as NotificationMode,
          custom_phrase: data.custom_phrase,
          custom_sound: data.custom_sound || 'default',
          created_at: data.created_at,
          updated_at: data.updated_at,
        };
      }
    } else {
      const mockPref = mockBackend.getContactNotificationPreference(ownerId, contactId);
      if (mockPref) return mockPref;
    }
  } catch (err) {
    console.warn('[notifications] Failed to load notification preference:', err);
  }

  return defaultPref;
}

/**
 * Saves contact notification preference
 */
export async function saveContactNotificationPreference(
  ownerId: string,
  contactId: string,
  updates: {
    notification_mode: NotificationMode;
    custom_phrase: string | null;
    custom_sound: string | null;
  }
): Promise<ContactNotificationPreference> {
  const sanitizedPhrase = updates.custom_phrase?.trim() || null;
  const sanitizedSound = updates.custom_sound?.trim() || 'default';

  const payload = {
    owner_id: ownerId,
    contact_id: contactId,
    notification_mode: updates.notification_mode,
    custom_phrase: updates.notification_mode === 'custom' ? sanitizedPhrase : null,
    custom_sound: sanitizedSound,
    updated_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('contact_notification_preferences')
      .upsert(payload, { onConflict: 'owner_id,contact_id' })
      .select()
      .single();

    if (error) throw error;
    return data as unknown as ContactNotificationPreference;
  } else {
    return mockBackend.saveContactNotificationPreference(ownerId, contactId, payload);
  }
}

/**
 * Triggers a disguised test notification locally to preview lockscreen appearance
 */
export async function sendTestNotification(options: {
  title?: string;
  body?: string;
  sound?: string;
}): Promise<void> {
  const title = options.title?.trim() || DEFAULT_DISGUISED_TITLE;
  const body = options.body || DEFAULT_DISGUISED_BODY;
  const sound = options.sound || 'default';
  const channelId = soundChannelId(sound);

  try {
    if (Capacitor.isNativePlatform()) {
      await initializeNotificationService();
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Date.now() % 100000),
            title,
            body,
            channelId,
            smallIcon: 'ic_launcher',
            sound: sound !== 'default' ? sound : undefined,
            extra: {
              type: 'game_alert',
              hidden: 'true',
            },
          },
        ],
      });
    } else if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(title, {
          body,
          icon: '/gamepad.svg',
          badge: '/gamepad.svg',
          tag: 'game_update_test',
        });
      } else if (Notification.permission !== 'denied') {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          new Notification(title, {
            body,
            icon: '/gamepad.svg',
            badge: '/gamepad.svg',
            tag: 'game_update_test',
          });
        }
      }
    }
  } catch (err) {
    console.error('[notifications] Failed to send test notification:', err);
    throw err;
  }
}
