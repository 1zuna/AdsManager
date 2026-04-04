import type { AppConfiguration, LogEvent, ExecutionParams, GroupData } from './types/index'

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

      // Execution pipeline
      runExecution: (params: ExecutionParams) => Promise<void>
      onLog: (cb: (entry: LogEvent) => void) => void
      offLog: (cb: (entry: LogEvent) => void) => void
    }
  }
}
