import { BrowserWindow } from 'electron'
import noble from '@stoprocent/noble'
import type { BleDevice } from '../share/interface'

// BLE Service - singleton pattern
export class BleService {
  private isScanning = false
  private mainWindow: BrowserWindow | null = null

  constructor() {
    this.setupNobleListeners()
  }

  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window
  }

  private setupNobleListeners(): void {
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
        connectable: peripheral.connectable ?? false
      }
      console.log('Discovered device:', device.name, device.address)
      this.sendToRenderer('ble:device-found', device)
    })
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
        console.log('BLE scanning stopped')
      }
      return { success: true }
    } catch (error) {
      console.error('Failed to stop scanning:', error)
      return { success: false }
    }
  }

  cleanup(): void {
    if (this.isScanning) {
      noble.stopScanning()
      this.isScanning = false
    }
  }
}
