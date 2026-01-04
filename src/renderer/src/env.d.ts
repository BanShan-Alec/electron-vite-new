/// <reference types="vite/client" />

import { ElectronAPI } from '@electron-toolkit/preload'
import type { BleApi } from '../share/interface'

export type { BleDevice, ScanResult, BleApi } from '../share/interface'

declare global {
  interface Window {
    electron: ElectronAPI
    ble: BleApi
  }
}
