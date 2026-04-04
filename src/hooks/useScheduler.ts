import { useState, useEffect, useCallback, useRef } from 'react'
import type { ScheduleStatus, LogEvent } from '@/types/index'
import type { LogEntry } from '@/components/ExecutionLog'

function toLogEntry(e: LogEvent): LogEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    message: e.message,
    type: e.type,
  }
}

export function useScheduler() {
  const [status, setStatus] = useState<ScheduleStatus>({ state: 'idle' })
  const [lastLogs, setLastLogs] = useState<LogEntry[]>([])
  const [liveLogs, setLiveLogs] = useState<LogEntry[]>([])

  const statusHandlerRef = useRef<((s: ScheduleStatus) => void) | null>(null)
  const logHandlerRef = useRef<((e: LogEvent) => void) | null>(null)

  // Fetch initial status and last logs
  useEffect(() => {
    if (!window.electronAPI) return
    window.electronAPI.getScheduleStatus().then(setStatus)
    window.electronAPI.getScheduleLastLogs().then((evts) => setLastLogs(evts.map(toLogEntry)))
  }, [])

  // Subscribe to live status changes
  useEffect(() => {
    if (!window.electronAPI) return

    statusHandlerRef.current = (s) => {
      setStatus(s)
      // When a new run starts, clear live log accumulator
      if (s.state === 'running') setLiveLogs([])
      // When run finishes, fetch full last-logs from main process
      if (s.state === 'completed' || s.state === 'error') {
        window.electronAPI!.getScheduleLastLogs().then((evts) => setLastLogs(evts.map(toLogEntry)))
      }
    }
    window.electronAPI.onScheduleStatus(statusHandlerRef.current)

    logHandlerRef.current = (e) => {
      setLiveLogs((prev) => [...prev, toLogEntry(e)])
    }
    window.electronAPI.onScheduleLog(logHandlerRef.current)

    return () => {
      if (statusHandlerRef.current) window.electronAPI?.offScheduleStatus(statusHandlerRef.current)
      if (logHandlerRef.current) window.electronAPI?.offScheduleLog(logHandlerRef.current)
    }
  }, [])

  const start = useCallback(async () => {
    if (!window.electronAPI) return
    const s = await window.electronAPI.startSchedule()
    setStatus(s)
  }, [])

  const stop = useCallback(async () => {
    if (!window.electronAPI) return
    const s = await window.electronAPI.stopSchedule()
    setStatus(s)
  }, [])

  /** Logs to show: live stream while running, last-run logs otherwise */
  const displayLogs = status.state === 'running' ? liveLogs : lastLogs

  return { status, displayLogs, start, stop }
}
