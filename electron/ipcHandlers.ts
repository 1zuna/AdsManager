import { ipcMain, BrowserWindow } from 'electron'
import { GoogleSheetsService } from './services/googleSheetsService'
import { FacebookService } from './services/facebookService'
import { ConfigService } from './services/configService'
import type { ExecutionParams, LogEvent, GroupData } from '../src/types/index'

const sheetsService = new GoogleSheetsService()
const fbService = new FacebookService()
const configService = new ConfigService()

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

export function registerIpcHandlers(): void {
  // ── Config ────────────────────────────────────────────────────────────────
  ipcMain.handle('config:load', () => {
    return configService.load()
  })

  ipcMain.handle('config:save', (_event: unknown, config: Parameters<ConfigService['save']>[0]) => {
    configService.save(config)
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
      // Return ALL tabs — groups without today's data appear without remaining/accountIds
      return tabs.map((tabName, i): GroupData => {
        const r = results[i]
        if (r.status === 'fulfilled' && r.value !== null) return r.value
        return { tabName, groupName: tabName }
      })
    },
  )

  // ── Execution ─────────────────────────────────────────────────────────────
  ipcMain.handle('execution:run', async (_event: unknown, params: ExecutionParams) => {
    const { selectedGroups, config } = params

    log('Pre-flight: validating credentials...')

    // Validate token before starting
    try {
      const userName = await fbService.validateToken(config.facebookApiToken)
      log(`Pre-flight: FB token valid (${userName}).`, 'success')
    } catch {
      log('Pre-flight failed: Facebook API token is invalid or expired.', 'error')
      return
    }

    // Authenticate Sheets
    try {
      await sheetsService.authenticate(config.serviceAccountPath)
      log('Pre-flight: Google Sheets authenticated.', 'success')
    } catch (err) {
      log(`Pre-flight failed: Google Sheets auth error — ${err instanceof Error ? err.message : String(err)}`, 'error')
      return
    }

    log(`Starting execution for ${selectedGroups.length} group(s)...`)

    for (const tabName of selectedGroups) {
      log(`── Group: ${tabName}`)

      // Parse today's data from this tab
      let groupData
      try {
        groupData = await sheetsService.parseTab(config.googleSheetId, tabName)
      } catch (err) {
        log(`   Sheets error for "${tabName}": ${err instanceof Error ? err.message : String(err)}`, 'error')
        continue
      }

      if (!groupData) {
        log(`   No data for today (${new Date().toLocaleDateString('en-GB')}) in "${tabName}" — skipping.`, 'warning')
        continue
      }

      const { groupName, accountIds, remaining } = groupData
      const perAccount = remaining / accountIds.length
      log(
        `   ${groupName}: ${accountIds.length} accounts, Remaining=$${remaining.toFixed(2)}, Per-account=$${perAccount.toFixed(2)}`,
      )

      for (const accountId of accountIds) {
        // Rate limit mitigation: 150–400ms between calls
        await sleep(150 + Math.random() * 250)

        const result = await fbService.setSpendingLimit(accountId, perAccount, config.facebookApiToken)

        if (result.success) {
          log(`   ✓ ${accountId} → limit set to $${perAccount.toFixed(2)}`, 'success')
        } else {
          log(`   ✗ ${accountId} → ${result.error ?? 'unknown error'} (skipping)`, 'error')
        }
      }

      log(`── Group "${groupName}" completed.`)
    }

    log('Execution finished.', 'success')
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
