import { useState, useEffect, useCallback, useRef } from 'react'
import type { AppConfiguration } from '@/types/index'
import type { LogEntry } from '@/components/ExecutionLog'

function now() {
  return new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function useExecution() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isExecuting, setIsExecuting] = useState(false)
  const logHandlerRef = useRef<((entry: { message: string; type: LogEntry['type'] }) => void) | null>(null)

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setLogs((prev) => [...prev, { id: crypto.randomUUID(), timestamp: now(), message, type }])
  }, [])

  // Register IPC log listener
  useEffect(() => {
    if (!window.electronAPI) return

    logHandlerRef.current = (entry) => {
      addLog(entry.message, entry.type)
    }
    window.electronAPI.onLog(logHandlerRef.current)

    return () => {
      if (logHandlerRef.current) {
        window.electronAPI?.offLog(logHandlerRef.current)
      }
    }
  }, [addLog])

  const run = useCallback(
    async (selectedGroups: string[], config: AppConfiguration) => {
      if (!window.electronAPI) {
        addLog('Run inside Electron to execute real API calls.', 'error')
        return
      }
      setIsExecuting(true)
      try {
        await window.electronAPI.runExecution({ selectedGroups, config })
      } catch (err) {
        addLog(`Execution error: ${err instanceof Error ? err.message : String(err)}`, 'error')
      } finally {
        setIsExecuting(false)
      }
    },
    [addLog],
  )

  const clearLogs = useCallback(() => setLogs([]), [])

  return { logs, isExecuting, run, clearLogs }
}
