package se.eventflow.scanner;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;

/**
 * DataWedgePlugin — Capacitor plugin for Zebra DataWedge barcode scanning.
 *
 * Receives barcode scan data via Android broadcast intents from DataWedge
 * and forwards them to the WebView as Capacitor plugin events.
 *
 * Also listens for DataWedge RESULT intents so the frontend can verify
 * whether init commands (ENABLE_DATAWEDGE, SWITCH_TO_PROFILE, etc.)
 * succeeded or failed.
 *
 * DataWedge must be configured on the Zebra device with:
 *   - Intent output enabled
 *   - Intent action: se.eventflow.scanner.SCAN
 *   - Intent delivery: Broadcast
 *   - Keystroke output: DISABLED
 */
@CapacitorPlugin(name = "DataWedge")
public class DataWedgePlugin extends Plugin {

    private static final String TAG = "DataWedgePlugin";
    private static final String MARKER = "### ";

    // Intent action configured in DataWedge profile
    private static final String DW_SCAN_ACTION = "se.eventflow.scanner.SCAN";

    // Standard DataWedge extras
    private static final String EXTRA_DATA_STRING = "com.symbol.datawedge.data_string";
    private static final String EXTRA_LABEL_TYPE = "com.symbol.datawedge.label_type";
    private static final String EXTRA_SOURCE = "com.symbol.datawedge.source";

    // DataWedge API action (for sending commands to DataWedge)
    private static final String DW_API_ACTION = "com.symbol.datawedge.api.ACTION";

    // DataWedge result action (received after commands with SEND_RESULT)
    private static final String DW_RESULT_ACTION = "com.symbol.datawedge.api.RESULT_ACTION";

    // Standard DataWedge result extras
    private static final String EXTRA_RESULT = "RESULT";
    private static final String EXTRA_RESULT_INFO = "RESULT_INFO";
    private static final String EXTRA_RESULT_CODE = "RESULT_CODE";
    private static final String EXTRA_COMMAND_IDENTIFIER = "COMMAND_IDENTIFIER";

    private BroadcastReceiver scanReceiver;
    private BroadcastReceiver resultReceiver;
    private boolean isListening = false;
    private Context receiverContext;

    @Override
    public void load() {
        super.load();
        Log.i(TAG, MARKER + "DATAWEDGE PLUGIN LOADED");
        logBridgeState("load()");
        startListening("load()");
    }

    @Override
    protected void handleOnStart() {
        Log.i(TAG, MARKER + "DATAWEDGE handleOnStart");
        logBridgeState("handleOnStart()");
        startListening("handleOnStart()");
    }

    @Override
    protected void handleOnResume() {
        Log.i(TAG, MARKER + "DATAWEDGE handleOnResume");
        logBridgeState("handleOnResume()");
        startListening("handleOnResume()");
    }

    @Override
    protected void handleOnPause() {
        Log.i(TAG, MARKER + "DATAWEDGE handleOnPause listening=" + isListening);
    }

    @Override
    protected void handleOnStop() {
        Log.i(TAG, MARKER + "DATAWEDGE handleOnStop listening=" + isListening);
    }

    /**
     * Start listening for DataWedge scan broadcasts AND result broadcasts.
     */
    private synchronized void startListening(String reason) {
        Log.i(TAG, MARKER + "START LISTENING requested from " + reason);

        if (isListening && scanReceiver != null && resultReceiver != null && receiverContext != null) {
            Log.i(TAG, MARKER + "RECEIVERS ALREADY REGISTERED reason=" + reason
                    + " context=" + receiverContext.getClass().getName());
            return;
        }

        if (isListening) {
            Log.w(TAG, MARKER + "LISTENING FLAG WAS TRUE BUT RECEIVERS WERE NOT FULLY READY; resetting state");
            stopListening("reset-before-" + reason);
        }

        final Context ctx = resolveReceiverContext(reason);
        if (ctx == null) {
            Log.e(TAG, MARKER + "FAILED TO RESOLVE RECEIVER CONTEXT reason=" + reason);
            return;
        }

        // --- Scan receiver (barcode data) ---
        scanReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                Log.i(TAG, MARKER + "SCAN RECEIVER FIRED");
                if (intent == null) {
                    Log.e(TAG, MARKER + "SCAN RECEIVER GOT NULL INTENT");
                    return;
                }

                Log.i(TAG, MARKER + "SCAN RECEIVER ACTION=" + intent.getAction());
                Log.i(TAG, MARKER + "SCAN RECEIVER CATEGORIES=" + intent.getCategories());
                dumpExtras("SCAN", intent.getExtras());

                if (DW_SCAN_ACTION.equals(intent.getAction())) {
                    handleScanIntent(intent);
                } else {
                    Log.w(TAG, MARKER + "SCAN RECEIVER IGNORED ACTION=" + intent.getAction());
                }
            }
        };

        IntentFilter scanFilter = new IntentFilter();
        scanFilter.addAction(DW_SCAN_ACTION);
        scanFilter.addCategory(Intent.CATEGORY_DEFAULT);
        Log.i(TAG, MARKER + "REGISTERING SCAN RECEIVER action=" + DW_SCAN_ACTION
                + " reason=" + reason + " context=" + ctx.getClass().getName());

        // --- Result receiver (command results) ---
        resultReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                Log.i(TAG, MARKER + "RESULT RECEIVER FIRED");
                if (intent == null) {
                    Log.e(TAG, MARKER + "RESULT RECEIVER GOT NULL INTENT");
                    return;
                }

                String action = intent.getAction();
                Log.i(TAG, MARKER + "RESULT RECEIVER ACTION=" + action);
                dumpExtras("RESULT", intent.getExtras());

                if (DW_RESULT_ACTION.equals(action)) {
                    handleResultIntent(intent);
                } else {
                    Log.w(TAG, MARKER + "RESULT RECEIVER IGNORED ACTION=" + action);
                }
            }
        };

        IntentFilter resultFilter = new IntentFilter();
        resultFilter.addAction(DW_RESULT_ACTION);
        resultFilter.addCategory(Intent.CATEGORY_DEFAULT);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                ctx.registerReceiver(scanReceiver, scanFilter, Context.RECEIVER_EXPORTED);
            } else {
                ctx.registerReceiver(scanReceiver, scanFilter);
            }
            Log.i(TAG, MARKER + "SCAN RECEIVER REGISTERED");
        } catch (Exception e) {
            Log.e(TAG, MARKER + "FAILED TO REGISTER SCAN RECEIVER: " + e.getMessage(), e);
            scanReceiver = null;
            return;
        }

        try {
            Log.i(TAG, MARKER + "REGISTERING RESULT RECEIVER action=" + DW_RESULT_ACTION
                    + " reason=" + reason + " context=" + ctx.getClass().getName());
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                ctx.registerReceiver(resultReceiver, resultFilter, Context.RECEIVER_EXPORTED);
            } else {
                ctx.registerReceiver(resultReceiver, resultFilter);
            }
            Log.i(TAG, MARKER + "RESULT RECEIVER REGISTERED");
        } catch (Exception e) {
            Log.e(TAG, MARKER + "FAILED TO REGISTER RESULT RECEIVER: " + e.getMessage(), e);
            try {
                ctx.unregisterReceiver(scanReceiver);
            } catch (Exception unregisterError) {
                Log.w(TAG, MARKER + "FAILED TO ROLLBACK SCAN RECEIVER AFTER RESULT REGISTER FAILURE: "
                        + unregisterError.getMessage());
            }
            scanReceiver = null;
            resultReceiver = null;
            return;
        }

        receiverContext = ctx;
        isListening = true;
        Log.i(TAG, MARKER + "DATAWEDGE LISTENERS REGISTERED (scan + result)");
    }

    /**
     * Process an incoming DataWedge scan intent and forward to WebView.
     */
    private void handleScanIntent(Intent intent) {
        Bundle extras = intent.getExtras();
        if (extras == null) {
            Log.w(TAG, MARKER + "SCAN INTENT HAS NO EXTRAS");
            return;
        }

        String barcode = getFirstString(extras, "", EXTRA_DATA_STRING, "data_string");
        String labelType = getFirstString(extras, "UNKNOWN", EXTRA_LABEL_TYPE, "label_type");
        String source = getFirstString(extras, "scanner", EXTRA_SOURCE, "source");

        Log.i(TAG, MARKER + "SCAN PAYLOAD barcode=" + barcode + " symbology=" + labelType + " source=" + source);

        if (barcode.isEmpty()) {
            Log.w(TAG, MARKER + "SCAN INTENT HAS EMPTY BARCODE DATA");
            return;
        }

        Log.i(TAG, "Scan received — barcode: " + barcode + ", symbology: " + labelType);

        JSObject payload = new JSObject();
        payload.put("data", barcode);
        payload.put("symbology", labelType);
        payload.put("source", "zebra_datawedge");
        payload.put("nativeSource", source);
        payload.put("timestamp", System.currentTimeMillis());

        // Log full extras for debugging
        if (extras.keySet() != null) {
            JSObject rawExtras = new JSObject();
            for (String key : extras.keySet()) {
                Object val = extras.get(key);
                if (val != null) {
                    rawExtras.put(key, val.toString());
                }
            }
            payload.put("rawExtras", rawExtras);
        }

        boolean bridgeReady = bridge != null;
        boolean webViewReady = bridgeReady && bridge.getWebView() != null;
        boolean hasScanListeners = hasListeners("datawedge_scan");

        Log.i(TAG, MARKER + "SENDING EVENT TO WEBVIEW event=datawedge_scan"
                + " bridgeReady=" + bridgeReady
                + " webViewReady=" + webViewReady
                + " hasListeners=" + hasScanListeners);

        if (!bridgeReady || !webViewReady) {
            Log.w(TAG, MARKER + "WEBVIEW/BRIDGE NOT READY WHEN SCAN ARRIVED");
        }

        notifyListeners("datawedge_scan", payload, true);
        Log.i(TAG, MARKER + "EVENT SENT TO WEBVIEW event=datawedge_scan barcode=" + barcode);
    }

    /**
     * Process a DataWedge RESULT intent (response to a command we sent).
     *
     * DataWedge result intents contain:
     *   - RESULT: "SUCCESS" or "FAILURE"
     *   - RESULT_INFO: Bundle with additional info/error details
     *   - COMMAND_IDENTIFIER: the identifier we sent with the command
     *   - The original command key as an extra with result value
     *
     * We detect which command was answered by checking known command keys
     * in the extras.
     */
    private void handleResultIntent(Intent intent) {
        Bundle extras = intent.getExtras();
        if (extras == null) {
            Log.w(TAG, MARKER + "RESULT INTENT HAS NO EXTRAS");
            return;
        }

        String commandIdentifier = extras.getString(EXTRA_COMMAND_IDENTIFIER, "");
        String result = extras.getString(EXTRA_RESULT, "");

        // Determine which command this result is for by checking known keys
        String commandName = detectCommandName(extras);

        Log.i(TAG, "DW result — command: " + commandName
                + ", identifier: " + commandIdentifier
                + ", result: " + result);

        // Build result info string from RESULT_INFO bundle if present
        String resultInfoStr = "";
        Bundle resultInfo = extras.getBundle(EXTRA_RESULT_INFO);
        if (resultInfo != null) {
            StringBuilder sb = new StringBuilder();
            for (String key : resultInfo.keySet()) {
                Object val = resultInfo.get(key);
                if (val != null) {
                    if (sb.length() > 0) sb.append("; ");
                    sb.append(key).append("=").append(val.toString());
                }
            }
            resultInfoStr = sb.toString();
            Log.d(TAG, "DW result info: " + resultInfoStr);
        }

        // Forward to WebView
        JSObject payload = new JSObject();
        payload.put("commandIdentifier", commandIdentifier);
        payload.put("commandName", commandName);
        payload.put("result", result); // "SUCCESS", "FAILURE", or ""
        payload.put("resultInfo", resultInfoStr);
        payload.put("timestamp", System.currentTimeMillis());

        // Include raw extras for debugging
        JSObject rawExtras = new JSObject();
        for (String key : extras.keySet()) {
            Object val = extras.get(key);
            if (val != null) {
                rawExtras.put(key, val.toString());
            }
        }
        payload.put("rawExtras", rawExtras);

        boolean bridgeReady = bridge != null;
        boolean webViewReady = bridgeReady && bridge.getWebView() != null;
        boolean hasResultListeners = hasListeners("datawedge_result");

        Log.i(TAG, MARKER + "SENDING EVENT TO WEBVIEW event=datawedge_result"
                + " bridgeReady=" + bridgeReady
                + " webViewReady=" + webViewReady
                + " hasListeners=" + hasResultListeners);

        notifyListeners("datawedge_result", payload, true);
        Log.i(TAG, MARKER + "EVENT SENT TO WEBVIEW event=datawedge_result command=" + commandName);
    }

    /**
     * Detect which DataWedge API command this result corresponds to.
     * DataWedge puts the command name as an extra key with the result value.
     */
    private String detectCommandName(Bundle extras) {
        // Known DataWedge API command prefixes
        String[] knownCommands = {
            "com.symbol.datawedge.api.ENABLE_DATAWEDGE",
            "com.symbol.datawedge.api.SWITCH_TO_PROFILE",
            "com.symbol.datawedge.api.SCANNER_INPUT_PLUGIN",
            "com.symbol.datawedge.api.SET_CONFIG",
            "com.symbol.datawedge.api.GET_VERSION_INFO",
            "com.symbol.datawedge.api.GET_ACTIVE_PROFILE",
            "com.symbol.datawedge.api.GET_PROFILES_LIST",
        };

        for (String cmd : knownCommands) {
            if (extras.containsKey(cmd)) {
                // Return the short name (after last dot)
                int lastDot = cmd.lastIndexOf('.');
                return lastDot >= 0 ? cmd.substring(lastDot + 1) : cmd;
            }
        }

        // Fallback: list all keys for debugging
        StringBuilder keys = new StringBuilder();
        for (String key : extras.keySet()) {
            if (keys.length() > 0) keys.append(", ");
            keys.append(key);
        }
        Log.w(TAG, "Unknown DW result command. Keys: " + keys.toString());
        return "UNKNOWN";
    }

    /**
     * Send a command to DataWedge API via broadcast intent.
     * Called from JavaScript: DataWedge.sendCommand({ command, parameter })
     *
     * Uses the full API key format: com.symbol.datawedge.api.{COMMAND}
     */
    @PluginMethod
    public void sendCommand(PluginCall call) {
        String command = call.getString("command", "");
        String parameter = call.getString("parameter", "");

        if (command.isEmpty()) {
            call.reject("Command is required");
            return;
        }

        // Build the full API extra key if not already prefixed
        String apiKey = command;
        if (!command.startsWith("com.symbol.datawedge.api.")) {
            apiKey = "com.symbol.datawedge.api." + command;
        }

        String identifier = "eventflow_" + command + "_" + System.currentTimeMillis();

        Intent intent = new Intent();
        intent.setAction(DW_API_ACTION);
        intent.putExtra(apiKey, parameter);
        intent.putExtra("SEND_RESULT", "LAST_RESULT");
        intent.putExtra("COMMAND_IDENTIFIER", identifier);

        getContext().sendBroadcast(intent);
        Log.i(TAG, MARKER + "DATAWEDGE COMMAND BROADCAST SENT apiKey=" + apiKey
                + " parameter=" + parameter + " id=" + identifier);
        Log.d(TAG, "DataWedge command sent: " + apiKey + " = " + parameter
                + " (id: " + identifier + ")");

        // Return the identifier so frontend can correlate results
        JSObject ret = new JSObject();
        ret.put("commandIdentifier", identifier);
        call.resolve(ret);
    }

    /**
     * Check if DataWedge listener is active.
     */
    @PluginMethod
    public void isListening(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("listening", isListening);
        call.resolve(ret);
    }

    @Override
    protected void handleOnDestroy() {
        Log.i(TAG, MARKER + "DATAWEDGE handleOnDestroy");
        stopListening("handleOnDestroy");
    }

    private synchronized void stopListening(String reason) {
        Context ctx = receiverContext;

        if (ctx == null && bridge != null) {
            ctx = resolveReceiverContext(reason);
        }

        if (ctx == null) {
            Log.w(TAG, MARKER + "STOP LISTENING skipped because receiver context was null reason=" + reason);
            scanReceiver = null;
            resultReceiver = null;
            receiverContext = null;
            isListening = false;
            return;
        }

        Log.i(TAG, MARKER + "UNREGISTERING DATAWEDGE RECEIVERS reason=" + reason);

        if (scanReceiver != null && isListening) {
            try {
                ctx.unregisterReceiver(scanReceiver);
                Log.i(TAG, MARKER + "SCAN RECEIVER UNREGISTERED");
            } catch (Exception e) {
                Log.w(TAG, MARKER + "ERROR UNREGISTERING SCAN RECEIVER: " + e.getMessage());
            }
            scanReceiver = null;
        }

        if (resultReceiver != null) {
            try {
                ctx.unregisterReceiver(resultReceiver);
                Log.i(TAG, MARKER + "RESULT RECEIVER UNREGISTERED");
            } catch (Exception e) {
                Log.w(TAG, MARKER + "ERROR UNREGISTERING RESULT RECEIVER: " + e.getMessage());
            }
            resultReceiver = null;
        }

        receiverContext = null;
        isListening = false;
        Log.i(TAG, MARKER + "DATAWEDGE RECEIVERS FULLY STOPPED");
    }

    private Context resolveReceiverContext(String reason) {
        if (bridge == null) {
            Log.e(TAG, MARKER + "BRIDGE IS NULL while resolving receiver context reason=" + reason);
            return null;
        }

        Context baseContext = bridge.getContext();
        Context appContext = baseContext != null ? baseContext.getApplicationContext() : null;
        Context resolvedContext = appContext != null ? appContext : baseContext;

        Log.i(TAG, MARKER + "RESOLVED RECEIVER CONTEXT reason=" + reason
                + " base=" + (baseContext != null ? baseContext.getClass().getName() : "null")
                + " resolved=" + (resolvedContext != null ? resolvedContext.getClass().getName() : "null"));

        return resolvedContext;
    }

    private void logBridgeState(String origin) {
        boolean bridgeReady = bridge != null;
        boolean webViewReady = bridgeReady && bridge.getWebView() != null;
        String contextName = bridgeReady && bridge.getContext() != null
                ? bridge.getContext().getClass().getName()
                : "null";
        String activityName = bridgeReady && bridge.getActivity() != null
                ? bridge.getActivity().getClass().getName()
                : "null";

        Log.i(TAG, MARKER + "BRIDGE STATE @" + origin
                + " bridgeReady=" + bridgeReady
                + " webViewReady=" + webViewReady
                + " activity=" + activityName
                + " context=" + contextName
                + " listening=" + isListening);
    }

    private void dumpExtras(String prefix, Bundle extras) {
        if (extras == null) {
            Log.i(TAG, MARKER + prefix + " EXTRAS: <none>");
            return;
        }

        for (String key : extras.keySet()) {
            Object value = extras.get(key);
            Log.i(TAG, MARKER + prefix + " EXTRA " + key + " = " + value);
        }
    }

    private String getFirstString(Bundle extras, String fallback, String... keys) {
        if (extras == null || keys == null) {
            return fallback;
        }

        for (String key : keys) {
            if (key == null || !extras.containsKey(key)) {
                continue;
            }

            Object value = extras.get(key);
            if (value instanceof String && !((String) value).isEmpty()) {
                return (String) value;
            }

            if (value != null) {
                String asString = value.toString();
                if (!asString.isEmpty()) {
                    return asString;
                }
            }
        }

        return fallback;
    }
}
