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
 * DataWedge must be configured on the Zebra device with:
 *   - Intent output enabled
 *   - Intent action: se.eventflow.scanner.SCAN
 *   - Intent delivery: Broadcast
 *   - Keystroke output: DISABLED
 */
@CapacitorPlugin(name = "DataWedge")
public class DataWedgePlugin extends Plugin {

    private static final String TAG = "DataWedgePlugin";

    // Intent action configured in DataWedge profile
    private static final String DW_SCAN_ACTION = "se.eventflow.scanner.SCAN";

    // Standard DataWedge extras
    private static final String EXTRA_DATA_STRING = "com.symbol.datawedge.data_string";
    private static final String EXTRA_LABEL_TYPE = "com.symbol.datawedge.label_type";
    private static final String EXTRA_SOURCE = "com.symbol.datawedge.source";

    // DataWedge API action (for sending commands to DataWedge)
    private static final String DW_API_ACTION = "com.symbol.datawedge.api.ACTION";

    private BroadcastReceiver scanReceiver;
    private boolean isListening = false;

    @Override
    public void load() {
        Log.d(TAG, "DataWedgePlugin loaded");
        startListening();
    }

    /**
     * Start listening for DataWedge scan broadcasts.
     */
    private void startListening() {
        if (isListening) {
            Log.w(TAG, "Already listening for DataWedge intents");
            return;
        }

        scanReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getAction();
                Log.d(TAG, "Broadcast received, action: " + action);

                if (DW_SCAN_ACTION.equals(action)) {
                    handleScanIntent(intent);
                }
            }
        };

        IntentFilter filter = new IntentFilter();
        filter.addAction(DW_SCAN_ACTION);
        filter.addCategory(Intent.CATEGORY_DEFAULT);

        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ctx.registerReceiver(scanReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            ctx.registerReceiver(scanReceiver, filter);
        }

        isListening = true;
        Log.i(TAG, "DataWedge listener registered for action: " + DW_SCAN_ACTION);
    }

    /**
     * Process an incoming DataWedge scan intent and forward to WebView.
     */
    private void handleScanIntent(Intent intent) {
        Bundle extras = intent.getExtras();
        if (extras == null) {
            Log.w(TAG, "Scan intent has no extras");
            return;
        }

        String barcode = extras.getString(EXTRA_DATA_STRING, "");
        String labelType = extras.getString(EXTRA_LABEL_TYPE, "UNKNOWN");
        String source = extras.getString(EXTRA_SOURCE, "scanner");

        if (barcode.isEmpty()) {
            Log.w(TAG, "Scan intent has empty barcode data");
            return;
        }

        Log.i(TAG, "Scan received — barcode: " + barcode + ", symbology: " + labelType);

        JSObject payload = new JSObject();
        payload.put("data", barcode);
        payload.put("symbology", labelType);
        payload.put("source", "zebra_datawedge");
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

        notifyListeners("datawedge_scan", payload);
        Log.d(TAG, "Event 'datawedge_scan' sent to WebView");
    }

    /**
     * Send a command to DataWedge API via broadcast intent.
     * Called from JavaScript: DataWedge.sendCommand({ command, parameter })
     */
    @PluginMethod
    public void sendCommand(PluginCall call) {
        String command = call.getString("command", "");
        String parameter = call.getString("parameter", "");

        if (command.isEmpty()) {
            call.reject("Command is required");
            return;
        }

        Intent intent = new Intent();
        intent.setAction(DW_API_ACTION);
        intent.putExtra(command, parameter);
        intent.putExtra("SEND_RESULT", "LAST_RESULT");
        intent.putExtra("COMMAND_IDENTIFIER", "eventflow_scanner_" + System.currentTimeMillis());

        getContext().sendBroadcast(intent);
        Log.d(TAG, "DataWedge command sent: " + command + " = " + parameter);

        call.resolve();
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
        if (scanReceiver != null && isListening) {
            try {
                getContext().unregisterReceiver(scanReceiver);
                Log.i(TAG, "DataWedge listener unregistered");
            } catch (Exception e) {
                Log.w(TAG, "Error unregistering receiver: " + e.getMessage());
            }
            scanReceiver = null;
            isListening = false;
        }
    }
}
