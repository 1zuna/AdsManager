import { ipcMain, BrowserWindow } from 'electron'
import { GoogleSheetsService } from './services/googleSheetsService'
import { FacebookService } from './services/facebookService'
import { ConfigService } from './services/configService'
import { SchedulerService } from './services/schedulerService'
import { updaterService } from './services/updaterService'
import type { AppConfiguration, ExecutionParams, LogEvent, GroupData } from '../src/types/index'

const sheetsService = new GoogleSheetsService()
const fbService = new FacebookService()
const configService = new ConfigService()
export const schedulerService = new SchedulerService()

function getWin(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null
}

function sendLog(event: LogEvent): void {
  getWin()?.webContents.send('execution:log', event)
}

function log(message: string, type: LogEvent['type'] = 'info'): void {
  sendLog({ message, type })
  console.log(`[${type.toUpperCase()}] ${message}`)
}

// ── Shared execution loop ─────────────────────────────────────────────────────
// Implements the "Classification + Redistribution" strategy:
//
//   Case A – Start of day (all accounts Spent = 0):
//     N_fund = total accounts; set limit = min(maxBuffer, remaining / N_fund) for all
//
//   Case B – During day (≥1 account has Spent > 0):
//     Active  = accounts with Spent > 0.01   → get limit = min(maxBuffer, remaining / N_active)
//     Inactive = accounts with Spent = 0      → limit cleared (optional: autoRevokeInactive)
export async function executeForGroups(
  tabNames: string[],
  config: AppConfiguration,
  logFn: (message: string, type?: LogEvent['type']) => void,
): Promise<void> {
  logFn('Pre-flight: validating credentials...')

  try {
    const userName = await fbService.validateToken(config.facebookApiToken)
    logFn(`Pre-flight: FB token valid (${userName}).`, 'success')
  } catch {
    logFn('Pre-flight failed: Facebook API token is invalid or expired.', 'error')
    return
  }

  try {
    await sheetsService.authenticate(config.serviceAccountPath)
    logFn('Pre-flight: Google Sheets authenticated.', 'success')
  } catch (err) {
    logFn(`Pre-flight failed: Google Sheets auth error — ${err instanceof Error ? err.message : String(err)}`, 'error')
    return
  }

  const { maxBuffer, autoRevokeInactive } = config

  logFn(`Starting execution for ${tabNames.length} group(s) [maxBuffer=$${maxBuffer}, autoRevoke=${autoRevokeInactive}]...`)

  for (const tabName of tabNames) {
    logFn(`── Group: ${tabName}`)

    // Throttle: 1 batchGet per tab, 1200ms apart → ~50 reads/min (quota = 60/min)
    await sleep(1200)
    let groupData: GroupData | null
    try {
      groupData = await sheetsService.parseTab(config.googleSheetId, tabName)
    } catch (err) {
      logFn(`   Sheets error for "${tabName}": ${err instanceof Error ? err.message : String(err)}`, 'error')
      continue
    }

    if (!groupData) {
      logFn(`   No data for today (${new Date().toLocaleDateString('en-GB')}) in "${tabName}" — skipping.`, 'warning')
      continue
    }

    const { groupName, accountIds, remaining, spent: groupSpent, accountSpentMap } = groupData
    const allAccounts = accountIds!
    const remainingVal = remaining!

    // ── Step 1: Classify per-account ────────────────────────────────────────
    // Use per-account spent from columns H+ (accountSpentMap). Fall back to
    // tab-level aggregate (column F) only if accountSpentMap is absent.
    const getSpent = (id: string): number => {
      if (accountSpentMap && id in accountSpentMap) return accountSpentMap[id]
      return groupSpent ?? 0
    }

    const activeAccounts = allAccounts.filter((id) => getSpent(id) > 0.01)
    const inactiveAccounts = allAccounts.filter((id) => getSpent(id) <= 0.01)

    // Case A: all accounts at $0 → fund all (start of day)
    const isStartOfDay = activeAccounts.length === 0
    const fundedAccounts = isStartOfDay ? allAccounts : activeAccounts
    const revokedAccounts = isStartOfDay ? [] : inactiveAccounts

    const nFund = fundedAccounts.length
    if (nFund === 0) {
      logFn(`   No accounts to fund — skipping.`, 'warning')
      continue
    }

    // Case A (start of day): equal split — no spend ratio available yet
    // Case B: proportional to each account's spend share (capped at maxBuffer)
    const totalActiveSpent = isStartOfDay ? 0 : activeAccounts.reduce((s, id) => s + getSpent(id), 0)
    const getLimitForAccount = (id: string): number => {
      if (isStartOfDay || totalActiveSpent === 0) return Math.min(maxBuffer, remainingVal / nFund)
      return Math.min(maxBuffer, (getSpent(id) / totalActiveSpent) * remainingVal)
    }

    logFn(
      `   ${groupName}: ${allAccounts.length} accounts | Spent=$${(groupSpent ?? 0).toFixed(2)} | Remaining=$${remainingVal.toFixed(2)} | ${
        isStartOfDay ? `Case A — fund all ${nFund} equally` : `Case B — fund ${nFund} active (proportional), revoke ${revokedAccounts.length} inactive`
      }`,
    )

    // ── Step 2: Fund active (or all) accounts ──────────────────────────────
    for (const accountId of fundedAccounts) {
      const limit = getLimitForAccount(accountId)
      await sleep(150 + Math.random() * 250)
      const result = await fbService.setSpendingLimit(accountId, limit, config.facebookApiToken)
      if (result.success) {
        logFn(`   ✓ ${accountId} → limit set to $${limit.toFixed(2)}`, 'success')
      } else {
        logFn(`   ✗ ${accountId} → ${result.error ?? 'unknown error'}`, 'error')
      }
    }

    // ── Step 3: Revoke inactive accounts (Case B only) ─────────────────────
    if (!isStartOfDay && autoRevokeInactive && revokedAccounts.length > 0) {
      for (const accountId of revokedAccounts) {
        await sleep(150 + Math.random() * 250)
        const result = await fbService.clearSpendingLimit(accountId, config.facebookApiToken)
        if (result.success) {
          logFn(`   ↩ ${accountId} → limit cleared (inactive)`, 'info')
        } else {
          logFn(`   ✗ ${accountId} → clear failed: ${result.error ?? 'unknown error'}`, 'error')
        }
      }
    } else if (!isStartOfDay && !autoRevokeInactive && revokedAccounts.length > 0) {
      logFn(`   ℹ ${revokedAccounts.length} inactive account(s) — auto-revoke disabled, no change.`, 'info')
    }

    logFn(`── Group "${groupName}" completed.`)
  }

  logFn('Execution finished.', 'success')
}

export function registerIpcHandlers(): void {
  // Wire the scheduler's run callback (uses the shared execution loop)
  schedulerService.setRunCallback(async (config, logFn) => {
    // Fetch all tabs, then filter out schedule-excluded groups
    const excluded = config.excludedTabs
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    await sheetsService.authenticate(config.serviceAccountPath)
    const allTabs = await sheetsService.listTabs(config.googleSheetId, excluded)
    const excludedFromSchedule = config.scheduleExcludedGroups ?? []
    const tabNames = allTabs.filter((t) => !excludedFromSchedule.includes(t))
    logFn(`Scheduled job: ${tabNames.length} group(s) to process (${excludedFromSchedule.length} excluded).`)
    await executeForGroups(tabNames, config, logFn)
  })

  // ── Config ────────────────────────────────────────────────────────────────
  ipcMain.handle('config:load', () => configService.load())

  ipcMain.handle('config:save', (_event: unknown, config: Parameters<ConfigService['save']>[0]) => {
    configService.save(config)
    // Restart scheduler whenever config changes (in case time / enabled changed)
    schedulerService.start(config)
  })

  // ── Sheets ────────────────────────────────────────────────────────────────
  ipcMain.handle(
    'sheets:fetch',
    async (_event: unknown, sheetId: string, excludedTabsStr: string) => {
      const config = configService.load()
      await sheetsService.authenticate(config.serviceAccountPath)
      const excluded = excludedTabsStr
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      const tabs = await sheetsService.listTabs(sheetId, excluded)

      // Fire all tabs concurrently — this is just for UI display/selection, not execution.
      // callWithRetry in parseTab handles any occasional quota hiccup.
      const results = await Promise.allSettled(
        tabs.map((tab) => sheetsService.parseTab(sheetId, tab)),
      )
      return tabs.map((tabName, i): GroupData => {
        const r = results[i]
        if (r.status === 'fulfilled' && r.value !== null) return r.value
        return { tabName, groupName: tabName }
      })
    },
  )

  // ── Manual Execution ──────────────────────────────────────────────────────
  ipcMain.handle('execution:run', async (_event: unknown, params: ExecutionParams) => {
    const { selectedGroups, config } = params
    await executeForGroups(selectedGroups, config, (msg, type) => log(msg, type))
  })

  // ── Schedule ──────────────────────────────────────────────────────────────
  ipcMain.handle('schedule:status', () => schedulerService.getStatus())

  ipcMain.handle('schedule:start', () => {
    const config = configService.load()
    schedulerService.start(config)
    return schedulerService.getStatus()
  })

  ipcMain.handle('schedule:stop', () => {
    schedulerService.stop()
    return schedulerService.getStatus()
  })

  ipcMain.handle('schedule:lastLogs', () => schedulerService.getLastLogs())

  // ── Auto-updater ──────────────────────────────────────────────────────────
  ipcMain.handle('update:check', () => updaterService.checkForUpdates())
  ipcMain.handle('update:install', () => updaterService.quitAndInstall())
  ipcMain.handle('update:getVersion', () => {
    const { app } = require('electron') as typeof import('electron')
    return app.getVersion()
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

