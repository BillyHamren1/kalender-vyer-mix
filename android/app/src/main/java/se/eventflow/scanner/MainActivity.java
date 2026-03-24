package se.eventflow.scanner;

import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register custom Capacitor plugins before super.onCreate
        registerPlugin(DataWedgePlugin.class);
        registerPlugin(ZebraRfidPlugin.class);

        super.onCreate(savedInstanceState);

        // Grant WebView camera/microphone permissions for getUserMedia()
        this.bridge.getWebView().setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> request.grant(request.getResources()));
            }
        });
    }
}
