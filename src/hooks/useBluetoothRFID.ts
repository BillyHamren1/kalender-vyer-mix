import { useState, useEffect, useCallback, useRef } from 'react';

// Type declarations for Web Bluetooth API
declare global {
  interface Navigator {
    bluetooth?: {
      requestDevice(options: RequestDeviceOptions): Promise<BluetoothDeviceWeb>;
    };
  }
  
  interface RequestDeviceOptions {
    acceptAllDevices?: boolean;
    optionalServices?: string[];
  }
  
  interface BluetoothDeviceWeb {
    id: string;
    name?: string;
    gatt?: BluetoothRemoteGATTServerWeb;
    addEventListener(type: string, listener: EventListener): void;
  }
  
  interface BluetoothRemoteGATTServerWeb {
    connect(): Promise<BluetoothRemoteGATTServerWeb>;
    getPrimaryService(service: string): Promise<BluetoothRemoteGATTServiceWeb>;
  }
  
  interface BluetoothRemoteGATTServiceWeb {
    getCharacteristic(characteristic: string): Promise<BluetoothRemoteGATTCharacteristicWeb>;
  }
  
  interface BluetoothRemoteGATTCharacteristicWeb {
    startNotifications(): Promise<BluetoothRemoteGATTCharacteristicWeb>;
    stopNotifications(): Promise<BluetoothRemoteGATTCharacteristicWeb>;
    addEventListener(type: string, listener: EventListener): void;
    value?: DataView;
  }
}

export interface BluetoothDevice {
  id: string;
  name: string;
}

export interface BluetoothRFIDState {
  isSupported: boolean;
  isConnecting: boolean;
  isConnected: boolean;
  connectedDevice: BluetoothDevice | null;
  availableDevices: BluetoothDevice[];
  lastScannedValue: string | null;
  error: string | null;
}

export const useBluetoothRFID = (onScan: (value: string) => void) => {
  const [state, setState] = useState<BluetoothRFIDState>({
    isSupported: false,
    isConnecting: false,
    isConnected: false,
    connectedDevice: null,
    availableDevices: [],
    lastScannedValue: null,
    error: null
  });

  const deviceRef = useRef<BluetoothDevice | null>(null);
  const characteristicRef = useRef<BluetoothRemoteGATTCharacteristicWeb | null>(null);
  
  // Buffer for HID keyboard input (many RFID scanners work in HID mode)
  const inputBufferRef = useRef<string>('');
  const inputTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check if Web Bluetooth is supported
  useEffect(() => {
    const isSupported = 'bluetooth' in navigator;
    setState(prev => ({ ...prev, isSupported }));
  }, []);

  // Handle keyboard input from HID RFID scanner
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if input is from a fast source (like a scanner)
      // Scanners typically send characters very quickly followed by Enter
      
      if (inputTimeoutRef.current) {
        clearTimeout(inputTimeoutRef.current);
      }

      if (event.key === 'Enter') {
        // End of scan - process the buffer
        const scannedValue = inputBufferRef.current.trim();
        if (scannedValue.length > 3) { // Minimum length for valid scan
          setState(prev => ({ ...prev, lastScannedValue: scannedValue }));
          onScan(scannedValue);
        }
        inputBufferRef.current = '';
      } else if (event.key.length === 1) {
        // Add character to buffer
        inputBufferRef.current += event.key;
        
        // Set timeout to clear buffer if no more input
        inputTimeoutRef.current = setTimeout(() => {
          inputBufferRef.current = '';
        }, 100); // 100ms timeout between characters
      }
    };

    // Only listen when component is mounted
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (inputTimeoutRef.current) {
        clearTimeout(inputTimeoutRef.current);
      }
    };
  }, [onScan]);

  // Scan for Bluetooth devices
  const scanForDevices = useCallback(async () => {
    if (!state.isSupported) {
      setState(prev => ({ ...prev, error: 'Bluetooth stöds inte i denna enhet' }));
      return;
    }

    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      // Request device with optional services for serial communication
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['battery_service', '0000ffe0-0000-1000-8000-00805f9b34fb'] // Common RFID service UUID
      });

      if (device) {
        const btDevice: BluetoothDevice = {
          id: device.id,
          name: device.name || 'Okänd enhet'
        };
        
        setState(prev => ({
          ...prev,
          availableDevices: [...prev.availableDevices.filter(d => d.id !== device.id), btDevice],
          isConnecting: false
        }));

        return btDevice;
      }
    } catch (error: any) {
      if (error.name !== 'NotFoundError') { // User cancelled
        setState(prev => ({
          ...prev,
          error: `Kunde inte söka enheter: ${error.message}`,
          isConnecting: false
        }));
      } else {
        setState(prev => ({ ...prev, isConnecting: false }));
      }
    }
  }, [state.isSupported]);

  // Connect to a specific device
  const connectToDevice = useCallback(async (deviceId?: string) => {
    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      // Request device directly (this will show the device picker)
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['0000ffe0-0000-1000-8000-00805f9b34fb']
      });

      if (!device) {
        setState(prev => ({ ...prev, isConnecting: false }));
        return;
      }

      // Connect to GATT server
      const server = await device.gatt?.connect();
      
      if (!server) {
        throw new Error('Kunde inte ansluta till enheten');
      }

      const btDevice: BluetoothDevice = {
        id: device.id,
        name: device.name || 'RFID Scanner'
      };

      deviceRef.current = btDevice;

      // Try to get the characteristic for receiving data
      try {
        const service = await server.getPrimaryService('0000ffe0-0000-1000-8000-00805f9b34fb');
        const characteristic = await service.getCharacteristic('0000ffe1-0000-1000-8000-00805f9b34fb');
        
        characteristicRef.current = characteristic;

        // Start notifications
        await characteristic.startNotifications();
        characteristic.addEventListener('characteristicvaluechanged', (event: any) => {
          const value = new TextDecoder().decode(event.target.value);
          const trimmedValue = value.trim();
          if (trimmedValue) {
            setState(prev => ({ ...prev, lastScannedValue: trimmedValue }));
            onScan(trimmedValue);
          }
        });
      } catch (serviceError) {
        console.log('GATT service not available, using HID mode');
        // Device might work in HID keyboard mode instead
      }

      setState(prev => ({
        ...prev,
        isConnected: true,
        isConnecting: false,
        connectedDevice: btDevice
      }));

      // Handle disconnection
      device.addEventListener('gattserverdisconnected', () => {
        setState(prev => ({
          ...prev,
          isConnected: false,
          connectedDevice: null
        }));
        deviceRef.current = null;
        characteristicRef.current = null;
      });

    } catch (error: any) {
      if (error.name !== 'NotFoundError') {
        setState(prev => ({
          ...prev,
          error: `Anslutningsfel: ${error.message}`,
          isConnecting: false
        }));
      } else {
        setState(prev => ({ ...prev, isConnecting: false }));
      }
    }
  }, [onScan]);

  // Disconnect from current device
  const disconnect = useCallback(() => {
    if (characteristicRef.current) {
      characteristicRef.current.stopNotifications().catch(() => {});
    }
    
    deviceRef.current = null;
    characteristicRef.current = null;

    setState(prev => ({
      ...prev,
      isConnected: false,
      connectedDevice: null,
      lastScannedValue: null
    }));
  }, []);

  return {
    ...state,
    scanForDevices,
    connectToDevice,
    disconnect
  };
};
