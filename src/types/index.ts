// Shared data models used by both Main process (electron/) and Renderer (src/).
// Keep this file free of Electron/DOM imports so it can be consumed by both environments.

export interface AppConfiguration {
  googleSheetId: string
  serviceAccountPath: string
  facebookApiToken: string
  excludedTabs: string
  /** Whether the daily scheduled job is enabled */
  scheduleEnabled: boolean
  /** HH:mm (24h) time to run the scheduled job each day */
  scheduleTime: string
  /** Tab names excluded from the scheduled job (manual execution is unaffected) */
  scheduleExcludedGroups: string[]
}

export const DEFAULT_CONFIG: AppConfiguration = {
  googleSheetId: '',
  serviceAccountPath: '',
  facebookApiToken: '',
  excludedTabs:
    'Configuration, RAW Data Aggregated, Dashboard Summary, Dashboard Summary (VNĐ), Ads Rules Status, Update Money, Update Money 1, CustomMessage, Bảng Tổng Hợp, USD mẫu',
  scheduleEnabled: false,
  scheduleTime: '08:00',
  scheduleExcludedGroups: [],
}

export type ScheduleState = 'idle' | 'scheduled' | 'running' | 'completed' | 'error'

export interface ScheduleStatus {
  state: ScheduleState
  /** ISO string of next scheduled trigger */
  nextRun?: string
  /** ISO string of last completed/failed run */
  lastRun?: string
  /** Error message if state === 'error' */
  error?: string
}

/** Data parsed from a single customer sheet tab */
export interface GroupData {
  tabName: string
  /** Cell B2 of the tab */
  groupName: string
  /** Account IDs from row 3, columns H onwards (act_ prefix expected). Absent when today's date was not found. */
  accountIds?: string[]
  /** Remaining budget for today (raw numeric value from Column G). Absent when today's date was not found. */
  remaining?: number
  /** Date string that matched today, format dd/MM/yyyy. Absent when today's date was not found. */
  date?: string
}

export type AccountStatus = 'pending' | 'success' | 'error'

export interface AdAccountLimit {
  accountId: string
  dailyLimit: number
  status: AccountStatus
  error?: string
}

export interface ExecutionResult {
  group: string
  accounts: AdAccountLimit[]
  totalProcessed: number
  timestamp: string
}

/** Streamed over IPC during execution */
export interface LogEvent {
  message: string
  type: 'info' | 'success' | 'error' | 'warning'
}

export interface ExecutionParams {
  selectedGroups: string[]
  config: AppConfiguration
}
