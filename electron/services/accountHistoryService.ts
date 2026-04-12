/**
 * accountHistoryService.ts
 *
 * Persists per-account limit-setting outcomes to daily JSONL files:
 *   userData/account-history/YYYY-MM-DD.jsonl
 *
 * One JSON object per line (JSONL = newline-delimited JSON):
 *   - Append-only so each write is O(1) — no read needed
 *   - Easy to stream/parse for future analysis
 *   - Files older than 14 days are pruned automatically on each write
 *
 * Each record:
 * {
 *   ts:      ISO 8601 timestamp
 *   account: "act_XXXXXXXXXXXXXXX"
 *   group:   sheet tab name (human-readable group identifier)
 *   action:  "set_limit" | "clear_limit"
 *   amount:  number | null  (USD; null for clear_limit)
 *   success: boolean
 *   error:   string | null
 * }
 */

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

export interface AccountHistoryRecord {
  ts: string
  account: string
  group: string
  action: 'set_limit' | 'clear_limit'
  amount: number | null
  success: boolean
  error: string | null
}

const RETENTION_DAYS = 14

function getHistoryDir(): string {
  return path.join(app.getPath('userData'), 'account-history')
}

function getTodayFilePath(): string {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return path.join(getHistoryDir(), `${yyyy}-${mm}-${dd}.jsonl`)
}

function pruneOldFiles(): void {
  try {
    const dir = getHistoryDir()
    if (!fs.existsSync(dir)) return
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.jsonl')) continue
      const filePath = path.join(dir, file)
      try {
        const stat = fs.statSync(filePath)
        if (stat.mtimeMs < cutoff) fs.unlinkSync(filePath)
      } catch {
        // best-effort per file
      }
    }
  } catch {
    // best-effort
  }
}

/**
 * Append a single account history record to today's file.
 * Pruning runs at most once per process lifetime to avoid repeated I/O.
 */
let pruned = false

export function recordAccountEvent(record: AccountHistoryRecord): void {
  try {
    const filePath = getTodayFilePath()
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf8')

    if (!pruned) {
      pruned = true
      pruneOldFiles()
    }
  } catch {
    // best-effort — never crash execution over a history write failure
  }
}
