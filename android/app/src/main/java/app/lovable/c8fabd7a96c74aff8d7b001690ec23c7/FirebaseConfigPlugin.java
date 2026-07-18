package app.lovable.c8fabd7a96c74aff8d7b001690ec23c7;

import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.FirebaseApp;

@CapacitorPlugin(name = "FirebaseConfig")
public class FirebaseConfigPlugin extends Plugin {
    @PluginMethod
    public void isConfigured(PluginCall call) {
        JSObject result = new JSObject();
        result.put("configured", canUseFirebaseMessaging());
        call.resolve(result);
    }

    private boolean canUseFirebaseMessaging() {
        Context context = getContext();
        if (!hasStringResource(context, "google_app_id")) return false;

        try {
            if (!FirebaseApp.getApps(context).isEmpty()) return true;
            return FirebaseApp.initializeApp(context) != null;
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean hasStringResource(Context context, String name) {
        int id = context.getResources().getIdentifier(name, "string", context.getPackageName());
        if (id == 0) return false;

        try {
            String value = context.getString(id);
            return value != null && !value.trim().isEmpty();
        } catch (Exception ignored) {
            return false;
        }
    }
}