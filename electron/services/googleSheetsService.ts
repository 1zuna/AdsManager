import { google } from 'googleapis'
import { format } from 'date-fns'
import type { GroupData } from '../../src/types/index'

// Column mapping for AdsManager sheet tabs (confirmed against monorepo convention):
//   B2        = group name
//   C3+       = dates (dd/MM/yyyy) — dates column
//   F3+       = total spent today
//   G3+       = remaining balance (numeric/currency)
//   H3, I3… = ad account IDs (horizontal, until empty cell)

export class GoogleSheetsService {
  private auth: InstanceType<typeof google.auth.GoogleAuth> | null = null

  /**
   * Initialise authentication from a service account JSON file path.
   * Called once when credentials are configured or changed.
   */
  async authenticate(serviceAccountPath: string): Promise<void> {
    this.auth = new google.auth.GoogleAuth({
      keyFile: serviceAccountPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })
    // Eagerly verify credentials are valid
    await this.auth.getClient()
  }

  private get sheets() {
    if (!this.auth) throw new Error('GoogleSheetsService: not authenticated. Call authenticate() first.')
    return google.sheets({ version: 'v4', auth: this.auth })
  }

  /**
   * Wraps an API call with retry + exponential backoff to handle quota errors (429).
   * Mirrors reconciliation.py's execute_with_retry(): waits 2s, 4s, 8s before giving up.
   */
  private async callWithRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
    let lastErr: unknown
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn()
      } catch (err: unknown) {
        const e = err as Record<string, unknown>
        const status = (e?.response as Record<string, unknown>)?.status
        const message = String(e?.message ?? '')
        const isQuota = status === 429 || message.includes('Quota exceeded') || message.includes('RESOURCE_EXHAUSTED')
        if (isQuota && attempt < retries) {
          const waitMs = 2000 * Math.pow(2, attempt) // 2s → 4s → 8s
          await new Promise((r) => setTimeout(r, waitMs))
          lastErr = err
          continue
        }
        throw err
      }
    }
    throw lastErr
  }

  /**
   * Returns all tab names from the spreadsheet, excluding system tabs.
   */
  async listTabs(sheetId: string, excludedTabs: string[]): Promise<string[]> {
    const res = await this.callWithRetry(() => this.sheets.spreadsheets.get({ spreadsheetId: sheetId }))
    const sheets = res.data.sheets ?? []
    return sheets
      .map((s) => s.properties?.title ?? '')
      .filter((name) => name && !excludedTabs.includes(name.trim()))
  }

  /**
   * Parses a single customer tab and returns today's GroupData, or null if:
   * - today's date is not found in Column C
   * - no account IDs are present in row 3 (H3+)
   * - remaining balance is missing or zero
   */
  async parseTab(sheetId: string, tabName: string): Promise<GroupData | null> {
    const todayStr = format(new Date(), 'dd/MM/yyyy')

    // Batch read: B2 (group name), C3:C300 (dates), F3:F300 (spent), G3:G300 (remaining),
    // H3:ZZ300 (row 3 = account IDs; today's row = per-account spent values)
    const res = await this.callWithRetry(() =>
      this.sheets.spreadsheets.values.batchGet({
        spreadsheetId: sheetId,
        ranges: [
          `'${tabName}'!B2`,
          `'${tabName}'!C3:C300`,
          `'${tabName}'!F3:F300`,
          `'${tabName}'!G3:G300`,
          `'${tabName}'!H3:ZZ300`,
        ],
      }),
    )

    const [groupNameRange, datesRange, spentRange, remainingRange, accountBlockRange] =
      res.data.valueRanges ?? []

    // Group name from B2
    const groupName = (groupNameRange?.values?.[0]?.[0] as string | undefined) ?? tabName

    // Account IDs from row 3 (index 0), H onwards — filter empty cells, normalise act_ prefix
    const accountRow: string[] = (accountBlockRange?.values?.[0] ?? []) as string[]
    const accountIds = accountRow
      .map((id) => String(id).trim())
      .filter(Boolean)
      .map((id) => (id.startsWith('act_') ? id : `act_${id}`))

    if (accountIds.length === 0) return null

    // Find row index where Column C matches today's date
    const dates: string[] = (datesRange?.values ?? []).map((row) => String(row[0] ?? '').trim())
    const rowIndex = dates.findIndex((d) => d === todayStr)
    if (rowIndex === -1) return null

    // Read Column G at the same row index
    const remainingRaw = (remainingRange?.values?.[rowIndex]?.[0] as string | undefined) ?? ''
    if (!remainingRaw) return null

    // Parse European currency format — strip $ and whitespace, convert comma/period
    // e.g. "$5.942,43" → 5942.43  |  "$104,40" → 104.40
    const remaining = parseCurrency(remainingRaw)
    if (isNaN(remaining) || remaining <= 0) return null

    // Read Column F at the same row index (spent today) — may be absent / zero on day start
    const spentRaw = (spentRange?.values?.[rowIndex]?.[0] as string | undefined) ?? '0'
    const spent = parseCurrency(spentRaw)

    // Build per-account spent map: accountIds[i] → H[rowIndex][i]
    // accountBlockRange row 0 = account IDs (H3), row rowIndex = per-account spent (H[3+rowIndex])
    const perAccountRow: string[] = (accountBlockRange?.values?.[rowIndex] ?? []) as string[]
    const accountSpentMap: Record<string, number> = {}
    for (let i = 0; i < accountIds.length; i++) {
      const rawVal = perAccountRow[i] ?? '0'
      const parsedVal = parseCurrency(rawVal)
      accountSpentMap[accountIds[i]] = isNaN(parsedVal) ? 0 : parsedVal
    }

    return { tabName, groupName, accountIds, remaining, spent: isNaN(spent) ? 0 : spent, accountSpentMap, date: todayStr }
  }
}

/** Parse European or US currency strings to float.
 *  "$5.942,43" → 5942.43  |  "$104,40" → 104.40  |  "1234.56" → 1234.56
 */
function parseCurrency(raw: string): number {
  const cleaned = raw.replace(/[\s$€]/g, '')
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(cleaned)) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'))
  }
  return parseFloat(cleaned.replace(/,/g, ''))
}
