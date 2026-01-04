import { useState, useEffect, useCallback } from 'react'
import type { BleDevice } from '../../share/interface'

function App(): React.JSX.Element {
  const [bleState, setBleState] = useState<string>('unknown')
  const [isScanning, setIsScanning] = useState(false)
  const [devices, setDevices] = useState<Map<string, BleDevice>>(new Map())
  const [error, setError] = useState<string | null>(null)

  // Initialize and setup listeners
  useEffect(() => {
    // Get initial BLE state
    window.ble.getState().then(setBleState)

    // Listen for state changes
    const removeStateListener = window.ble.onStateChange((state) => {
      setBleState(state)
      if (state !== 'poweredOn') {
        setIsScanning(false)
      }
    })

    // Listen for discovered devices
    const removeDeviceListener = window.ble.onDeviceFound((device) => {
      setDevices((prev) => {
        const newMap = new Map(prev)
        newMap.set(device.id, device)
        return newMap
      })
    })

    return () => {
      removeStateListener()
      removeDeviceListener()
    }
  }, [])

  const handleStartScan = useCallback(async () => {
    setError(null)
    setDevices(new Map()) // Clear previous devices
    const result = await window.ble.startScan()
    if (result.success) {
      setIsScanning(true)
    } else {
      setError(result.error || 'Failed to start scanning')
    }
  }, [])

  const handleStopScan = useCallback(async () => {
    await window.ble.stopScan()
    setIsScanning(false)
  }, [])

  const getStateColor = (state: string): string => {
    switch (state) {
      case 'poweredOn':
        return '#4ade80'
      case 'poweredOff':
        return '#f87171'
      default:
        return '#fbbf24'
    }
  }

  const getStateText = (state: string): string => {
    switch (state) {
      case 'poweredOn':
        return 'Powered On'
      case 'poweredOff':
        return 'Powered Off'
      case 'resetting':
        return 'Resetting'
      case 'unsupported':
        return 'Unsupported'
      case 'unauthorized':
        return 'Unauthorized'
      default:
        return state
    }
  }

  const getRssiStrength = (rssi: number): { label: string; color: string } => {
    if (rssi >= -50) return { label: 'Excellent', color: '#4ade80' }
    if (rssi >= -60) return { label: 'Good', color: '#a3e635' }
    if (rssi >= -70) return { label: 'Fair', color: '#fbbf24' }
    return { label: 'Weak', color: '#f87171' }
  }

  const sortedDevices = Array.from(devices.values()).sort((a, b) => b.rssi - a.rssi)

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-content">
          <h1 className="title">BLE Scanner</h1>
          <div className="ble-status">
            <span
              className="status-dot"
              style={{ backgroundColor: getStateColor(bleState) }}
            ></span>
            <span className="status-text">{getStateText(bleState)}</span>
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="controls">
          <button
            className={`scan-button ${isScanning ? 'scanning' : ''}`}
            onClick={isScanning ? handleStopScan : handleStartScan}
            disabled={bleState !== 'poweredOn'}
          >
            {isScanning ? (
              <>
                <span className="spinner"></span>
                Stop Scanning
              </>
            ) : (
              'Start Scan'
            )}
          </button>
          {error && <p className="error-message">{error}</p>}
        </div>

        <div className="device-list-container">
          <div className="device-list-header">
            <h2>Discovered Devices</h2>
            <span className="device-count">{devices.size} found</span>
          </div>

          {sortedDevices.length === 0 ? (
            <div className="empty-state">
              {isScanning ? (
                <p>Searching for nearby BLE devices...</p>
              ) : (
                <p>Click &quot;Start Scan&quot; to discover BLE devices</p>
              )}
            </div>
          ) : (
            <ul className="device-list">
              {sortedDevices.map((device) => {
                const rssiInfo = getRssiStrength(device.rssi)
                return (
                  <li key={device.id} className="device-item">
                    <div className="device-info">
                      <span className="device-name">{device.name}</span>
                      <span className="device-address">{device.address}</span>
                    </div>
                    <div className="device-meta">
                      <span className="device-rssi" style={{ color: rssiInfo.color }}>
                        {device.rssi} dBm
                      </span>
                      <span className="rssi-label" style={{ color: rssiInfo.color }}>
                        {rssiInfo.label}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
