#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Registers the SiteScanMeasure plugin with the Capacitor bridge.
// See SiteScanMeasurePlugin.swift for the implementation.
CAP_PLUGIN(SiteScanMeasurePlugin, "SiteScanMeasure",
    CAP_PLUGIN_METHOD(openMeasure, CAPPluginReturnPromise);
)
