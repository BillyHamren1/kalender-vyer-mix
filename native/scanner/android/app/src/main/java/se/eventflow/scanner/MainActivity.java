package se.eventflow.scanner;

import android.os.Bundle;
import android.net.Uri;
import android.util.Log;
import android.webkit.PermissionRequest;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * MainActivity for EventFlow Scanner app.
 *
 * Registers the Scanner-only native plugins and grants only camera capture
 * to Capacitor's trusted local origin. DataWedge owns the sole scan receiver.
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "MainActivity";
    @Override
    public void onCreate(Bundle savedInstanceState) {
        Log.i(TAG, "### MAINACTIVITY onCreate: registering native plugins");

        // Register custom Capacitor plugins before super.onCreate
        registerPlugin(DataWedgePlugin.class);
        registerPlugin(ZebraRfidPlugin.class);

        super.onCreate(savedInstanceState);

        // Camera scanning is the only WebView media capability this app needs.
        this.bridge.getWebView().setWebChromeClient(
            new BridgeWebChromeClient(this.bridge) {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    Uri origin = request.getOrigin();
                    boolean trustedLocalOrigin = origin != null
                            && "https".equalsIgnoreCase(origin.getScheme())
                            && "localhost".equalsIgnoreCase(origin.getHost());
                    String[] resources = request.getResources();
                    boolean cameraOnly = resources != null && resources.length == 1
                            && PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resources[0]);

                    if (!trustedLocalOrigin || !cameraOnly) {
                        Log.w(TAG, "Rejected untrusted or non-camera WebView permission request");
                        request.deny();
                        return;
                    }

                    runOnUiThread(() -> request.grant(
                            new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE }
                    ));
                }
            }
        );
    }
}
