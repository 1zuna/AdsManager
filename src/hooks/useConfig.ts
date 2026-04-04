import { useState, useEffect, useCallback } from 'react'
import type { AppConfiguration } from '@/types/index'

const DEFAULT_CONFIG: AppConfiguration = {
  googleSheetId: '',
  serviceAccountPath: '',
  facebookApiToken: '',
  excludedTabs:
    'Configuration, RAW Data Aggregated, Dashboard Summary, Dashboard Summary (VNĐ), Ads Rules Status, Update Money, Update Money 1, CustomMessage, Bảng Tổng Hợp, USD mẫu',
}

export function useConfig() {
  const [config, setConfigState] = useState<AppConfiguration>(DEFAULT_CONFIG)
  const [loaded, setLoaded] = useState(false)

  // Load persisted config from electron-store on mount
  useEffect(() => {
    if (!window.electronAPI) {
      setLoaded(true)
      return
    }
    window.electronAPI.loadConfig().then((saved) => {
      setConfigState(saved)
      setLoaded(true)
    })
  }, [])

  const saveConfig = useCallback((updated: AppConfiguration) => {
    setConfigState(updated)
    window.electronAPI?.saveConfig(updated)
  }, [])

  return { config, setConfig: saveConfig, loaded }
}
