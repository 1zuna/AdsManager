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
// Used by both the manual IPC handler and the scheduled job.
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

  logFn(`Starting execution for ${tabNames.length} group(s)...`)

  for (const tabName of tabNames) {
    logFn(`── Group: ${tabName}`)

    let groupData
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

    const { groupName, accountIds, remaining } = groupData
    const perAccount = remaining! / accountIds!.length
    logFn(
      `   ${groupName}: ${accountIds!.length} accounts, Remaining=$${remaining!.toFixed(2)}, Per-account=$${perAccount.toFixed(2)}`,
    )

    for (const accountId of accountIds!) {
      await sleep(150 + Math.random() * 250)
      const result = await fbService.setSpendingLimit(accountId, perAccount, config.facebookApiToken)
      if (result.success) {
        logFn(`   ✓ ${accountId} → limit set to $${perAccount.toFixed(2)}`, 'success')
      } else {
        logFn(`   ✗ ${accountId} → ${result.error ?? 'unknown error'} (skipping)`, 'error')
      }
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
    const tabNames = allTabs.filter((t) => !config.scheduleExcludedGroups.includes(t))
    logFn(`Scheduled job: ${tabNames.length} group(s) to process (${config.scheduleExcludedGroups.length} excluded).`)
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

