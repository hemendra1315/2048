package com.hemu.games;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentResolver;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    public static final String GAME_UPDATES_CHANNEL_ID = "game_updates";
    public static final String GAME_UPDATES_CHANNEL_NAME = "Game Updates";
    public static final String GAME_UPDATES_CHANNEL_DESC = "Game alerts and rewards";

    // Each name must have a matching res/raw/<name>.wav and match ALLOWED_SOUNDS in the
    // send-push-notification Edge Function and NOTIFICATION_SOUND_OPTIONS in notifications.ts.
    public static final String[] SOUND_CHANNELS = { "chime", "arcade", "coins", "ping" };

    // Android locks a channel's sound once created. To change a sound later, bump this
    // version (and the "_v2" suffix in the Edge Function, SQL and notifications.ts).
    private static final String CHANNEL_VERSION = "v2";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Keep chats out of the recent-apps thumbnail, screenshots and screen recordings.
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        createGameNotificationChannels();
    }

    private void createGameNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel defaultChannel = new NotificationChannel(
            GAME_UPDATES_CHANNEL_ID, GAME_UPDATES_CHANNEL_NAME, NotificationManager.IMPORTANCE_DEFAULT);
        defaultChannel.setDescription(GAME_UPDATES_CHANNEL_DESC);
        defaultChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        defaultChannel.enableVibration(true);
        manager.createNotificationChannel(defaultChannel);

        AudioAttributes attrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();

        for (String sound : SOUND_CHANNELS) {
            // Remove the unversioned channels from earlier builds (they were created without a sound).
            manager.deleteNotificationChannel(GAME_UPDATES_CHANNEL_ID + "_" + sound);

            int resId = getResources().getIdentifier(sound, "raw", getPackageName());
            if (resId == 0) continue;
            Uri soundUri = new Uri.Builder()
                .scheme(ContentResolver.SCHEME_ANDROID_RESOURCE)
                .authority(getPackageName())
                .appendPath(String.valueOf(resId))
                .build();

            NotificationChannel channel = new NotificationChannel(
                GAME_UPDATES_CHANNEL_ID + "_" + sound + "_" + CHANNEL_VERSION,
                GAME_UPDATES_CHANNEL_NAME + " (" + capitalize(sound) + ")",
                NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("Game alerts with " + sound + " sound");
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.enableVibration(true);
            channel.setSound(soundUri, attrs);
            manager.createNotificationChannel(channel);
        }
    }

    private String capitalize(String str) {
        if (str == null || str.isEmpty()) return "";
        return str.substring(0, 1).toUpperCase() + str.substring(1);
    }
}
