/**
 * BLE Device State Machine Base Class
 * Defines common BLE device states and transitions
 * Subclasses can override hooks for device-specific behavior
 */

import type { Peripheral, Characteristic } from '@stoprocent/noble'
import { AsyncStateMachine, type StateHooks, type TransitionMap } from './AsyncStateMachine'

// BLE Device States
export type BleDeviceState =
  | 'idle'
  | 'discovered'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'lost'

// BLE Device Context
export interface BleDeviceContext {
  deviceId: string | null
  deviceName: string | null
  peripheral: Peripheral | null
  batteryLevel: number | null
  lastSeen: number
  error: string | null
}

// BLE Events
export const BleEvents = {
  DISCOVER: 'DISCOVER',
  LOST: 'LOST',
  CONNECT: 'CONNECT',
  CONNECT_SUCCESS: 'CONNECT_SUCCESS',
  CONNECT_FAIL: 'CONNECT_FAIL',
  DISCONNECT: 'DISCONNECT',
  DISCONNECT_DONE: 'DISCONNECT_DONE',
  AUTO_DISCONNECT: 'AUTO_DISCONNECT'
} as const

// Standard BLE UUIDs
export const BATTERY_SERVICE_UUID = '180f'
export const BATTERY_LEVEL_CHARACTERISTIC_UUID = '2a19'

/**
 * Base class for BLE device state machines
 * Override hook methods in subclass for device-specific behavior
 */
export abstract class BleDeviceFSM extends AsyncStateMachine<BleDeviceState, BleDeviceContext> {
  private disconnectHandler: ((reason: string) => void) | null = null

  constructor(deviceId?: string) {
    super('idle', {
      deviceId: deviceId || null,
      deviceName: null,
      peripheral: null,
      batteryLevel: null,
      lastSeen: 0,
      error: null
    })
  }

  /**
   * Define BLE state transitions
   */
  protected getTransitions(): Record<BleDeviceState, TransitionMap<BleDeviceState>> {
    return {
      idle: {
        [BleEvents.DISCOVER]: 'discovered'
      },
      discovered: {
        [BleEvents.DISCOVER]: 'discovered', // Update lastSeen
        [BleEvents.CONNECT]: 'connecting',
        [BleEvents.LOST]: 'lost'
      },
      connecting: {
        [BleEvents.CONNECT_SUCCESS]: 'connected',
        [BleEvents.CONNECT_FAIL]: 'discovered'
      },
      connected: {
        [BleEvents.DISCONNECT]: 'disconnecting',
        [BleEvents.AUTO_DISCONNECT]: 'discovered'
      },
      disconnecting: {
        [BleEvents.DISCONNECT_DONE]: 'idle'
      },
      lost: {
        [BleEvents.DISCOVER]: 'discovered'
      }
    }
  }

  /**
   * Get hooks for each state
   * Delegates to specific hook methods that subclasses can override
   */
  protected getStateHooks(state: BleDeviceState): StateHooks<BleDeviceContext> {
    switch (state) {
      case 'discovered':
        return {
          onEntry: this.onDiscoveredEntry.bind(this)
        }
      case 'connecting':
        return {
          guard: this.onConnectingGuard.bind(this),
          onEntry: this.onConnectingEntry.bind(this)
        }
      case 'connected':
        return {
          onEntry: this.onConnectedEntry.bind(this),
          onExit: this.onConnectedExit.bind(this)
        }
      case 'disconnecting':
        return {
          onEntry: this.onDisconnectingEntry.bind(this)
        }
      case 'lost':
        return {
          onEntry: this.onLostEntry.bind(this)
        }
      default:
        return {}
    }
  }

  // ==================== Hook Methods (Override in subclass) ====================

  /**
   * Called when device is discovered
   * Override to add custom behavior
   */
  protected async onDiscoveredEntry(
    ctx: BleDeviceContext,
    _event: string,
    payload?: unknown
  ): Promise<void> {
    const { peripheral } = payload as { peripheral: Peripheral }
    ctx.peripheral = peripheral
    ctx.deviceId = peripheral.id
    ctx.deviceName = peripheral.advertisement.localName || 'Unknown'
    ctx.lastSeen = Date.now()
    ctx.error = null
    console.log(`[BLE] Device discovered: ${ctx.deviceName}`)
  }

  /**
   * Guard for connecting state - check if can connect
   * Override to add custom validation
   */
  protected async onConnectingGuard(ctx: BleDeviceContext): Promise<boolean> {
    if (!ctx.peripheral) {
      ctx.error = 'No peripheral to connect'
      return false
    }
    return true
  }

  /**
   * Called when entering connecting state
   * Override to customize connection logic
   */
  protected async onConnectingEntry(ctx: BleDeviceContext): Promise<void> {
    try {
      console.log(`[BLE] Connecting to ${ctx.deviceName}...`)
      await ctx.peripheral!.connectAsync()
      console.log(`[BLE] Connected to ${ctx.deviceName}`)

      // Setup disconnect listener
      this.setupDisconnectListener(ctx)

      // Trigger success event
      await this.send(BleEvents.CONNECT_SUCCESS)
    } catch (error) {
      ctx.error = error instanceof Error ? error.message : String(error)
      console.error(`[BLE] Connection failed:`, ctx.error)
      await this.send(BleEvents.CONNECT_FAIL)
    }
  }

  /**
   * Called when connection is established
   * Override to add post-connection logic
   */
  protected async onConnectedEntry(ctx: BleDeviceContext, _event: string): Promise<void> {
    console.log(`[BLE] Now connected to ${ctx.deviceName}`)
  }

  /**
   * Called when leaving connected state
   * Override to add cleanup logic
   */
  protected async onConnectedExit(ctx: BleDeviceContext): Promise<void> {
    this.removeDisconnectListener(ctx)
  }

  /**
   * Called when disconnecting
   * Override to customize disconnect logic
   */
  protected async onDisconnectingEntry(ctx: BleDeviceContext): Promise<void> {
    try {
      console.log(`[BLE] Disconnecting from ${ctx.deviceName}...`)
      if (ctx.peripheral) {
        await ctx.peripheral.disconnectAsync()
      }
      console.log(`[BLE] Disconnected`)
      ctx.peripheral = null
      ctx.batteryLevel = null
      await this.send(BleEvents.DISCONNECT_DONE)
    } catch (error) {
      ctx.error = error instanceof Error ? error.message : String(error)
      console.error(`[BLE] Disconnect error:`, ctx.error)
      await this.send(BleEvents.DISCONNECT_DONE)
    }
  }

  /**
   * Called when device is lost
   * Override to add custom cleanup
   */
  protected async onLostEntry(ctx: BleDeviceContext): Promise<void> {
    console.log(`[BLE] Device lost: ${ctx.deviceName}`)
    ctx.peripheral = null
    ctx.batteryLevel = null
  }

  // ==================== Helper Methods ====================

  /**
   * Read battery level from peripheral
   */
  protected async readBatteryLevel(peripheral: Peripheral): Promise<number> {
    const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
      [BATTERY_SERVICE_UUID],
      [BATTERY_LEVEL_CHARACTERISTIC_UUID]
    )

    const batteryChar = characteristics.find(
      (c: Characteristic) => c.uuid === BATTERY_LEVEL_CHARACTERISTIC_UUID
    )

    if (!batteryChar) {
      throw new Error('Battery characteristic not found')
    }

    const data = await batteryChar.readAsync()
    return data[0]
  }

  /**
   * Setup auto-disconnect listener
   */
  private setupDisconnectListener(ctx: BleDeviceContext): void {
    this.removeDisconnectListener(ctx)

    this.disconnectHandler = (reason: string) => {
      console.log(`[BLE] Auto-disconnected: ${reason}`)
      this.send(BleEvents.AUTO_DISCONNECT, { reason })
    }

    ctx.peripheral?.on('disconnect', this.disconnectHandler)
  }

  /**
   * Remove disconnect listener
   */
  private removeDisconnectListener(ctx: BleDeviceContext): void {
    if (this.disconnectHandler && ctx.peripheral) {
      ctx.peripheral.removeListener('disconnect', this.disconnectHandler)
      this.disconnectHandler = null
    }
  }

  // ==================== Public API ====================

  /**
   * Discover device
   */
  async discover(peripheral: Peripheral): Promise<boolean> {
    return this.send(BleEvents.DISCOVER, { peripheral })
  }

  /**
   * Connect to device
   */
  async connect(): Promise<boolean> {
    return this.send(BleEvents.CONNECT)
  }

  /**
   * Read battery level (only available in connected state)
   * @returns Battery level percentage (0-100), or null if failed
   */
  async readBattery(): Promise<number | null> {
    // Guard: Only allow reading when connected
    if (this.getState() !== 'connected') {
      console.warn(`[BLE] Cannot read battery: device is not connected (state: ${this.getState()})`)
      return null
    }

    const ctx = this.getContext()
    if (!ctx.peripheral) {
      console.warn(`[BLE] Cannot read battery: no peripheral`)
      return null
    }

    try {
      console.log(`[BLE] Reading battery level...`)
      const level = await this.readBatteryLevel(ctx.peripheral)
      this.updateContext({ batteryLevel: level, error: null })
      console.log(`[BLE] Battery level: ${level}%`)
      return level
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.updateContext({ error: errorMsg })
      console.error(`[BLE] Read battery failed:`, errorMsg)
      return null
    }
  }

  /**
   * Disconnect from device
   */
  async disconnect(): Promise<boolean> {
    return this.send(BleEvents.DISCONNECT)
  }

  /**
   * Mark device as lost
   */
  async markLost(): Promise<boolean> {
    return this.send(BleEvents.LOST)
  }

  /**
   * Update last seen timestamp
   */
  updateLastSeen(): void {
    this.updateContext({ lastSeen: Date.now() })
  }

  /**
   * Check if device is stale (not seen for given ms)
   */
  isStale(timeoutMs: number): boolean {
    const ctx = this.getContext()
    return ctx.lastSeen > 0 && Date.now() - ctx.lastSeen > timeoutMs
  }
}
