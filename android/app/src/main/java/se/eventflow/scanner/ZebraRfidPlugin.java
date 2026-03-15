package se.eventflow.scanner;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;

/**
 * ZebraRfidPlugin — Capacitor plugin for Zebra RFID reader integration.
 *
 * Bridges the Zebra RFID SDK (rfidapi3) to the Capacitor WebView.
 * Designed for RFD4030/RFD40 series sleds paired with TC22.
 *
 * === ZEBRA RFID SDK SETUP ===
 *
 * The Zebra RFID SDK (rfidapi3) is distributed as an AAR file, NOT via Maven.
 * To integrate:
 *
 * 1. Download the SDK from Zebra's developer portal:
 *    https://www.zebra.com/us/en/support-downloads/software/developer-tools/rfid-sdk-for-android.html
 *
 * 2. Copy the AAR file to: android/app/libs/rfidapi3.aar
 *
 * 3. In android/app/build.gradle, add:
 *    repositories {
 *        flatDir { dirs 'libs' }
 *    }
 *    dependencies {
 *        implementation(name: 'rfidapi3', ext: 'aar')
 *    }
 *
 * 4. Sync Gradle
 *
 * Once the SDK is available, uncomment the TODO sections below and replace
 * the stub implementations with real SDK calls.
 *
 * === EVENTS SENT TO WEBVIEW ===
 *
 * "rfid_tag"    — tag read data (epc, rssi, antennaId, etc.)
 * "rfid_status" — reader connection/inventory status changes
 * "rfid_error"  — error messages
 */
@CapacitorPlugin(name = "ZebraRfid")
public class ZebraRfidPlugin extends Plugin {

    private static final String TAG = "ZebraRfidPlugin";

    // === Reader State ===
    private boolean readerConnected = false;
    private boolean inventoryRunning = false;
    private String readerModel = null;

    // Handler for posting events from SDK callbacks to main thread
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    // TODO: Uncomment when Zebra RFID SDK is added
    // import com.zebra.rfid.api3.*;
    // private Readers readers;
    // private RFIDReader rfidReader;
    // private EventHandler rfidEventHandler;

    @Override
    public void load() {
        Log.i(TAG, "ZebraRfidPlugin loaded");
        // TODO: Initialize Zebra RFID SDK Readers list
        // readers = new Readers(getContext(), ENUM_TRANSPORT.SERVICE_SERIAL);
    }

    // ══════════════════════════════════════════════════════════════
    // Plugin Methods (callable from TypeScript)
    // ══════════════════════════════════════════════════════════════

    /**
     * Connect to the RFID reader.
     * Scans for available readers and connects to the first one found.
     */
    @PluginMethod
    public void connectReader(PluginCall call) {
        Log.i(TAG, "connectReader() called");

        if (readerConnected) {
            Log.w(TAG, "Reader already connected");
            JSObject ret = new JSObject();
            ret.put("connected", true);
            ret.put("model", readerModel != null ? readerModel : "unknown");
            call.resolve(ret);
            return;
        }

        // TODO: Replace stub with real Zebra RFID SDK connection
        // ─────────────────────────────────────────────────────────
        // try {
        //     ArrayList<ReaderDevice> availableReaders = readers.GetAvailableRFIDReaderList();
        //     if (availableReaders.isEmpty()) {
        //         call.reject("No RFID readers found");
        //         notifyError("No RFID readers found. Ensure RFD4030 is paired.");
        //         return;
        //     }
        //
        //     ReaderDevice readerDevice = availableReaders.get(0);
        //     rfidReader = readerDevice.getRFIDReader();
        //     rfidReader.connect();
        //
        //     // Configure reader
        //     TriggerInfo triggerInfo = new TriggerInfo();
        //     triggerInfo.StartTrigger.setTriggerType(START_TRIGGER_TYPE.START_TRIGGER_TYPE_IMMEDIATE);
        //     triggerInfo.StopTrigger.setTriggerType(STOP_TRIGGER_TYPE.STOP_TRIGGER_TYPE_IMMEDIATE);
        //     rfidReader.Config.setTriggerMode(ENUM_TRIGGER_MODE.RFID_MODE, true);
        //     rfidReader.Config.setStartTrigger(triggerInfo.StartTrigger);
        //     rfidReader.Config.setStopTrigger(triggerInfo.StopTrigger);
        //
        //     // Register event handler
        //     rfidEventHandler = new RfidEventHandler();
        //     rfidReader.Events.addEventsListener(rfidEventHandler);
        //     rfidReader.Events.setHandheldEvent(true);
        //     rfidReader.Events.setTagReadEvent(true);
        //     rfidReader.Events.setAttachTagDataWithReadEvent(true);
        //
        //     readerConnected = true;
        //     readerModel = readerDevice.getName();
        //
        //     Log.i(TAG, "Connected to reader: " + readerModel);
        //     notifyStatus();
        //
        //     JSObject ret = new JSObject();
        //     ret.put("connected", true);
        //     ret.put("model", readerModel);
        //     call.resolve(ret);
        //
        // } catch (InvalidUsageException | OperationFailureException e) {
        //     Log.e(TAG, "Failed to connect: " + e.getMessage(), e);
        //     call.reject("Connection failed: " + e.getMessage());
        //     notifyError("Connection failed: " + e.getMessage());
        // }
        // ─────────────────────────────────────────────────────────

        // STUB: resolve with not-connected until SDK is wired
        Log.w(TAG, "Zebra RFID SDK not integrated yet — connectReader is a stub");
        call.reject("Zebra RFID SDK not yet integrated. See ZebraRfidPlugin.java for setup instructions.");
        notifyError("RFID SDK not integrated. Follow setup instructions in ZebraRfidPlugin.java.");
    }

    /**
     * Disconnect from the RFID reader.
     */
    @PluginMethod
    public void disconnectReader(PluginCall call) {
        Log.i(TAG, "disconnectReader() called");

        if (!readerConnected) {
            call.resolve();
            return;
        }

        // TODO: Replace with real SDK disconnect
        // ─────────────────────────────────────────────────────────
        // try {
        //     if (inventoryRunning) {
        //         rfidReader.Actions.Inventory.stop();
        //         inventoryRunning = false;
        //     }
        //     rfidReader.Events.removeEventsListener(rfidEventHandler);
        //     rfidReader.disconnect();
        //     rfidReader = null;
        //     readerConnected = false;
        //     readerModel = null;
        //     Log.i(TAG, "Reader disconnected");
        //     notifyStatus();
        //     call.resolve();
        // } catch (Exception e) {
        //     Log.e(TAG, "Disconnect error: " + e.getMessage(), e);
        //     call.reject("Disconnect failed: " + e.getMessage());
        // }
        // ─────────────────────────────────────────────────────────

        readerConnected = false;
        readerModel = null;
        inventoryRunning = false;
        notifyStatus();
        call.resolve();
    }

    /**
     * Start RFID inventory (continuous tag reading).
     */
    @PluginMethod
    public void startInventory(PluginCall call) {
        Log.i(TAG, "startInventory() called");

        if (!readerConnected) {
            call.reject("Reader not connected");
            return;
        }

        if (inventoryRunning) {
            Log.w(TAG, "Inventory already running");
            call.resolve();
            return;
        }

        // TODO: Replace with real SDK inventory start
        // ─────────────────────────────────────────────────────────
        // try {
        //     rfidReader.Actions.Inventory.perform();
        //     inventoryRunning = true;
        //     Log.i(TAG, "Inventory started");
        //     notifyStatus();
        //     call.resolve();
        // } catch (InvalidUsageException | OperationFailureException e) {
        //     Log.e(TAG, "Start inventory failed: " + e.getMessage(), e);
        //     call.reject("Start inventory failed: " + e.getMessage());
        //     notifyError("Start inventory failed: " + e.getMessage());
        // }
        // ─────────────────────────────────────────────────────────

        call.reject("RFID SDK not integrated");
    }

    /**
     * Stop RFID inventory.
     */
    @PluginMethod
    public void stopInventory(PluginCall call) {
        Log.i(TAG, "stopInventory() called");

        if (!inventoryRunning) {
            call.resolve();
            return;
        }

        // TODO: Replace with real SDK inventory stop
        // ─────────────────────────────────────────────────────────
        // try {
        //     rfidReader.Actions.Inventory.stop();
        //     inventoryRunning = false;
        //     Log.i(TAG, "Inventory stopped");
        //     notifyStatus();
        //     call.resolve();
        // } catch (InvalidUsageException | OperationFailureException e) {
        //     Log.e(TAG, "Stop inventory failed: " + e.getMessage(), e);
        //     call.reject("Stop inventory failed: " + e.getMessage());
        // }
        // ─────────────────────────────────────────────────────────

        inventoryRunning = false;
        notifyStatus();
        call.resolve();
    }

    /**
     * Get current reader status.
     */
    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("connected", readerConnected);
        ret.put("inventoryRunning", inventoryRunning);
        ret.put("model", readerModel != null ? readerModel : "");
        ret.put("source", "zebra_rfid");

        // TODO: Add battery/temperature from SDK
        // ─────────────────────────────────────────────────────────
        // if (readerConnected && rfidReader != null) {
        //     try {
        //         ret.put("batteryLevel", rfidReader.Config.getDeviceStatus(BATTERY_EVENT, LED_EVENT, POWER_EVENT)...);
        //     } catch (Exception ignored) {}
        // }
        // ─────────────────────────────────────────────────────────

        call.resolve(ret);
    }

    // ══════════════════════════════════════════════════════════════
    // Event Helpers — send events to WebView
    // ══════════════════════════════════════════════════════════════

    /**
     * Send a tag read event to the web layer.
     * Called from the SDK event handler when tags are read.
     */
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

    /**
     * Send reader status to the web layer.
     */
    private void notifyStatus() {
        JSObject payload = new JSObject();
        payload.put("connected", readerConnected);
        payload.put("inventoryRunning", inventoryRunning);
        payload.put("model", readerModel != null ? readerModel : "");
        payload.put("source", "zebra_rfid");

        notifyListeners("rfid_status", payload);
        Log.d(TAG, "Status event sent: connected=" + readerConnected + ", inventory=" + inventoryRunning);
    }

    /**
     * Send error to the web layer.
     */
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
    //
    // TODO: Uncomment when Zebra RFID SDK is added to the project
    //
    // private class RfidEventHandler implements RfidEventsListener {
    //
    //     @Override
    //     public void eventReadNotify(RfidReadEvents e) {
    //         TagData[] tags = rfidReader.Actions.getReadTags(100);
    //         if (tags == null) return;
    //
    //         for (TagData tag : tags) {
    //             String epc = tag.getTagID();
    //             int rssi = tag.getPeakRSSI();
    //             int antenna = tag.getAntennaID();
    //
    //             // Post to main thread for Capacitor event dispatch
    //             mainHandler.post(() -> {
    //                 notifyTagRead(epc, rssi, antenna, null);
    //             });
    //         }
    //     }
    //
    //     @Override
    //     public void eventStatusNotify(RfidStatusEvents e) {
    //         StatusData statusData = e.StatusEventData;
    //
    //         if (statusData.getStatusEventType() == STATUS_EVENT_TYPE.HANDHELD_TRIGGER_EVENT) {
    //             HANDHELD_TRIGGER_EVENT_TYPE triggerEvent =
    //                     statusData.HandheldTriggerEventData.getHandheldEvent();
    //
    //             if (triggerEvent == HANDHELD_TRIGGER_EVENT_TYPE.HANDHELD_TRIGGER_PRESSED) {
    //                 Log.d(TAG, "Trigger pressed");
    //                 // Inventory is handled by the trigger in RFID_MODE
    //             } else if (triggerEvent == HANDHELD_TRIGGER_EVENT_TYPE.HANDHELD_TRIGGER_RELEASED) {
    //                 Log.d(TAG, "Trigger released");
    //             }
    //         }
    //
    //         if (statusData.getStatusEventType() == STATUS_EVENT_TYPE.DISCONNECTION_EVENT) {
    //             Log.w(TAG, "Reader disconnected unexpectedly");
    //             mainHandler.post(() -> {
    //                 readerConnected = false;
    //                 inventoryRunning = false;
    //                 notifyStatus();
    //                 notifyError("Reader disconnected unexpectedly");
    //             });
    //         }
    //     }
    // }

    @Override
    protected void handleOnDestroy() {
        Log.i(TAG, "Plugin destroying, cleaning up");
        // TODO: Disconnect reader on destroy
        // if (readerConnected && rfidReader != null) {
        //     try {
        //         if (inventoryRunning) rfidReader.Actions.Inventory.stop();
        //         rfidReader.disconnect();
        //     } catch (Exception e) {
        //         Log.w(TAG, "Cleanup error: " + e.getMessage());
        //     }
        // }
        // if (readers != null) {
        //     readers.Dispose();
        //     readers = null;
        // }
        readerConnected = false;
        inventoryRunning = false;
    }
}
