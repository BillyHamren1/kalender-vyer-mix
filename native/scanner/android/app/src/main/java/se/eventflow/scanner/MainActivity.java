package se.eventflow.scanner;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
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
 * the default BridgeWebChromeClient to grant WebView media permissions.
 *
 * Also registers a DIAGNOSTIC BroadcastReceiver for the scan action
 * directly on the Activity to isolate whether plugin receiver registration
 * is the problem.
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "MainActivity";
    private static final String DW_SCAN_ACTION = "se.eventflow.scanner.SCAN";

    private BroadcastReceiver diagnosticScanReceiver;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        Log.i(TAG, "### MAINACTIVITY onCreate: registering native plugins");

        // Register custom Capacitor plugins before super.onCreate
        registerPlugin(DataWedgePlugin.class);
        registerPlugin(ZebraRfidPlugin.class);

        super.onCreate(savedInstanceState);

        ensureDataWedgePluginReady("onCreate");

        // --- DIAGNOSTIC: register a scan receiver directly on the Activity ---
        registerDiagnosticScanReceiver("onCreate");

        // Extend Capacitor's BridgeWebChromeClient for getUserMedia() permissions
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
        // Re-register diagnostic receiver in case it was lost
        registerDiagnosticScanReceiver("onResume");
    }

    @Override
    public void onDestroy() {
        unregisterDiagnosticScanReceiver();
        super.onDestroy();
    }

    /**
     * Register a DIAGNOSTIC BroadcastReceiver directly on the Activity context
     * for se.eventflow.scanner.SCAN. This bypasses the Capacitor plugin entirely.
     *
     * If this receiver fires but the plugin receiver does not, the bug is in
     * plugin receiver registration. If neither fires, the issue is system-level.
     */
    private void registerDiagnosticScanReceiver(String origin) {
        if (diagnosticScanReceiver != null) {
            Log.i(TAG, "### MAINACTIVITY DIAGNOSTIC SCAN RECEIVER already registered, skipping (" + origin + ")");
            return;
        }

        diagnosticScanReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                Log.i(TAG, "### MAINACTIVITY SCAN RECEIVER FIRED ###");
                Log.i(TAG, "### MAINACTIVITY SCAN ACTION=" + (intent != null ? intent.getAction() : "null"));
                Log.i(TAG, "### MAINACTIVITY SCAN CATEGORIES=" + (intent != null ? intent.getCategories() : "null"));

                if (intent != null && intent.getExtras() != null) {
                    Bundle extras = intent.getExtras();
                    for (String key : extras.keySet()) {
                        Object value = extras.get(key);
                        Log.i(TAG, "### MAINACTIVITY SCAN EXTRA " + key + " = " + value);
                    }
                } else {
                    Log.i(TAG, "### MAINACTIVITY SCAN EXTRAS: <none>");
                }
            }
        };

        IntentFilter filter = new IntentFilter();
        filter.addAction(DW_SCAN_ACTION);
        filter.addCategory(Intent.CATEGORY_DEFAULT);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                // API 33+: must specify RECEIVER_EXPORTED for external broadcasts
                this.registerReceiver(diagnosticScanReceiver, filter, Context.RECEIVER_EXPORTED);
                Log.i(TAG, "### MAINACTIVITY DIAGNOSTIC SCAN RECEIVER REGISTERED (EXPORTED, Activity context, API 33+) action="
                    + DW_SCAN_ACTION + " origin=" + origin);
            } else {
                this.registerReceiver(diagnosticScanReceiver, filter);
                Log.i(TAG, "### MAINACTIVITY DIAGNOSTIC SCAN RECEIVER REGISTERED (Activity context, pre-API33) action="
                    + DW_SCAN_ACTION + " origin=" + origin);
            }
        } catch (Exception e) {
            Log.e(TAG, "### MAINACTIVITY FAILED TO REGISTER DIAGNOSTIC SCAN RECEIVER: " + e.getMessage(), e);
            diagnosticScanReceiver = null;
        }
    }

    private void unregisterDiagnosticScanReceiver() {
        if (diagnosticScanReceiver != null) {
            try {
                this.unregisterReceiver(diagnosticScanReceiver);
                Log.i(TAG, "### MAINACTIVITY DIAGNOSTIC SCAN RECEIVER UNREGISTERED");
            } catch (Exception e) {
                Log.w(TAG, "### MAINACTIVITY error unregistering diagnostic receiver: " + e.getMessage());
            }
            diagnosticScanReceiver = null;
        }
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
