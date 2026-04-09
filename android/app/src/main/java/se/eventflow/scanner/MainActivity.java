package se.eventflow.scanner;

import android.os.Bundle;
import android.util.Log;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.net.http.SslError;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;

/**
 * MainActivity for EventFlow Scanner app.
 *
 * Registers custom Capacitor plugins (DataWedge, ZebraRfid) and extends
 * the default BridgeWebChromeClient to grant WebView media permissions
 * (camera) needed by getUserMedia() for QR/barcode camera fallback.
 *
 * Also adds a diagnostic BridgeWebViewClient to log network/SSL errors
 * from the WebView layer for troubleshooting login and fetch issues.
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
                    String[] resources = request.getResources();
                    for (String res : resources) {
                        Log.d(TAG, "WebView permission requested: " + res);
                    }
                    runOnUiThread(() -> request.grant(resources));
                }
            }
        );

        // Add diagnostic WebViewClient to log network/SSL errors
        this.bridge.getWebView().setWebViewClient(
            new BridgeWebViewClient(this.bridge) {
                @Override
                public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    Log.e(TAG, "WebView error: " + error.getErrorCode() + " " + error.getDescription()
                        + " url=" + request.getUrl());
                    super.onReceivedError(view, request, error);
                }

                @Override
                public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                    Log.e(TAG, "WebView HTTP error: " + errorResponse.getStatusCode()
                        + " url=" + request.getUrl());
                    super.onReceivedHttpError(view, request, errorResponse);
                }

                @Override
                public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                    Log.e(TAG, "WebView SSL error: " + error.toString()
                        + " url=" + error.getUrl());
                    super.onReceivedSslError(view, handler, error);
                }
            }
        );

        Log.d(TAG, "MainActivity created with diagnostic WebViewClient");
    }
}
