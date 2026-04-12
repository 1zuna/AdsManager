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
      // Step 1 — fast: one API call (listTabs), returns names only, instantly usable
      const initialGroups = await window.electronAPI.fetchGroups(sheetId, excludedTabs)
      setGroups(initialGroups)
      setIsRefreshing(false)

      if (initialGroups.length === 0) return

      // Step 2 — progressive: one tab per second (quota-safe), updates each row in-place
      const onData = (group: GroupData) => {
        setGroups((prev) => prev.map((g) => (g.tabName === group.tabName ? group : g)))
      }
      window.electronAPI.onTabData(onData)
      try {
        await window.electronAPI.loadGroupDetails(sheetId, initialGroups.map((g) => g.tabName))
      } finally {
        window.electronAPI.offTabData(onData)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setGroups([])
      setIsRefreshing(false)
    }
  }, [])

  return { groups, isRefreshing, error, refresh } as const
}
