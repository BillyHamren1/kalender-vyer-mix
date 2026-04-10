

## Fix: Restore `CATEGORY_DEFAULT` on scan receiver IntentFilter

### Problem
Line 142 in `DataWedgePlugin.java` creates the scan filter without `addCategory(Intent.CATEGORY_DEFAULT)`. DataWedge broadcasts include `cat=[android.intent.category.DEFAULT]`, so the receiver never matches.

The result receiver (line 170) already has the category — the scan receiver just needs the same treatment.

### Change
**File:** `android/app/src/main/java/se/eventflow/scanner/DataWedgePlugin.java`

Add one line after line 142:

```java
IntentFilter scanFilter = new IntentFilter();
scanFilter.addAction(DW_SCAN_ACTION);
scanFilter.addCategory(Intent.CATEGORY_DEFAULT);  // <-- add this
```

Also add the category to the diagnostic receiver in `MainActivity.java` if it exists without one.

### No other changes
- All `###` diagnostic logs stay
- No action name changes
- No DataWedge profile changes
- No result receiver changes

