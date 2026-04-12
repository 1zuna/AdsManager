import type { AppConfiguration, LogEvent, ExecutionParams, GroupData, ScheduleStatus, UpdateStatus } from './types/index'

export {}

declare global {
  interface Window {
    electronAPI?: {
      // File system
      openFile: () => Promise<string | null>
      readFile: (filePath: string) => Promise<string>
      openExternal: (url: string) => Promise<void>

      // Config persistence
      loadConfig: () => Promise<AppConfiguration>
      saveConfig: (config: AppConfiguration) => Promise<void>

      // Google Sheets
      fetchGroups: (sheetId: string, excludedTabs: string) => Promise<GroupData[]>
      loadGroupDetails: (sheetId: string, tabNames: string[]) => Promise<void>
      onTabData: (cb: (data: GroupData) => void) => void
      offTabData: (cb: (data: GroupData) => void) => void

      // Execution pipeline
      runExecution: (params: ExecutionParams) => Promise<void>
      onLog: (cb: (entry: LogEvent) => void) => void
      offLog: (cb: (entry: LogEvent) => void) => void

      // Scheduled job
      getScheduleStatus: () => Promise<ScheduleStatus>
      startSchedule: () => Promise<ScheduleStatus>
      stopSchedule: () => Promise<ScheduleStatus>
      getScheduleLastLogs: () => Promise<LogEvent[]>
      onScheduleStatus: (cb: (status: ScheduleStatus) => void) => void
      offScheduleStatus: (cb: (status: ScheduleStatus) => void) => void
      onScheduleLog: (cb: (entry: LogEvent) => void) => void
      offScheduleLog: (cb: (entry: LogEvent) => void) => void

      // Auto-updater
      getAppVersion: () => Promise<string>
      checkForUpdates: () => Promise<void>
      installUpdate: () => Promise<void>
      onUpdateStatus: (cb: (status: UpdateStatus) => void) => void
      offUpdateStatus: (cb: (status: UpdateStatus) => void) => void
    }
  }
}
