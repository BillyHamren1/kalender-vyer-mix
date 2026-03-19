package se.eventflow.scanner;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;

import com.zebra.rfid.api3.*;

import java.util.ArrayList;

/**
 * ZebraRfidPlugin — Capacitor plugin for Zebra RFID reader integration.
 *
 * Bridges the Zebra RFID SDK (rfidapi3) to the Capacitor WebView.
 * Designed for RFD4030/RFD40 series sleds paired with TC22.
 *
 * === SETUP ===
 * 1. Place rfidapi3.aar in android/app/libs/
 * 2. In android/app/build.gradle add:
 *      repositories { flatDir { dirs 'libs' } }
 *      dependencies { implementation(name: 'rfidapi3', ext: 'aar') }
 * 3. npx cap sync android && build
 */
@CapacitorPlugin(name = "ZebraRfid")
public class ZebraRfidPlugin extends Plugin {

    private static final String TAG = "ZebraRfidPlugin";

    // === Reader State ===
    private boolean readerConnected = false;
    private boolean inventoryRunning = false;
    private String readerModel = null;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    // Zebra RFID SDK objects
    private Readers readers;
    private RFIDReader rfidReader;
    private RfidEventHandler rfidEventHandler;

    @Override
    public void load() {
        Log.i(TAG, "ZebraRfidPlugin loaded — initializing Readers");
        try {
            readers = new Readers(getContext(), ENUM_TRANSPORT.SERVICE_SERIAL);
            Log.i(TAG, "Readers instance created (SERVICE_SERIAL)");
        } catch (Exception e) {
            Log.e(TAG, "Failed to create Readers instance: " + e.getMessage(), e);
            // Try Bluetooth transport as fallback
            try {
                readers = new Readers(getContext(), ENUM_TRANSPORT.BLUETOOTH);
                Log.i(TAG, "Readers instance created (BLUETOOTH fallback)");
            } catch (Exception e2) {
                Log.e(TAG, "Failed to create Readers with BLUETOOTH: " + e2.getMessage(), e2);
            }
        }
    }

    // ══════════════════════════════════════════════════════════════
    // Plugin Methods (callable from TypeScript)
    // ══════════════════════════════════════════════════════════════

    @PluginMethod
    public void connectReader(PluginCall call) {
        Log.i(TAG, "connectReader() called");

        if (readerConnected && rfidReader != null) {
            Log.w(TAG, "Reader already connected");
            JSObject ret = new JSObject();
            ret.put("connected", true);
            ret.put("model", readerModel != null ? readerModel : "unknown");
            call.resolve(ret);
            return;
        }

        if (readers == null) {
            call.reject("Readers not initialized. Zebra RFID SDK may not be available.");
            notifyError("Readers not initialized");
            return;
        }

        // Run connection on background thread to avoid ANR
        new Thread(() -> {
            try {
                ArrayList<ReaderDevice> availableReaders = readers.GetAvailableRFIDReaderList();

                if (availableReaders == null || availableReaders.isEmpty()) {
                    mainHandler.post(() -> {
                        call.reject("No RFID readers found");
                        notifyError("No RFID readers found. Ensure RFD is paired via Bluetooth.");
                    });
                    return;
                }

                ReaderDevice readerDevice = availableReaders.get(0);
                rfidReader = readerDevice.getRFIDReader();

                Log.i(TAG, "Connecting to: " + readerDevice.getName());
                rfidReader.connect();

                // Configure reader for immediate trigger mode
                TriggerInfo triggerInfo = new TriggerInfo();
                triggerInfo.StartTrigger.setTriggerType(START_TRIGGER_TYPE.START_TRIGGER_TYPE_IMMEDIATE);
                triggerInfo.StopTrigger.setTriggerType(STOP_TRIGGER_TYPE.STOP_TRIGGER_TYPE_IMMEDIATE);
                rfidReader.Config.setTriggerMode(ENUM_TRIGGER_MODE.RFID_MODE, true);
                rfidReader.Config.setStartTrigger(triggerInfo.StartTrigger);
                rfidReader.Config.setStopTrigger(triggerInfo.StopTrigger);

                // Register event handler
                rfidEventHandler = new RfidEventHandler();
                rfidReader.Events.addEventsListener(rfidEventHandler);
                rfidReader.Events.setHandheldEvent(true);
                rfidReader.Events.setTagReadEvent(true);
                rfidReader.Events.setAttachTagDataWithReadEvent(true);

                readerConnected = true;
                readerModel = readerDevice.getName();

                Log.i(TAG, "Connected to reader: " + readerModel);

                mainHandler.post(() -> {
                    notifyStatus();
                    JSObject ret = new JSObject();
                    ret.put("connected", true);
                    ret.put("model", readerModel);
                    call.resolve(ret);
                });

            } catch (InvalidUsageException e) {
                Log.e(TAG, "Invalid usage: " + e.getMessage(), e);
                mainHandler.post(() -> {
                    call.reject("Connection failed: " + e.getMessage());
                    notifyError("Connection failed: " + e.getMessage());
                });
            } catch (OperationFailureException e) {
                Log.e(TAG, "Operation failed: " + e.getMessage(), e);
                mainHandler.post(() -> {
                    call.reject("Connection failed: " + e.getMessage());
                    notifyError("Connection failed: " + e.getMessage());
                });
            } catch (Exception e) {
                Log.e(TAG, "Unexpected error connecting: " + e.getMessage(), e);
                mainHandler.post(() -> {
                    call.reject("Connection failed: " + e.getMessage());
                    notifyError("Connection failed: " + e.getMessage());
                });
            }
        }).start();
    }

    @PluginMethod
    public void disconnectReader(PluginCall call) {
        Log.i(TAG, "disconnectReader() called");

        if (!readerConnected || rfidReader == null) {
            readerConnected = false;
            readerModel = null;
            inventoryRunning = false;
            call.resolve();
            return;
        }

        try {
            if (inventoryRunning) {
                rfidReader.Actions.Inventory.stop();
                inventoryRunning = false;
            }
            if (rfidEventHandler != null) {
                rfidReader.Events.removeEventsListener(rfidEventHandler);
            }
            rfidReader.disconnect();
            rfidReader = null;
            readerConnected = false;
            readerModel = null;
            Log.i(TAG, "Reader disconnected");
            notifyStatus();
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "Disconnect error: " + e.getMessage(), e);
            // Force state reset even on error
            readerConnected = false;
            readerModel = null;
            inventoryRunning = false;
            rfidReader = null;
            notifyStatus();
            call.reject("Disconnect failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void startInventory(PluginCall call) {
        Log.i(TAG, "startInventory() called");

        if (!readerConnected || rfidReader == null) {
            call.reject("Reader not connected");
            return;
        }

        if (inventoryRunning) {
            Log.w(TAG, "Inventory already running");
            call.resolve();
            return;
        }

        try {
            rfidReader.Actions.Inventory.perform();
            inventoryRunning = true;
            Log.i(TAG, "Inventory started");
            notifyStatus();
            call.resolve();
        } catch (InvalidUsageException | OperationFailureException e) {
            Log.e(TAG, "Start inventory failed: " + e.getMessage(), e);
            call.reject("Start inventory failed: " + e.getMessage());
            notifyError("Start inventory failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopInventory(PluginCall call) {
        Log.i(TAG, "stopInventory() called");

        if (!inventoryRunning || rfidReader == null) {
            inventoryRunning = false;
            call.resolve();
            return;
        }

        try {
            rfidReader.Actions.Inventory.stop();
            inventoryRunning = false;
            Log.i(TAG, "Inventory stopped");
            notifyStatus();
            call.resolve();
        } catch (InvalidUsageException | OperationFailureException e) {
            Log.e(TAG, "Stop inventory failed: " + e.getMessage(), e);
            call.reject("Stop inventory failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("connected", readerConnected);
        ret.put("inventoryRunning", inventoryRunning);
        ret.put("model", readerModel != null ? readerModel : "");
        ret.put("source", "zebra_rfid");
        call.resolve(ret);
    }

    // ══════════════════════════════════════════════════════════════
    // Event Helpers
    // ══════════════════════════════════════════════════════════════

    private void notifyTagRead(String epc, int rssi, int antennaId, String rawData) {
        JSObject payload = new JSObject();
        payload.put("epc", epc);
        payload.put("rssi", rssi);
        payload.put("antennaId", antennaId);
        payload.put("source", "zebra_rfid");
        payload.put("timestamp", System.currentTimeMillis());
        if (rawData != null) {
            payload.put("rawData", rawData);
        }
        notifyListeners("rfid_tag", payload);
        Log.d(TAG, "Tag event sent: " + epc + " (RSSI: " + rssi + ")");
    }

    private void notifyStatus() {
        JSObject payload = new JSObject();
        payload.put("connected", readerConnected);
        payload.put("inventoryRunning", inventoryRunning);
        payload.put("model", readerModel != null ? readerModel : "");
        payload.put("source", "zebra_rfid");
        notifyListeners("rfid_status", payload);
        Log.d(TAG, "Status event sent: connected=" + readerConnected + ", inventory=" + inventoryRunning);
    }

    private void notifyError(String message) {
        JSObject payload = new JSObject();
        payload.put("error", message);
        payload.put("source", "zebra_rfid");
        payload.put("timestamp", System.currentTimeMillis());
        notifyListeners("rfid_error", payload);
        Log.e(TAG, "Error event sent: " + message);
    }

    // ══════════════════════════════════════════════════════════════
    // Zebra RFID SDK Event Handler
    // ══════════════════════════════════════════════════════════════

    private class RfidEventHandler implements RfidEventsListener {

        @Override
        public void eventReadNotify(RfidReadEvents e) {
            TagData[] tags = rfidReader.Actions.getReadTags(100);
            if (tags == null) return;

            for (TagData tag : tags) {
                String epc = tag.getTagID();
                int rssi = tag.getPeakRSSI();
                int antenna = tag.getAntennaID();

                mainHandler.post(() -> {
                    notifyTagRead(epc, rssi, antenna, null);
                });
            }
        }

        @Override
        public void eventStatusNotify(RfidStatusEvents e) {
            StatusData statusData = e.StatusEventData;

            if (statusData.getStatusEventType() == STATUS_EVENT_TYPE.HANDHELD_TRIGGER_EVENT) {
                HANDHELD_TRIGGER_EVENT_TYPE triggerEvent =
                        statusData.HandheldTriggerEventData.getHandheldEvent();

                if (triggerEvent == HANDHELD_TRIGGER_EVENT_TYPE.HANDHELD_TRIGGER_PRESSED) {
                    Log.d(TAG, "Trigger pressed");
                } else if (triggerEvent == HANDHELD_TRIGGER_EVENT_TYPE.HANDHELD_TRIGGER_RELEASED) {
                    Log.d(TAG, "Trigger released");
                }
            }

            if (statusData.getStatusEventType() == STATUS_EVENT_TYPE.DISCONNECTION_EVENT) {
                Log.w(TAG, "Reader disconnected unexpectedly");
                mainHandler.post(() -> {
                    readerConnected = false;
                    inventoryRunning = false;
                    rfidReader = null;
                    notifyStatus();
                    notifyError("Reader disconnected unexpectedly");
                });
            }
        }
    }

    @Override
    protected void handleOnDestroy() {
        Log.i(TAG, "Plugin destroying, cleaning up");
        if (readerConnected && rfidReader != null) {
            try {
                if (inventoryRunning) rfidReader.Actions.Inventory.stop();
                if (rfidEventHandler != null) rfidReader.Events.removeEventsListener(rfidEventHandler);
                rfidReader.disconnect();
            } catch (Exception e) {
                Log.w(TAG, "Cleanup error: " + e.getMessage());
            }
        }
        if (readers != null) {
            readers.Dispose();
            readers = null;
        }
        rfidReader = null;
        readerConnected = false;
        inventoryRunning = false;
    }
}
