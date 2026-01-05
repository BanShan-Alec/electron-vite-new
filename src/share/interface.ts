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

// Battery level result interface
export interface BatteryResult {
  success: boolean
  level?: number // Battery percentage 0-100
  error?: string
}

// Connection result interface
export interface ConnectResult {
  success: boolean
  error?: string
}

// Connection state interface
export interface ConnectionState {
  connected: boolean
  deviceId: string | null
  reason?: string // Disconnect reason (e.g., "connectionTimeout", "powered off")
}

// Device lost event interface
export interface DeviceLostEvent {
  deviceId: string
}

// BLE API interface for renderer
export interface BleApi {
  getState: () => Promise<string>
  startScan: () => Promise<ScanResult>
  stopScan: () => Promise<ScanResult>
  connectAndGetBattery: (deviceId: string) => Promise<BatteryResult>
  disconnect: () => Promise<ConnectResult>
  getConnectedDeviceId: () => Promise<string | null>
  onDeviceFound: (callback: (device: BleDevice) => void) => () => void
  onDeviceLost: (callback: (event: DeviceLostEvent) => void) => () => void
  onStateChange: (callback: (state: string) => void) => () => void
  onConnectionStateChange: (callback: (state: ConnectionState) => void) => () => void
}
