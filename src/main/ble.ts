import { BrowserWindow } from 'electron'
import noble, { Peripheral } from '@stoprocent/noble'
import type { BleDevice, BatteryResult } from '../share/interface'

// Standard BLE UUIDs for Battery Service
const BATTERY_SERVICE_UUID = '180f'
const BATTERY_LEVEL_CHARACTERISTIC_UUID = '2a19'

// Device disappear timeout (ms) - if no advertisement received within this time, consider device lost
const DEVICE_LOST_TIMEOUT = 5000
// Check interval for device presence (ms)
const DEVICE_CHECK_INTERVAL = 1000

// BLE Service - singleton pattern
export class BleService {
  private isScanning = false
  private mainWindow: BrowserWindow | null = null
  private discoveredPeripherals: Map<string, Peripheral> = new Map()
  private connectedPeripheral: Peripheral | null = null
  private connectedDeviceId: string | null = null
  private disconnectHandler: ((reason: string) => void) | null = null

  // Track when each device was last seen (for detecting disappeared devices)
  private deviceLastSeen: Map<string, number> = new Map()
  private deviceCheckTimer: NodeJS.Timeout | null = null

  constructor() {
    this.setupNobleListeners()
  }

  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window
  }

  private setupNobleListeners(): void {
    // 监听蓝牙是否开启
    noble.on('stateChange', (state: string) => {
      console.log('BLE state changed:', state)
      this.sendToRenderer('ble:state-change', state)

      if (state !== 'poweredOn' && this.isScanning) {
        this.isScanning = false
      }
    })

    noble.on('discover', (peripheral) => {
      const device: BleDevice = {
        id: peripheral.id,
        name: peripheral.advertisement.localName || 'Unknown Device',
        address: peripheral.address || 'Unknown',
        rssi: peripheral.rssi,
        connectable: true
      }

      // Store peripheral reference for later connection
      this.discoveredPeripherals.set(peripheral.id, peripheral)

      // Update last seen timestamp for device presence tracking
      this.deviceLastSeen.set(peripheral.id, Date.now())

      console.log('Discovered device:', device.name, device.address)
      if (device.name.toLocaleLowerCase().includes('sp51')) {
        console.log('SP51 device found:', device)
      }
      this.sendToRenderer('ble:device-found', device)
    })
  }

  // Start checking for disappeared devices
  private startDevicePresenceCheck(): void {
    if (this.deviceCheckTimer) {
      return // Already running
    }

    this.deviceCheckTimer = setInterval(() => {
      const now = Date.now()

      for (const [deviceId, lastSeen] of this.deviceLastSeen) {
        if (now - lastSeen > DEVICE_LOST_TIMEOUT) {
          // Device hasn't been seen for too long - consider it lost
          console.log(`Device lost: ${deviceId}`)

          // Remove from tracking
          this.deviceLastSeen.delete(deviceId)
          this.discoveredPeripherals.delete(deviceId)

          // Notify renderer that device disappeared
          this.sendToRenderer('ble:device-lost', { deviceId })
        }
      }
    }, DEVICE_CHECK_INTERVAL)

    console.log('Device presence check started')
  }

  // Stop checking for disappeared devices
  private stopDevicePresenceCheck(): void {
    if (this.deviceCheckTimer) {
      clearInterval(this.deviceCheckTimer)
      this.deviceCheckTimer = null
      console.log('Device presence check stopped')
    }
  }

  private sendToRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data)
    }
  }

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

      await noble.startScanningAsync([], true) // Allow duplicates to update RSSI
      this.isScanning = true

      // Start monitoring for disappeared devices
      this.startDevicePresenceCheck()

      console.log('BLE scanning started')
      return { success: true }
    } catch (error) {
      console.error('Failed to start scanning:', error)
      return { success: false, error: String(error) }
    }
  }

  async stopScan(): Promise<{ success: boolean }> {
    try {
      if (this.isScanning) {
        await noble.stopScanningAsync()
        this.isScanning = false

        // Stop device presence monitoring
        this.stopDevicePresenceCheck()

        console.log('BLE scanning stopped')
      }
      return { success: true }
    } catch (error) {
      console.error('Failed to stop scanning:', error)
      return { success: false }
    }
  }

  async connectAndGetBattery(deviceId: string): Promise<BatteryResult> {
    const peripheral = this.discoveredPeripherals.get(deviceId)

    if (!peripheral) {
      return { success: false, error: 'Device not found. Please scan first.' }
    }

    // If already connected to this device, just read battery
    if (this.connectedPeripheral && this.connectedDeviceId === deviceId) {
      return this.readBatteryLevel(this.connectedPeripheral)
    }

    // Disconnect from previous device if connected
    if (this.connectedPeripheral) {
      await this.disconnect()
    }

    // Stop scanning before connecting (required by noble)
    if (this.isScanning) {
      await this.stopScan()
    }

    try {
      console.log(`Connecting to device: ${peripheral.advertisement.localName || deviceId}`)

      // Connect to the peripheral
      await peripheral.connectAsync()
      console.log('Connected successfully')

      // Store connected peripheral reference
      this.connectedPeripheral = peripheral
      this.connectedDeviceId = deviceId

      // Setup disconnect listener for auto-disconnect detection
      this.setupDisconnectListener(peripheral, deviceId)

      // Notify renderer about connection state
      this.sendToRenderer('ble:connection-state', { connected: true, deviceId })

      // Read battery level
      return await this.readBatteryLevel(peripheral)
    } catch (error) {
      console.error('Failed to connect:', error)
      this.connectedPeripheral = null
      this.connectedDeviceId = null
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  private async readBatteryLevel(peripheral: Peripheral): Promise<BatteryResult> {
    try {
      // Discover battery service and characteristic
      console.log('Discovering battery service...')
      const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
        [BATTERY_SERVICE_UUID],
        [BATTERY_LEVEL_CHARACTERISTIC_UUID]
      )

      if (characteristics.length === 0) {
        return {
          success: false,
          error: 'Battery service not found on this device'
        }
      }

      const batteryCharacteristic = characteristics.find(
        (c) => c.uuid === BATTERY_LEVEL_CHARACTERISTIC_UUID
      )

      if (!batteryCharacteristic) {
        return {
          success: false,
          error: 'Battery level characteristic not found'
        }
      }

      // Read battery level
      console.log('Reading battery level...')
      const data = await batteryCharacteristic.readAsync()
      const batteryLevel = data[0] // Battery level is a single byte (0-100)

      console.log(`Battery level: ${batteryLevel}%`)

      return { success: true, level: batteryLevel }
    } catch (error) {
      console.error('Failed to read battery level:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  // Setup listener for device auto-disconnect (e.g., device powered off, out of range)
  private setupDisconnectListener(peripheral: Peripheral, deviceId: string): void {
    // Remove any existing listener first
    this.removeDisconnectListener()

    // Create the disconnect handler
    this.disconnectHandler = (reason: string) => {
      console.log(`Device disconnected automatically. Reason: ${reason}`)

      // Clean up state
      this.connectedPeripheral = null
      this.connectedDeviceId = null
      this.disconnectHandler = null

      // Notify renderer about auto-disconnection
      this.sendToRenderer('ble:connection-state', {
        connected: false,
        deviceId,
        reason // Include disconnect reason
      })
    }

    // Register the listener
    peripheral.on('disconnect', this.disconnectHandler)
    console.log('Disconnect listener registered')
  }

  // Remove disconnect listener from peripheral
  private removeDisconnectListener(): void {
    if (this.connectedPeripheral && this.disconnectHandler) {
      this.connectedPeripheral.removeListener('disconnect', this.disconnectHandler)
      this.disconnectHandler = null
      console.log('Disconnect listener removed')
    }
  }

  async disconnect(): Promise<{ success: boolean; error?: string }> {
    if (!this.connectedPeripheral) {
      return { success: true } // Already disconnected
    }

    try {
      console.log('Disconnecting from device...')

      // Remove listener before manual disconnect to avoid duplicate notifications
      this.removeDisconnectListener()

      await this.connectedPeripheral.disconnectAsync()
      console.log('Disconnected successfully')

      const deviceId = this.connectedDeviceId
      this.connectedPeripheral = null
      this.connectedDeviceId = null

      // Notify renderer about disconnection
      this.sendToRenderer('ble:connection-state', { connected: false, deviceId })

      return { success: true }
    } catch (error) {
      console.error('Failed to disconnect:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  getConnectedDeviceId(): string | null {
    return this.connectedDeviceId
  }

  isConnected(): boolean {
    return this.connectedPeripheral !== null
  }

  cleanup(): void {
    // Stop device presence check
    this.stopDevicePresenceCheck()

    // Remove disconnect listener first
    this.removeDisconnectListener()

    if (this.connectedPeripheral) {
      this.connectedPeripheral.disconnect()
      this.connectedPeripheral = null
      this.connectedDeviceId = null
    }
    if (this.isScanning) {
      noble.stopScanning()
      this.isScanning = false
    }
    this.discoveredPeripherals.clear()
    this.deviceLastSeen.clear()
  }
}
