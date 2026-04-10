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
import com.getcapacitor.PluginHandle;

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
        Log.i(TAG, "### MAINACTIVITY onCreate: registering native plugins");

        // Register custom Capacitor plugins before super.onCreate
        registerPlugin(DataWedgePlugin.class);
        registerPlugin(ZebraRfidPlugin.class);

        super.onCreate(savedInstanceState);

        ensureDataWedgePluginReady("onCreate");

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

        Log.i(TAG, "### MAINACTIVITY created with diagnostic WebViewClient");
    }

    @Override
    public void onStart() {
        super.onStart();
        ensureDataWedgePluginReady("onStart");
    }

    @Override
    public void onResume() {
        super.onResume();
        ensureDataWedgePluginReady("onResume");
    }

    private void ensureDataWedgePluginReady(String origin) {
        if (this.bridge == null) {
            Log.e(TAG, "### MAINACTIVITY bridge is NULL during " + origin);
            return;
        }

        PluginHandle pluginHandle = this.bridge.getPlugin("DataWedge");
        if (pluginHandle == null) {
            Log.e(TAG, "### MAINACTIVITY DataWedge plugin handle is NULL during " + origin);
            return;
        }

        try {
            if (pluginHandle.getInstance() == null) {
                Log.w(TAG, "### MAINACTIVITY DataWedge plugin instance was null, forcing load during " + origin);
                pluginHandle.load();
            }

            Log.i(TAG, "### MAINACTIVITY DataWedge plugin ready during " + origin
                + " instance=" + (pluginHandle.getInstance() != null)
                + " webView=" + (this.bridge.getWebView() != null));
        } catch (Exception e) {
            Log.e(TAG, "### MAINACTIVITY failed to prepare DataWedge plugin during " + origin + ": " + e.getMessage(), e);
        }
    }
}
