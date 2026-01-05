import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  BleDevice,
  ScanResult,
  BatteryResult,
  ConnectResult,
  ConnectionState,
  DeviceLostEvent
} from '../share/interface'

// BLE API for renderer
const bleApi = {
  getState: (): Promise<string> => ipcRenderer.invoke('ble:get-state'),
  startScan: (): Promise<ScanResult> => ipcRenderer.invoke('ble:start-scan'),
  stopScan: (): Promise<ScanResult> => ipcRenderer.invoke('ble:stop-scan'),
  connectAndGetBattery: (deviceId: string): Promise<BatteryResult> =>
    ipcRenderer.invoke('ble:connect-and-get-battery', deviceId),
  disconnect: (): Promise<ConnectResult> => ipcRenderer.invoke('ble:disconnect'),
  getConnectedDeviceId: (): Promise<string | null> =>
    ipcRenderer.invoke('ble:get-connected-device-id'),
  onDeviceFound: (callback: (device: BleDevice) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, device: BleDevice): void => callback(device)
    ipcRenderer.on('ble:device-found', handler)
    return () => ipcRenderer.removeListener('ble:device-found', handler)
  },
  onDeviceLost: (callback: (event: DeviceLostEvent) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, event: DeviceLostEvent): void => callback(event)
    ipcRenderer.on('ble:device-lost', handler)
    return () => ipcRenderer.removeListener('ble:device-lost', handler)
  },
  onStateChange: (callback: (state: string) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, state: string): void => callback(state)
    ipcRenderer.on('ble:state-change', handler)
    return () => ipcRenderer.removeListener('ble:state-change', handler)
  },
  onConnectionStateChange: (callback: (state: ConnectionState) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, state: ConnectionState): void => callback(state)
    ipcRenderer.on('ble:connection-state', handler)
    return () => ipcRenderer.removeListener('ble:connection-state', handler)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('ble', bleApi)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.ble = bleApi
}
