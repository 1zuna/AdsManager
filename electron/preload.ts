import { contextBridge, ipcRenderer } from 'electron'
import type { AppConfiguration, LogEvent, ExecutionParams, GroupData } from '../src/types/index'

// Tracks original cb → wrapped listener so removeListener can find the right handler
const logListeners = new Map<
  (entry: LogEvent) => void,
  (_e: unknown, entry: LogEvent) => void
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
    ipcRenderer.invoke('sheets:fetch', sheetId, excludedTabs),

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
})
