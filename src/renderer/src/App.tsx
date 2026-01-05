import { useState, useEffect, useCallback } from 'react'
import type { BleDevice } from '../../share/interface'

function App(): React.JSX.Element {
  const [bleState, setBleState] = useState<string>('unknown')
  const [isScanning, setIsScanning] = useState(false)
  const [devices, setDevices] = useState<Map<string, BleDevice>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null)
  const [isGettingBattery, setIsGettingBattery] = useState(false)
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [connectedDeviceId, setConnectedDeviceId] = useState<string | null>(null)
  const [isDisconnecting, setIsDisconnecting] = useState(false)

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

    // Listen for devices that disappeared (no longer advertising)
    const removeDeviceLostListener = window.ble.onDeviceLost((event) => {
      setDevices((prev) => {
        const newMap = new Map(prev)
        const lostDevice = newMap.get(event.deviceId)
        if (lostDevice) {
          console.log(`Device lost: ${lostDevice.name}`)
        }
        newMap.delete(event.deviceId)
        return newMap
      })
    })

    // Listen for connection state changes (including auto-disconnect)
    const removeConnectionListener = window.ble.onConnectionStateChange((state) => {
      setConnectedDeviceId(state.connected ? state.deviceId : null)
      if (!state.connected) {
        setBatteryLevel(null)
        // Show message if device disconnected automatically (has reason)
        if (state.reason) {
          setError(`Device disconnected: ${state.reason}`)
        }
      } else {
        setError(null) // Clear error on successful connection
      }
    })

    // Get initial connected device
    window.ble.getConnectedDeviceId().then(setConnectedDeviceId)

    return () => {
      removeStateListener()
      removeDeviceListener()
      removeDeviceLostListener()
      removeConnectionListener()
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

  // Connect and get battery level for a specific device
  const handleConnectAndGetBattery = useCallback(async (deviceId: string) => {
    setError(null)
    setIsGettingBattery(true)
    setSelectedDeviceId(deviceId)
    setBatteryLevel(null)

    try {
      const result = await window.ble.connectAndGetBattery(deviceId)
      if (result.success && result.level !== undefined) {
        setBatteryLevel(result.level)
      } else {
        setError(result.error || 'Failed to connect and get battery level')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setIsGettingBattery(false)
    }
  }, [])

  // Disconnect from current device
  const handleDisconnect = useCallback(async () => {
    setError(null)
    setIsDisconnecting(true)

    try {
      const result = await window.ble.disconnect()
      if (result.success) {
        setBatteryLevel(null)
        setSelectedDeviceId(null)
      } else {
        setError(result.error || 'Failed to disconnect')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setIsDisconnecting(false)
    }
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
          <div className="button-group">
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
            <button
              className={`disconnect-button ${isDisconnecting ? 'loading' : ''}`}
              onClick={handleDisconnect}
              disabled={!connectedDeviceId || isDisconnecting}
            >
              {isDisconnecting ? (
                <>
                  <span className="spinner"></span>
                  Disconnecting...
                </>
              ) : (
                '🔌 Disconnect'
              )}
            </button>
          </div>

          {connectedDeviceId && (
            <div className="connection-status">
              <span className="connection-dot"></span>
              <span>Connected to: {devices.get(connectedDeviceId)?.name || connectedDeviceId}</span>
            </div>
          )}

          {batteryLevel !== null && (
            <div className="battery-display">
              <div className="battery-icon">
                <div
                  className="battery-fill"
                  style={{
                    width: `${batteryLevel}%`,
                    backgroundColor:
                      batteryLevel > 50 ? '#4ade80' : batteryLevel > 20 ? '#fbbf24' : '#f87171'
                  }}
                ></div>
              </div>
              <span className="battery-text">{batteryLevel}%</span>
            </div>
          )}

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
                const isSp51a = device.name.toLowerCase().includes('sp51a')
                const isSelected = selectedDeviceId === device.id
                return (
                  <li key={device.id} className={`device-item ${isSp51a ? 'sp51a-device' : ''}`}>
                    <div className="device-info">
                      <span className="device-name">
                        {device.name}
                        {isSp51a && <span className="sp51a-badge">SP51A</span>}
                      </span>
                      <span className="device-address">{device.address}</span>
                    </div>
                    <div className="device-actions">
                      <div className="device-meta">
                        <span className="device-rssi" style={{ color: rssiInfo.color }}>
                          {device.rssi} dBm
                        </span>
                        <span className="rssi-label" style={{ color: rssiInfo.color }}>
                          {rssiInfo.label}
                        </span>
                      </div>
                      {device.connectable && (
                        <button
                          className={`get-battery-btn ${connectedDeviceId === device.id ? 'connected' : ''}`}
                          onClick={() => handleConnectAndGetBattery(device.id)}
                          disabled={isGettingBattery}
                          title={
                            connectedDeviceId === device.id
                              ? 'Refresh battery'
                              : 'Connect & get battery'
                          }
                        >
                          {isGettingBattery && isSelected
                            ? '...'
                            : connectedDeviceId === device.id
                              ? '🔄'
                              : '🔋'}
                        </button>
                      )}
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
