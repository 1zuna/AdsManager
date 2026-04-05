# V2.0 — Double-Check Loop Strategy

## Why this plan

The current `executeForGroups()` uses a naive split: `remaining / num_accounts` for every account every time.
The V2 strategy is more realistic: only trigger a limit update when an account's buffer is low, 
cap the new limit at `Spent + min(MaxBuffer, Remaining)`, and protect the customer wallet with a 
safety-gate that redistributes if the total proposed limits would exceed the remaining balance.  
A 2-hour repeat scheduler replaces the once-daily run.

---

## Phase 0 — Data layer (Google Sheets)
- [ ] `googleSheetsService.ts`: read **Column F** (spent today) in `parseTab()` and return as `spent` field
- [ ] Update `GroupData` type: add `spent?: number`

## Phase 1 — Account limit cache
- [ ] Create `electron/services/limitCacheService.ts`
  - Persists `{ [accountId]: { limit: number, date: string } }` → `userData/limit-cache.json`
  - `getLimit(accountId): number | null`
  - `setLimit(accountId, limit): void`
  - `prunePreviousDay(): void` (called at start of each run — clear entries not from today)
- [ ] Export singleton `limitCache` from service

## Phase 2 — Config: new fields
- [ ] `src/types/index.ts`: add to `AppConfiguration`:
  - `thresholdTrigger: number` (default `20`) — buffer below which limit is raised
  - `maxBuffer: number` (default `100`) — max extra amount added per account
  - `scheduleIntervalHours: number` (default `2`) — run every N hours
- [ ] `electron/services/configService.ts`: update `DEFAULT_CONFIG` with new fields

## Phase 3 — Double-Check execution logic
- [ ] `electron/ipcHandlers.ts`: replace current simple-split `executeForGroups()` with:
  ```
  Loop 1 — Performance Check (per account):
    lastLimit = limitCache.getLimit(accountId) ?? 0
    currentBuffer = lastLimit - spent  (col F)
    if currentBuffer > thresholdTrigger → skip (still enough buffer)
    else:
      proposedLimit = spent + min(maxBuffer, remaining)  (col F + col G)
      mark account as "needs update"
  
  Loop 2 — Safety Gate (aggregate):
    totalProposed = sum(proposedLimits of accounts needing update)
    if totalProposed > remaining (col G):
      redistribute: each account gets remaining / totalAccounts (capped, not just active ones)
      log warning: "Safety gate triggered — redistributing budget"
  
  For each account needing update:
    call fbService.setSpendingLimit(accountId, finalLimit, token)
    limitCache.setLimit(accountId, finalLimit)
    log result
  ```
- [ ] Accounts that DON'T need an update: log "buffer OK — skipped" at info level

## Phase 4 — Interval-based scheduler
- [ ] `src/types/index.ts`: `ScheduleStatus` gets `intervalHours?: number`
- [ ] `electron/services/schedulerService.ts`:
  - Replace `setTimeout` (once/day at HH:mm) with `setInterval`-equivalent:
    - On `start()`: fire immediately? No — schedule first run in `intervalHours` hours
    - On trigger: run → reschedule for another `intervalHours`
  - Show `nextRun` as ISO string in status
- [ ] `electron/services/configService.ts`: remove `scheduleTime`, keep `scheduleIntervalHours`

## Phase 5 — Settings UI
- [ ] `src/components/SettingsPanel.tsx`:
  - Add **Threshold Trigger ($)** number input (bound to `config.thresholdTrigger`)
  - Add **Max Buffer ($)** number input (bound to `config.maxBuffer`)
  - Change "Daily Run Time" → **Run Interval (hours)** number input (bound to `config.scheduleIntervalHours`)
  - Remove the `scheduleTime` time-picker

## Phase 6 — Build & verify
- [ ] `node scripts/build-electron.mjs` → clean build
- [ ] `get_errors` on all modified files → zero errors

---

## Review
All 6 phases implemented, 0 TypeScript errors, clean build.

- **Phase 0**: `googleSheetsService.ts` now batch-reads column F alongside C/G/H. `parseCurrency()` extracted as shared helper.
- **Phase 1**: `limitCacheService.ts` created — persists `{accountId: {limit, date}}` to `userData/limit-cache.json`. Singleton `limitCache` exported.
- **Phase 2**: `AppConfiguration` drops `scheduleTime`, gains `scheduleIntervalHours` (default 2), `thresholdTrigger` (default 20), `maxBuffer` (default 100). `GroupData` gains `spent?`. `ScheduleStatus` gains `intervalHours?`.
- **Phase 3**: `executeForGroups()` fully rewritten with Loop 1 (buffer check per account) + Loop 2 (safety gate redistribution). Cache updated after each successful API call.
- **Phase 4**: `schedulerService.ts` replaced `msUntilTime(HH:mm)` with `intervalHours * 3600 * 1000` ms. `getStatus()` now includes `intervalHours`.
- **Phase 5**: SettingsPanel gains a 3-column grid of number inputs (Run Interval / Threshold / Max Buffer). SchedulePanel shows `(every Nh)` instead of fixed time.

