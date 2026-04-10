// Shared data models used by both Main process (electron/) and Renderer (src/).
// Keep this file free of Electron/DOM imports so it can be consumed by both environments.

export interface AppConfiguration {
  googleSheetId: string
  serviceAccountPath: string
  facebookApiToken: string
  excludedTabs: string
  /** Whether the scheduled job is enabled */
  scheduleEnabled: boolean
  /** How many hours between each scheduled run (default: 2) */
  scheduleIntervalHours: number
  /** Tab names excluded from the scheduled job — empty = all groups run (manual execution is unaffected) */
  scheduleExcludedGroups: string[]
  /** Cap per account per run: limitPerAcc = min(maxBuffer, remaining / N_fund) */
  maxBuffer: number
  /** When true, inactive accounts (Spent=0 while others have Spent>0) get their limit cleared */
  autoRevokeInactive: boolean
}

export const DEFAULT_CONFIG: AppConfiguration = {
  googleSheetId: '',
  serviceAccountPath: '',
  facebookApiToken: '',
  excludedTabs:
    'Configuration, RAW Data Aggregated, Dashboard Summary, Dashboard Summary (VNĐ), Ads Rules Status, Update Money, Update Money 1, CustomMessage, Bảng Tổng Hợp, USD mẫu',
  scheduleEnabled: false,
  scheduleIntervalHours: 2,
  scheduleExcludedGroups: [],
  maxBuffer: 100,
  autoRevokeInactive: true,
}

export type ScheduleState = 'idle' | 'scheduled' | 'running' | 'completed' | 'error'

export type UpdateState = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'

export interface UpdateStatus {
  state: UpdateState
  /** Version string of the available / downloaded update */
  version?: string
  /** Download progress 0-100 */
  percent?: number
  /** Error message when state === 'error' */
  error?: string
}

export interface ScheduleStatus {
  state: ScheduleState
  /** ISO string of next scheduled trigger */
  nextRun?: string
  /** ISO string of last completed/failed run */
  lastRun?: string
  /** Error message if state === 'error' */
  error?: string
  /** Interval in hours between runs */
  intervalHours?: number
}

/** Data parsed from a single customer sheet tab */
export interface GroupData {
  tabName: string
  /** Cell B2 of the tab */
  groupName: string
  /** Account IDs from row 3, columns H onwards (act_ prefix expected). Absent when today's date was not found. */
  accountIds?: string[]
  /** Remaining budget for today (Column G). Absent when today's date was not found. */
  remaining?: number
  /** Total spent today (Column F). Absent when today's date was not found. */
  spent?: number
  /** Per-account spent map: { accountId → spent amount } for today's row (Columns H+). */
  accountSpentMap?: Record<string, number>
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
