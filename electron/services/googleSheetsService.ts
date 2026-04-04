import { google } from 'googleapis'
import { format } from 'date-fns'
import type { GroupData } from '../../src/types/index'

// Column mapping for AdsManager sheet tabs (confirmed against monorepo convention):
//   B2        = group name
//   C3+       = dates (dd/MM/yyyy) — dates column
//   G3+       = remaining balance (numeric/currency)
//   H3, I3… = ad account IDs (horizontal, until empty cell)
//
// Note: The project brief stated "search Column G for today's date" but cross-referencing
// GOOGLE_SHEETS_STRUCTURE.md and fb_auto_report conventions confirms Column C holds dates
// and Column G holds remaining balance. See doc/implementation-plan.md for full rationale.

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
   * Returns all tab names from the spreadsheet, excluding system tabs.
   */
  async listTabs(sheetId: string, excludedTabs: string[]): Promise<string[]> {
    const res = await this.sheets.spreadsheets.get({ spreadsheetId: sheetId })
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

    // Batch read: B2 (group name), C3:C300 (dates), G3:G300 (remaining), H3:ZZ3 (account IDs)
    const res = await this.sheets.spreadsheets.values.batchGet({
      spreadsheetId: sheetId,
      ranges: [
        `'${tabName}'!B2`,
        `'${tabName}'!C3:C300`,
        `'${tabName}'!G3:G300`,
        `'${tabName}'!H3:ZZ3`,
      ],
    })

    const [groupNameRange, datesRange, remainingRange, accountIdsRange] =
      res.data.valueRanges ?? []

    // Group name from B2
    const groupName = (groupNameRange?.values?.[0]?.[0] as string | undefined) ?? tabName

    // Account IDs from row 3, H onwards — filter empty cells, normalise act_ prefix
    const accountRow: string[] = (accountIdsRange?.values?.[0] ?? []) as string[]
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
    const cleaned = remainingRaw.replace(/[\s$€]/g, '')
    let remaining: number
    if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(cleaned)) {
      // European format: period = thousands, comma = decimal
      remaining = parseFloat(cleaned.replace(/\./g, '').replace(',', '.'))
    } else {
      remaining = parseFloat(cleaned.replace(/,/g, ''))
    }

    if (isNaN(remaining) || remaining <= 0) return null

    return { tabName, groupName, accountIds, remaining, date: todayStr }
  }
}
