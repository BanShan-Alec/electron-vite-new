// BLE Device interface
export interface BleDevice {
  id: string
  name: string
  address: string
  rssi: number
  connectable: boolean
}

// Scan result interface
export interface ScanResult {
  success: boolean
  error?: string
}

// BLE API interface for renderer
export interface BleApi {
  getState: () => Promise<string>
  startScan: () => Promise<ScanResult>
  stopScan: () => Promise<ScanResult>
  onDeviceFound: (callback: (device: BleDevice) => void) => () => void
  onStateChange: (callback: (state: string) => void) => () => void
}
