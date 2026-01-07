/**
 * SP51A Device State Machine
 * Extends BleDeviceFSM with SP51A-specific behavior
 */

import { BleDeviceFSM, BleDeviceContext, BleEvents } from './BleDeviceFSM'

/**
 * SP51A specific device state machine
 * Overrides hooks to add device-specific behavior
 */
export class Sp51aDeviceFSM extends BleDeviceFSM {
  constructor(deviceId?: string) {
    super(deviceId)
  }

  /**
   * Override: Called when device is discovered
   * Add SP51A specific discovery logic
   */
  protected async onDiscoveredEntry(
    ctx: BleDeviceContext,
    event: string,
    payload?: unknown
  ): Promise<void> {
    // Call parent implementation first
    await super.onDiscoveredEntry(ctx, event, payload)

    // SP51A specific: Log discovery with timestamp
    console.log(`[SP51A] Device discovered at ${new Date().toLocaleString()}`)
  }

  /**
   * Override: Guard for connecting
   * Add SP51A specific validation
   */
  protected async onConnectingGuard(ctx: BleDeviceContext): Promise<boolean> {
    // Call parent guard first
    const parentResult = await super.onConnectingGuard(ctx)
    if (!parentResult) return false

    // SP51A specific: Verify device name
    if (!ctx.deviceName?.toLowerCase().includes('sp51')) {
      ctx.error = 'Not a SP51A device'
      console.warn(`[SP51A] Guard rejected: ${ctx.deviceName} is not a SP51A device`)
      return false
    }

    console.log(`[SP51A] Guard passed for ${ctx.deviceName}`)
    return true
  }

  /**
   * Override: Called when connection is established
   * Print current time as required
   */
  protected async onConnectedEntry(ctx: BleDeviceContext, event: string): Promise<void> {
    // Call parent implementation
    await super.onConnectedEntry(ctx, event)

    // Only execute on initial connection (CONNECT_SUCCESS event)
    if (event === BleEvents.CONNECT_SUCCESS) {
      // ✅ SP51A specific: Print current time when connected
      const now = new Date()
      console.log(`[SP51A] ========================================`)
      console.log(`[SP51A] Connected successfully!`)
      console.log(`[SP51A] Device: ${ctx.deviceName}`)
      console.log(`[SP51A] Time: ${now.toLocaleString()}`)
      console.log(`[SP51A] Timestamp: ${now.getTime()}`)
      console.log(`[SP51A] ========================================`)

      // Auto read battery after initial connection
      const level = await this.readBattery()
      if (level !== null) {
        console.log(`[SP51A] Battery level: ${level}% at ${new Date().toLocaleString()}`)
      }
    }
  }

  /**
   * Override: Called when device is lost
   * Add SP51A specific cleanup
   */
  protected async onLostEntry(ctx: BleDeviceContext): Promise<void> {
    console.log(`[SP51A] Device lost at ${new Date().toLocaleString()}`)
    await super.onLostEntry(ctx)
  }

  /**
   * Override: Called when disconnected
   * Add SP51A specific logging
   */
  protected async onConnectedExit(ctx: BleDeviceContext): Promise<void> {
    console.log(`[SP51A] Disconnecting at ${new Date().toLocaleString()}`)
    await super.onConnectedExit(ctx)
  }
}
