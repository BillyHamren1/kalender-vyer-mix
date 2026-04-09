package se.eventflow.scanner;

import android.os.Bundle;
import android.util.Log;
import android.webkit.PermissionRequest;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * MainActivity for EventFlow Scanner app.
 *
 * Registers custom Capacitor plugins (DataWedge, ZebraRfid) and extends
 * the default BridgeWebChromeClient to grant WebView media permissions
 * (camera) needed by getUserMedia() for QR/barcode camera fallback.
 *
 * We extend BridgeWebChromeClient instead of replacing with a bare
 * WebChromeClient to preserve all Capacitor-managed behaviors:
 *   - Console message forwarding
 *   - File chooser (input[type=file])
 *   - JS alert/confirm/prompt dialogs
 *   - Geolocation permissions
 *   - Any future Capacitor WebChromeClient logic
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "MainActivity";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register custom Capacitor plugins before super.onCreate
        registerPlugin(DataWedgePlugin.class);
        registerPlugin(ZebraRfidPlugin.class);

        super.onCreate(savedInstanceState);

        // Extend (not replace) Capacitor's BridgeWebChromeClient
        // to handle WebView permission requests for getUserMedia().
        this.bridge.getWebView().setWebChromeClient(
            new BridgeWebChromeClient(this.bridge) {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    // Log which resources are being requested for diagnostics
                    String[] resources = request.getResources();
                    for (String res : resources) {
                        Log.d(TAG, "WebView permission requested: " + res);
                    }

                    // Grant all requested resources (VIDEO_CAPTURE for camera,
                    // AUDIO_CAPTURE if ever needed). In a WebView context these
                    // are already gated by the Android CAMERA permission in
                    // AndroidManifest.xml, so granting here is safe.
                    runOnUiThread(() -> request.grant(resources));
                }
            }
        );

        Log.d(TAG, "MainActivity created with custom BridgeWebChromeClient");
    }
}
