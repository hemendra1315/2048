package com.hemu.games;

import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ScreenProtection")
public class ScreenProtectionPlugin extends Plugin {

    @PluginMethod
    public void enable(PluginCall call) {
        if (getActivity() == null) {
            call.reject("Activity unavailable");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
                JSObject ret = new JSObject();
                ret.put("enabled", true);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Failed to enable screen protection: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void disable(PluginCall call) {
        if (getActivity() == null) {
            call.reject("Activity unavailable");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                boolean isDebuggable = (getActivity().getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
                // In debug builds, allow clearing FLAG_SECURE on demand. In release builds, keep maximum privacy.
                if (isDebuggable) {
                    getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
                }
                JSObject ret = new JSObject();
                ret.put("enabled", false);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Failed to disable screen protection: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void isEnabled(PluginCall call) {
        if (getActivity() == null) {
            JSObject ret = new JSObject();
            ret.put("enabled", false);
            call.resolve(ret);
            return;
        }
        int flags = getActivity().getWindow().getAttributes().flags;
        boolean isSecure = (flags & WindowManager.LayoutParams.FLAG_SECURE) != 0;
        JSObject ret = new JSObject();
        ret.put("enabled", isSecure);
        call.resolve(ret);
    }
}
