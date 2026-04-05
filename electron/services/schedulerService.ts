import { BrowserWindow } from 'electron'
import type { AppConfiguration, LogEvent, ScheduleStatus, ScheduleState } from '../../src/types/index'

/** Last-run log ring buffer cap */
const MAX_LOG_ENTRIES = 500

/** The logFn signature matches executeForGroups: (message, type?) */
export type ScheduleLogFn = (message: string, type?: LogEvent['type']) => void

/** Callback injected by ipcHandlers to avoid circular imports */
export type ScheduleRunCallback = (config: AppConfiguration, logFn: ScheduleLogFn) => Promise<void>

export class SchedulerService {
  private timer: ReturnType<typeof setTimeout> | null = null
  private state: ScheduleState = 'idle'
  private nextRun: string | undefined
  private lastRun: string | undefined
  private lastError: string | undefined
  private lastRunLogs: LogEvent[] = []
  private runCallback: ScheduleRunCallback | null = null
  private intervalHours = 2

  setRunCallback(cb: ScheduleRunCallback): void {
    this.runCallback = cb
  }

  // ── Start / Stop ──────────────────────────────────────────────────────────

  start(config: AppConfiguration): void {
    this.stop()
    if (!config.scheduleEnabled) {
      this.setState('idle')
      return
    }
    this.intervalHours = config.scheduleIntervalHours ?? 2
    this.scheduleNext(config)
  }

  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.state !== 'running') {
      this.setState('idle')
    }
  }

  // ── Status ────────────────────────────────────────────────────────────────

  getStatus(): ScheduleStatus {
    return {
      state: this.state,
      nextRun: this.nextRun,
      lastRun: this.lastRun,
      error: this.lastError,
      intervalHours: this.intervalHours,
    }
  }

  getLastLogs(): LogEvent[] {
    return [...this.lastRunLogs]
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private scheduleNext(config: AppConfiguration): void {
    const msUntil = (config.scheduleIntervalHours ?? 2) * 60 * 60 * 1000
    this.nextRun = new Date(Date.now() + msUntil).toISOString()
    this.setState('scheduled')

    this.timer = setTimeout(async () => {
      this.timer = null
      await this.trigger(config)
      // Re-schedule for the next interval
      this.scheduleNext(config)
    }, msUntil)
  }

  private async trigger(config: AppConfiguration): Promise<void> {
    if (!this.runCallback) return

    this.lastRunLogs = []
    this.setState('running')
    this.lastError = undefined

    const logFn: ScheduleLogFn = (message, type = 'info') => {
      const event: LogEvent = { message, type }
      this.lastRunLogs.push(event)
      if (this.lastRunLogs.length > MAX_LOG_ENTRIES) this.lastRunLogs.shift()
      getWin()?.webContents.send('schedule:log', event)
    }

    try {
      await this.runCallback(config, logFn)
      this.lastRun = new Date().toISOString()
      this.setState('completed')
    } catch (err) {
      this.lastRun = new Date().toISOString()
      this.lastError = err instanceof Error ? err.message : String(err)
      this.setState('error')
    }
  }

  private setState(state: ScheduleState): void {
    this.state = state
    getWin()?.webContents.send('schedule:status-changed', this.getStatus())
  }
}

function getWin(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null
}

