import { useState, useCallback } from 'react'
import type { GroupData } from '@/types/index'

export function useGroups() {
  const [groups, setGroups] = useState<GroupData[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (sheetId: string, excludedTabs: string) => {
    if (!sheetId) {
      setError('Google Sheet ID is required. Configure it in Settings.')
      return
    }
    if (!window.electronAPI) {
      setError('Run inside Electron to fetch real groups.')
      return
    }

    setIsRefreshing(true)
    setError(null)
    try {
      const groupData = await window.electronAPI.fetchGroups(sheetId, excludedTabs)
      setGroups(groupData)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setGroups([])
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  return { groups, isRefreshing, error, refresh } as const
}
