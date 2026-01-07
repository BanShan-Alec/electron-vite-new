import { BrowserWindow } from 'electron'
import noble, { Peripheral } from '@stoprocent/noble'
import type { BleDevice, BatteryResult } from '../share/interface'
import { BleDeviceFSM, Sp51aDeviceFSM, BleDeviceState } from './fsm'

// Device disappear timeout (ms)
const DEVICE_LOST_TIMEOUT = 5000
// Check interval for device presence (ms)
const DEVICE_CHECK_INTERVAL = 1000

/**
 * Factory function to create device-specific FSM
 */
function createDeviceFSM(peripheral: Peripheral): BleDeviceFSM | undefined {
  const name = peripheral.advertisement.localName?.toLowerCase() || ''

  // Create SP51A specific FSM for SP51A devices
  if (name.includes('sp51')) {
    console.log(`[BLE] Creating Sp51aDeviceFSM for ${peripheral.advertisement.localName}`)
    return new Sp51aDeviceFSM(peripheral.id)
  }
  return undefined
}

/**
 * BLE Service - manages device discovery and connection using FSM
 */
export class BleService {
  private isScanning = false
  private mainWindow: BrowserWindow | null = null

  // Device FSM instances (one per device)
  private deviceFSMs: Map<string, BleDeviceFSM> = new Map()

  // Currently active/connected device
  private activeDeviceId: string | null = null

  // Device presence check timer
  private deviceCheckTimer: NodeJS.Timeout | null = null

  constructor() {
    this.setupNobleListeners()
  }

  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window
  }

  private setupNobleListeners(): void {
    // Listen for Bluetooth state changes
    noble.on('stateChange', (state: string) => {
      console.log('[BLE] Bluetooth state changed:', state)
      this.sendToRenderer('ble:state-change', state)

      if (state !== 'poweredOn' && this.isScanning) {
        this.isScanning = false
        this.stopDevicePresenceCheck()
      }
    })

    // Listen for device discovery
    noble.on('discover', async (peripheral) => {
      await this.handleDeviceDiscovered(peripheral)
    })
  }

  /**
   * Handle device discovered event
   */
  private async handleDeviceDiscovered(peripheral: Peripheral): Promise<void> {
    const deviceId = peripheral.id

    // Get or create FSM for this device
    let fsm = this.deviceFSMs.get(deviceId)

    if (!fsm) {
      // Create new FSM based on device type
      fsm = createDeviceFSM(peripheral)
      if (!fsm) {
        return
      }
      // Subscribe to state changes
      fsm.subscribe((prevState, newState, event, ctx) => {
        this.handleFSMStateChange(deviceId, prevState, newState, event, ctx)
      })

      this.deviceFSMs.set(deviceId, fsm)
    }

    // Send discover event to FSM
    await fsm.discover(peripheral)

    // Notify renderer about device
    const device: BleDevice = {
      id: peripheral.id,
      name: peripheral.advertisement.localName || 'Unknown Device',
      address: peripheral.address || 'Unknown',
      rssi: peripheral.rssi,
      connectable: true
    }
    this.sendToRenderer('ble:device-found', device)
  }

  /**
   * Handle FSM state changes
   */
  private handleFSMStateChange(
    deviceId: string,
    prevState: BleDeviceState,
    newState: BleDeviceState,
    _event: string,
    ctx: ReturnType<BleDeviceFSM['getContext']>
  ): void {
    console.log(`[BLE] Device ${deviceId}: ${prevState} -> ${newState}`)

    // Notify renderer about connection state changes
    if (newState === 'connected') {
      this.activeDeviceId = deviceId
      this.sendToRenderer('ble:connection-state', {
        connected: true,
        deviceId,
        deviceName: ctx.deviceName
      })
    } else if (prevState === 'connected') {
      if (this.activeDeviceId === deviceId) {
        this.activeDeviceId = null
      }
      this.sendToRenderer('ble:connection-state', {
        connected: false,
        deviceId,
        reason: ctx.error || undefined
      })
    }

    // Handle device lost
    if (newState === 'lost') {
      this.deviceFSMs.delete(deviceId)
      this.sendToRenderer('ble:device-lost', { deviceId })
    }
  }

  private sendToRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data)
    }
  }

  // ==================== Device Presence Check ====================

  private startDevicePresenceCheck(): void {
    if (this.deviceCheckTimer) return

    this.deviceCheckTimer = setInterval(() => {
      for (const [deviceId, fsm] of this.deviceFSMs) {
        // Only check devices that are in discovered state
        if (fsm.matches('discovered') && fsm.isStale(DEVICE_LOST_TIMEOUT)) {
          console.log(`[BLE] Device ${deviceId} is stale, marking as lost`)
          fsm.markLost()
        }
      }
    }, DEVICE_CHECK_INTERVAL)

    console.log('[BLE] Device presence check started')
  }

  private stopDevicePresenceCheck(): void {
    if (this.deviceCheckTimer) {
      clearInterval(this.deviceCheckTimer)
      this.deviceCheckTimer = null
      console.log('[BLE] Device presence check stopped')
    }
  }

  // ==================== Public API ====================

  getState(): string {
    return noble.state
  }

  async startScan(): Promise<{ success: boolean; error?: string }> {
    try {
      if (noble.state !== 'poweredOn') {
        return {
          success: false,
          error: `Bluetooth is not powered on. Current state: ${noble.state}`
        }
      }

      if (this.isScanning) {
        return { success: true }
      }

      // Clear old FSMs
      this.deviceFSMs.clear()

      await noble.startScanningAsync([], true)
      this.isScanning = true

      // Start device presence monitoring
      this.startDevicePresenceCheck()

      console.log('[BLE] Scanning started')
      return { success: true }
    } catch (error) {
      console.error('[BLE] Failed to start scanning:', error)
      return { success: false, error: String(error) }
    }
  }

  async stopScan(): Promise<{ success: boolean }> {
    try {
      if (this.isScanning) {
        await noble.stopScanningAsync()
        this.isScanning = false
        this.stopDevicePresenceCheck()
        console.log('[BLE] Scanning stopped')
      }
      return { success: true }
    } catch (error) {
      console.error('[BLE] Failed to stop scanning:', error)
      return { success: false }
    }
  }

  async connectAndGetBattery(deviceId: string): Promise<BatteryResult> {
    const fsm = this.deviceFSMs.get(deviceId)

    if (!fsm) {
      return { success: false, error: 'Device not found. Please scan first.' }
    }

    // Stop scanning before connecting
    if (this.isScanning) {
      await this.stopScan()
    }

    // If already connected, just read battery
    if (fsm.matches('connected')) {
      const readSuccess = await fsm.readBattery()
      if (readSuccess) {
        const ctx = fsm.getContext()
        return { success: true, level: ctx.batteryLevel ?? undefined }
      }
      return { success: false, error: 'Failed to read battery' }
    }

    // Connect (this will auto-read battery for SP51A)
    const connectSuccess = await fsm.connect()
    if (!connectSuccess) {
      const ctx = fsm.getContext()
      return { success: false, error: ctx.error || 'Connection failed' }
    }

    // Wait a bit for battery read to complete
    await new Promise((resolve) => setTimeout(resolve, 500))

    const ctx = fsm.getContext()
    return {
      success: ctx.batteryLevel !== null,
      level: ctx.batteryLevel ?? undefined,
      error: ctx.batteryLevel === null ? 'Battery read failed' : undefined
    }
  }

  async disconnect(): Promise<{ success: boolean; error?: string }> {
    if (!this.activeDeviceId) {
      return { success: true }
    }

    const fsm = this.deviceFSMs.get(this.activeDeviceId)
    if (!fsm) {
      return { success: true }
    }

    const success = await fsm.disconnect()
    return {
      success,
      error: success ? undefined : fsm.getContext().error || 'Disconnect failed'
    }
  }

  getConnectedDeviceId(): string | null {
    return this.activeDeviceId
  }

  isConnected(): boolean {
    return this.activeDeviceId !== null
  }

  /**
   * Get FSM for a device (for advanced usage)
   */
  getDeviceFSM(deviceId: string): BleDeviceFSM | undefined {
    return this.deviceFSMs.get(deviceId)
  }

  cleanup(): void {
    this.stopDevicePresenceCheck()

    // Disconnect all devices
    for (const fsm of this.deviceFSMs.values()) {
      if (fsm.matches('connected')) {
        fsm.disconnect()
      }
    }

    this.deviceFSMs.clear()
    this.activeDeviceId = null

    if (this.isScanning) {
      noble.stopScanning()
      this.isScanning = false
    }
  }
}
