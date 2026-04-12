import { contextBridge, ipcRenderer } from 'electron'
import type { AppConfiguration, LogEvent, ExecutionParams, GroupData, ScheduleStatus, UpdateStatus } from '../src/types/index'

// Tracks original cb → wrapped listener so removeListener can find the right handler
const logListeners = new Map<
  (entry: LogEvent) => void,
  (_e: unknown, entry: LogEvent) => void
>()
const scheduleStatusListeners = new Map<
  (status: ScheduleStatus) => void,
  (_e: unknown, status: ScheduleStatus) => void
>()
const scheduleLogListeners = new Map<
  (entry: LogEvent) => void,
  (_e: unknown, entry: LogEvent) => void
>()
const tabDataListeners = new Map<
  (data: GroupData) => void,
  (_e: unknown, data: GroupData) => void
>()
const updateStatusListeners = new Map<
  (status: UpdateStatus) => void,
  (_e: unknown, status: UpdateStatus) => void
>()

contextBridge.exposeInMainWorld('electronAPI', {
  // ── File system (original) ──────────────────────────────────────────────
  openFile: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openFile'),
  readFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('fs:readFile', filePath),
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('shell:openExternal', url),

  // ── Config ───────────────────────────────────────────────────────────────
  loadConfig: (): Promise<AppConfiguration> =>
    ipcRenderer.invoke('config:load'),
  saveConfig: (config: AppConfiguration): Promise<void> =>
    ipcRenderer.invoke('config:save', config),

  // ── Google Sheets ─────────────────────────────────────────────────────────
  fetchGroups: (sheetId: string, excludedTabs: string): Promise<GroupData[]> =>
    ipcRenderer.invoke('sheets:fetch', sheetId, excludedTabs),  loadGroupDetails: (sheetId: string, tabNames: string[]): Promise<void> =>
    ipcRenderer.invoke('sheets:loadDetails', sheetId, tabNames),
  onTabData: (cb: (data: GroupData) => void): void => {
    const wrapped = (_e: unknown, data: GroupData) => cb(data)
    tabDataListeners.set(cb, wrapped)
    ipcRenderer.on('sheets:tab-data', wrapped)
  },
  offTabData: (cb: (data: GroupData) => void): void => {
    const wrapped = tabDataListeners.get(cb)
    if (wrapped) {
      ipcRenderer.removeListener('sheets:tab-data', wrapped)
      tabDataListeners.delete(cb)
    }
  },
  // ── Execution ─────────────────────────────────────────────────────────────
  runExecution: (params: ExecutionParams): Promise<void> =>
    ipcRenderer.invoke('execution:run', params),
  onLog: (cb: (entry: LogEvent) => void): void => {
    const wrapped = (_e: unknown, entry: LogEvent) => cb(entry)
    logListeners.set(cb, wrapped)
    ipcRenderer.on('execution:log', wrapped)
  },
  offLog: (cb: (entry: LogEvent) => void): void => {
    const wrapped = logListeners.get(cb)
    if (wrapped) {
      ipcRenderer.removeListener('execution:log', wrapped)
      logListeners.delete(cb)
    }
  },

  // ── Schedule ───────────────────────────────────────────────────────────────
  getScheduleStatus: (): Promise<ScheduleStatus> =>
    ipcRenderer.invoke('schedule:status'),
  startSchedule: (): Promise<ScheduleStatus> =>
    ipcRenderer.invoke('schedule:start'),
  stopSchedule: (): Promise<ScheduleStatus> =>
    ipcRenderer.invoke('schedule:stop'),
  getScheduleLastLogs: (): Promise<LogEvent[]> =>
    ipcRenderer.invoke('schedule:lastLogs'),
  onScheduleStatus: (cb: (status: ScheduleStatus) => void): void => {
    const wrapped = (_e: unknown, status: ScheduleStatus) => cb(status)
    scheduleStatusListeners.set(cb, wrapped)
    ipcRenderer.on('schedule:status-changed', wrapped)
  },
  offScheduleStatus: (cb: (status: ScheduleStatus) => void): void => {
    const wrapped = scheduleStatusListeners.get(cb)
    if (wrapped) {
      ipcRenderer.removeListener('schedule:status-changed', wrapped)
      scheduleStatusListeners.delete(cb)
    }
  },
  onScheduleLog: (cb: (entry: LogEvent) => void): void => {
    const wrapped = (_e: unknown, entry: LogEvent) => cb(entry)
    scheduleLogListeners.set(cb, wrapped)
    ipcRenderer.on('schedule:log', wrapped)
  },
  offScheduleLog: (cb: (entry: LogEvent) => void): void => {
    const wrapped = scheduleLogListeners.get(cb)
    if (wrapped) {
      ipcRenderer.removeListener('schedule:log', wrapped)
      scheduleLogListeners.delete(cb)
    }
  },

  // ── Auto-updater ────────────────────────────────────────────────────────
  getAppVersion: (): Promise<string> =>
    ipcRenderer.invoke('update:getVersion'),
  checkForUpdates: (): Promise<void> =>
    ipcRenderer.invoke('update:check'),
  installUpdate: (): Promise<void> =>
    ipcRenderer.invoke('update:install'),
  onUpdateStatus: (cb: (status: UpdateStatus) => void): void => {
    const wrapped = (_e: unknown, status: UpdateStatus) => cb(status)
    updateStatusListeners.set(cb, wrapped)
    ipcRenderer.on('update:status', wrapped)
  },
  offUpdateStatus: (cb: (status: UpdateStatus) => void): void => {
    const wrapped = updateStatusListeners.get(cb)
    if (wrapped) {
      ipcRenderer.removeListener('update:status', wrapped)
      updateStatusListeners.delete(cb)
    }
  },
})
