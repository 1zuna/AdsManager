import { useEffect, useState } from 'react'
import type { UpdateStatus } from '@/types/index'

export function useUpdater() {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [version, setVersion] = useState<string>('')

  useEffect(() => {
    window.electronAPI?.getAppVersion().then(setVersion).catch(() => {})

    const cb = (s: UpdateStatus) => setStatus(s)
    window.electronAPI?.onUpdateStatus(cb)
    return () => window.electronAPI?.offUpdateStatus(cb)
  }, [])

  // Auto-clear "not-available" back to idle after 4 seconds
  useEffect(() => {
    if (status.state !== 'not-available') return
    const t = setTimeout(() => setStatus({ state: 'idle' }), 4000)
    return () => clearTimeout(t)
  }, [status.state])

  const check = () => {
    setStatus({ state: 'checking' })
    window.electronAPI?.checkForUpdates()
  }

  const install = () => {
    window.electronAPI?.installUpdate()
  }

  return { status, version, check, install }
}
