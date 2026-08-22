package se.eventflow.scanner;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.zebra.rfid.api3.ENUM_TRANSPORT;
import com.zebra.rfid.api3.HANDHELD_TRIGGER_EVENT_TYPE;
import com.zebra.rfid.api3.InvalidUsageException;
import com.zebra.rfid.api3.OperationFailureException;
import com.zebra.rfid.api3.RFIDReader;
import com.zebra.rfid.api3.RfidEventsListener;
import com.zebra.rfid.api3.RfidReadEvents;
import com.zebra.rfid.api3.RfidStatusEvents;
import com.zebra.rfid.api3.ReaderDevice;
import com.zebra.rfid.api3.Readers;
import com.zebra.rfid.api3.STATUS_EVENT_TYPE;
import com.zebra.rfid.api3.TagData;
import com.zebra.rfid.api3.TriggerInfo;
import com.zebra.rfid.api3.START_TRIGGER_TYPE;
import com.zebra.rfid.api3.STOP_TRIGGER_TYPE;

import java.util.ArrayList;

@CapacitorPlugin(name = "ZebraRfid")
public class ZebraRfidPlugin extends Plugin {

    private static final String TAG = "ZebraRfidPlugin";

    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private Readers readers;
    private RFIDReader rfidReader;
    private ReaderDevice readerDevice;
    private RfidEventHandler rfidEventHandler;

    private boolean readerConnected = false;
    private boolean inventoryRunning = false;
    private String readerModel = "";

    @Override
    public void load() {
        super.load();
        Log.i(TAG, "Zebra RFID plugin loaded");

        try {
            readers = new Readers(getContext(), ENUM_TRANSPORT.SERVICE_SERIAL);
            Log.i(TAG, "Readers initialized");
        } catch (Exception e) {
            Log.e(TAG, "Failed to initialize Readers: " + e.getMessage(), e);
        }
    }

    // ── Internal inventory control (single source of truth) ─────────

    /**
     * Starts RFID inventory. Returns true if inventory was successfully started.
     * Safe to call when already running (no-op, returns true).
     */
    private boolean startInventoryInternal(String caller) {
        if (inventoryRunning) {
            Log.d(TAG, "[" + caller + "] Inventory already running, ignoring");
            return true;
        }

        if (!readerConnected || rfidReader == null) {
            Log.w(TAG, "[" + caller + "] Cannot start inventory: reader not connected");
            return false;
        }

        try {
            rfidReader.Actions.Inventory.perform();
            inventoryRunning = true;
            Log.i(TAG, "[" + caller + "] Inventory STARTED");
            notifyStatus();
            return true;
        } catch (InvalidUsageException | OperationFailureException e) {
            Log.e(TAG, "[" + caller + "] Start inventory failed: " + e.getMessage(), e);
            notifyError("[" + caller + "] Start inventory failed: " + e.getMessage());
            return false;
        } catch (Exception e) {
            Log.e(TAG, "[" + caller + "] Unexpected start inventory error: " + e.getMessage(), e);
            notifyError("[" + caller + "] Start inventory error: " + e.getMessage());
            return false;
        }
    }

    /**
     * Stops RFID inventory. Returns true if inventory was successfully stopped.
     * Safe to call when already stopped (no-op, returns true).
     */
    private boolean stopInventoryInternal(String caller) {
        if (!inventoryRunning) {
            Log.d(TAG, "[" + caller + "] Inventory already stopped, ignoring");
            return true;
        }

        if (rfidReader == null) {
            Log.w(TAG, "[" + caller + "] Reader is null, forcing inventoryRunning=false");
            inventoryRunning = false;
            notifyStatus();
            return true;
        }

        try {
            rfidReader.Actions.Inventory.stop();
            inventoryRunning = false;
            Log.i(TAG, "[" + caller + "] Inventory STOPPED");
            notifyStatus();
            return true;
        } catch (InvalidUsageException | OperationFailureException e) {
            Log.e(TAG, "[" + caller + "] Stop inventory failed: " + e.getMessage(), e);
            // Force state consistent even if SDK call failed
            inventoryRunning = false;
            notifyStatus();
            notifyError("[" + caller + "] Stop inventory failed: " + e.getMessage());
            return false;
        } catch (Exception e) {
            Log.e(TAG, "[" + caller + "] Unexpected stop inventory error: " + e.getMessage(), e);
            inventoryRunning = false;
            notifyStatus();
            notifyError("[" + caller + "] Stop inventory error: " + e.getMessage());
            return false;
        }
    }

    // ── Plugin Methods ──────────────────────────────────────────────

    @PluginMethod
    public void connectReader(PluginCall call) {
        Log.i(TAG, "connectReader() called");

        try {
            if (readers == null) {
                readers = new Readers(getContext(), ENUM_TRANSPORT.SERVICE_SERIAL);
            }

            ArrayList<ReaderDevice> availableReaders = readers.GetAvailableRFIDReaderList();

            if (availableReaders == null || availableReaders.isEmpty()) {
                call.reject("No RFID readers found");
                notifyError("No RFID readers found");
                return;
            }

            readerDevice = availableReaders.get(0);
            rfidReader = readerDevice.getRFIDReader();

            if (rfidReader == null) {
                call.reject("RFID reader object is null");
                notifyError("RFID reader object is null");
                return;
            }

            if (!rfidReader.isConnected()) {
                rfidReader.connect();
            }

            readerModel = readerDevice.getName() != null ? readerDevice.getName() : "Zebra RFID Reader";
            readerConnected = true;

            configureReader();

            if (rfidEventHandler == null) {
                rfidEventHandler = new RfidEventHandler();
            }

            rfidReader.Events.addEventsListener(rfidEventHandler);
            rfidReader.Events.setHandheldEvent(true);
            rfidReader.Events.setTagReadEvent(true);
            rfidReader.Events.setReaderDisconnectEvent(true);
            rfidReader.Events.setAttachTagDataWithReadEvent(false);

            Log.i(TAG, "RFID reader connected: " + readerModel);
            notifyStatus();

            JSObject ret = new JSObject();
            ret.put("connected", true);
            ret.put("inventoryRunning", inventoryRunning);
            ret.put("model", readerModel);
            ret.put("source", "zebra_rfid");
            call.resolve(ret);

        } catch (InvalidUsageException | OperationFailureException e) {
            Log.e(TAG, "Reader connection failed: " + e.getMessage(), e);
            readerConnected = false;
            inventoryRunning = false;
            rfidReader = null;
            call.reject("Reader connection failed: " + e.getMessage());
            notifyError("Reader connection failed: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Unexpected connect error: " + e.getMessage(), e);
            readerConnected = false;
            inventoryRunning = false;
            rfidReader = null;
            call.reject("Unexpected connect error: " + e.getMessage());
            notifyError("Unexpected connect error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void disconnectReader(PluginCall call) {
        Log.i(TAG, "disconnectReader() called");

        try {
            if (rfidReader != null) {
                stopInventoryInternal("disconnectReader");

                if (rfidEventHandler != null) {
                    try {
                        rfidReader.Events.removeEventsListener(rfidEventHandler);
                    } catch (Exception ignored) {
                    }
                }

                if (rfidReader.isConnected()) {
                    rfidReader.disconnect();
                }
            }

            rfidReader = null;
            readerDevice = null;
            readerConnected = false;
            inventoryRunning = false;
            readerModel = "";

            notifyStatus();
            call.resolve();

        } catch (InvalidUsageException | OperationFailureException e) {
            Log.e(TAG, "Disconnect failed: " + e.getMessage(), e);
            call.reject("Disconnect failed: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Unexpected disconnect error: " + e.getMessage(), e);
            call.reject("Unexpected disconnect error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void startInventory(PluginCall call) {
        Log.i(TAG, "startInventory() called via JS");

        if (!readerConnected || rfidReader == null) {
            call.reject("Reader not connected");
            return;
        }

        if (startInventoryInternal("startInventory")) {
            call.resolve();
        } else {
            call.reject("Failed to start inventory");
        }
    }

    @PluginMethod
    public void stopInventory(PluginCall call) {
        Log.i(TAG, "stopInventory() called via JS");

        if (stopInventoryInternal("stopInventory")) {
            call.resolve();
        } else {
            call.reject("Failed to stop inventory");
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

    // ── Reader Configuration ────────────────────────────────────────

    private void configureReader() throws InvalidUsageException, OperationFailureException {
        if (rfidReader == null) return;

        TriggerInfo triggerInfo = new TriggerInfo();
        triggerInfo.StartTrigger.setTriggerType(START_TRIGGER_TYPE.START_TRIGGER_TYPE_IMMEDIATE);
        triggerInfo.StopTrigger.setTriggerType(STOP_TRIGGER_TYPE.STOP_TRIGGER_TYPE_IMMEDIATE);

        rfidReader.Config.setStartTrigger(triggerInfo.StartTrigger);
        rfidReader.Config.setStopTrigger(triggerInfo.StopTrigger);

        try {
            rfidReader.Config.setUniqueTagReport(false);
        } catch (Exception ignored) {
        }
    }

    // ── Event Notifications ─────────────────────────────────────────

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
        payload.put("timestamp", System.currentTimeMillis());
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

    // ── RFID Event Listener ─────────────────────────────────────────

    private class RfidEventHandler implements RfidEventsListener {

        @Override
        public void eventReadNotify(RfidReadEvents e) {
            if (rfidReader == null) return;

            try {
                TagData[] tags = rfidReader.Actions.getReadTags(100);
                if (tags != null) {
                    for (TagData tag : tags) {
                        if (tag != null && tag.getTagID() != null) {
                            final String epc = tag.getTagID();
                            final int rssi = tag.getPeakRSSI();
                            final int antennaId = tag.getAntennaID();

                            mainHandler.post(() -> notifyTagRead(epc, rssi, antennaId, null));
                        }
                    }
                }
            } catch (Exception ex) {
                Log.e(TAG, "Read notify error: " + ex.getMessage(), ex);
            }
        }

        @Override
        public void eventStatusNotify(RfidStatusEvents e) {
            try {
                if (e.StatusEventData.getStatusEventType() == STATUS_EVENT_TYPE.HANDHELD_TRIGGER_EVENT) {
                    HANDHELD_TRIGGER_EVENT_TYPE triggerEvent =
                            e.StatusEventData.HandheldTriggerEventData.getHandheldEvent();

                    if (triggerEvent == HANDHELD_TRIGGER_EVENT_TYPE.HANDHELD_TRIGGER_PRESSED) {
                        Log.i(TAG, "Trigger PRESSED → starting inventory");
                        mainHandler.post(() -> startInventoryInternal("trigger_pressed"));
                    } else if (triggerEvent == HANDHELD_TRIGGER_EVENT_TYPE.HANDHELD_TRIGGER_RELEASED) {
                        Log.i(TAG, "Trigger RELEASED → stopping inventory");
                        mainHandler.post(() -> stopInventoryInternal("trigger_released"));
                    }
                }

                if (e.StatusEventData.getStatusEventType() == STATUS_EVENT_TYPE.DISCONNECTION_EVENT) {
                    Log.w(TAG, "Reader disconnected unexpectedly");
                    mainHandler.post(() -> {
                        readerConnected = false;
                        inventoryRunning = false;
                        rfidReader = null;
                        notifyStatus();
                        notifyError("Reader disconnected unexpectedly");
                    });
                }
            } catch (Exception ex) {
                Log.e(TAG, "Status notify error: " + ex.getMessage(), ex);
            }
        }
    }

    // ── Lifecycle ───────────────────────────────────────────────────

    @Override
    protected void handleOnDestroy() {
        Log.i(TAG, "Plugin destroying, cleaning up");

        if (readerConnected && rfidReader != null) {
            stopInventoryInternal("onDestroy");

            try {
                if (rfidEventHandler != null) {
                    rfidReader.Events.removeEventsListener(rfidEventHandler);
                }
            } catch (Exception ignored) {
            }

            try {
                if (rfidReader.isConnected()) {
                    rfidReader.disconnect();
                }
            } catch (Exception e) {
                Log.w(TAG, "Cleanup disconnect error: " + e.getMessage());
            }
        }

        if (readers != null) {
            try {
                readers.Dispose();
            } catch (Exception ignored) {
            }
            readers = null;
        }

        rfidReader = null;
        readerDevice = null;
        readerConnected = false;
        inventoryRunning = false;
        readerModel = "";
    }
}
