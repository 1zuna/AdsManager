# Implementation Plan

## Gap Analysis: Current State vs Brief/Architecture

| Requirement | Brief/Architecture Spec | Status | Notes |
|---|---|---|---|
| Desktop Electron shell | Electron + Vite + TS | ✅ Done | `electron/main.ts`, `vite-plugin-electron` wired |
| Settings Panel UI | SA path, FB token, excluded tabs | ✅ Done | Collapsible panel exists |
| Group selector dropdown | Multi-select from Sheets tabs | ⚠️ Mocked | UI exists, data is hardcoded |
| Refresh button | Reload groups from Sheets | ⚠️ Mocked | `handleRefresh` uses `MOCK_GROUPS` |
| Execution log | Real-time terminal output | ✅ Done | `ExecutionLog` component streams entries |
| Set Limit button | Runs execution pipeline | ⚠️ Mocked | `handleExecute` uses random data |
| Config persistence | `electron-store` saves credentials | ❌ Missing | Settings lost on restart |
| `googleapis` integration | Read Google Sheets from Main process | ❌ Missing | No service, not in `dependencies` |
| Sheet parsing — Group name | Cell `B2` per tab | ❌ Missing | Not implemented |
| Sheet parsing — Account IDs | Row 3, columns `H`+ until empty | ❌ Missing | Not implemented |
| Sheet parsing — Remaining | Column `G`, find today `dd/MM/yyyy` | ❌ Missing | Not implemented |
| Facebook Marketing API | `axios` PATCH per account | ❌ Missing | No service, `axios` not in deps |
| Budget split formula | `Remaining ÷ account count` | ❌ Missing | Mocked with random numbers |
| Fault tolerance | Skip failed accounts, log + continue | ❌ Missing | Mocked always-succeed |
| IPC channels per architecture | `config:save/load`, `sheets:fetch`, `execution:run`, `execution:log` | ❌ Missing | Only basic file/dialog IPC exists |
| Shared TypeScript models | `AppConfiguration`, `AdAccountLimit`, `GroupData` | ❌ Missing | Types are inline/ad-hoc |

---

## Implementation Phases

### Phase 1 — Shared Types & Data Models
**Goal:** Single source of truth for data shapes used in both Main and Renderer.

```
src/types/index.ts
```

Types to define:
- `AppConfiguration` — `{ googleSheetId, serviceAccountPath, facebookApiToken, excludedTabs }`
- `GroupData` — `{ tabName, groupName, accountIds, remaining, date }`
- `AdAccountLimit` — `{ accountId, dailyLimit, status: 'pending'|'success'|'error', error? }`
- `ExecutionResult` — `{ group, accounts: AdAccountLimit[], totalProcessed, timestamp }`

---

### Phase 2 — Main Process Services

#### 2a. `GoogleSheetsService`
```
electron/services/googleSheetsService.ts
```

Responsibilities:
1. **Authenticate** — load service account JSON from disk path, build `google.auth.GoogleAuth`
2. **`listTabs(sheetId, excludedTabs)`** — return `string[]` of non-excluded tab names
3. **`parseTab(sheetId, tabName)`** → `GroupData | null`:
   - Read `B2` → `groupName`
   - Read `H3` through `H3:ZZ3` row → collect all non-empty `accountIds`
   - Read column `G` (rows 4–200) → find cell matching today's date `dd/MM/yyyy` → return remaining value from that row (Column G value is the remaining balance per brief)

> **Note from brief:** Column G has the remaining budget; the date lookup key is also in Column G. Re-read brief:
> - "Remaining Budget: Located in column G. The app must search Column G for the row corresponding to today's date formatted as dd/MM/yyyy"
> — This is ambiguous. Column G contains both the date key AND remaining value, OR the date is in a separate column and G has the remaining. Consult the Google Sheets structure in `Knowlegdement/GOOGLE_SHEETS_STRUCTURE.md` before implementing; the most likely reading is that **Column C holds dates, Column G holds remaining** (matching `fb_auto_report` conventions). Clarify with user before coding this method.

Depends on: `googleapis` (add to `dependencies`)

#### 2b. `FacebookService`
```
electron/services/facebookService.ts
```

Responsibilities:
1. **`setSpendingLimit(accountId, dailyBudget, token)`** — PATCH `/{act_accountId}` with `daily_spend_limit` via `axios`
   - Endpoint: `https://graph.facebook.com/v21.0/act_{accountId}?access_token={token}`
   - Body: `{ daily_spend_limit: Math.round(dailyBudget * 100) }` (FB API uses cents)
   - Returns `{ success: boolean, error?: string }`
2. **`validateToken(token)`** — GET `/me?access_token={token}` to verify token is valid before execution

Depends on: `axios` (add to `dependencies`)

#### 2c. `ConfigService`
```
electron/services/configService.ts
```

Responsibilities:
1. **`save(config: AppConfiguration)`** — persist to `electron-store`
2. **`load()`** → `AppConfiguration` — reads from store, returns defaults if missing

Depends on: `electron-store` (add to `dependencies`)

---

### Phase 3 — IPC Handlers

```
electron/ipcHandlers.ts
```

Register all channels here; import into `electron/main.ts`.

| Channel | Direction | Handler |
|---|---|---|
| `config:load` | Main → Renderer | `ConfigService.load()` |
| `config:save` | Renderer → Main | `ConfigService.save(config)` |
| `sheets:fetch` | Renderer → Main | `GoogleSheetsService.listTabs()` |
| `execution:run` | Renderer → Main | Full pipeline: fetch all groups → split budget → loop FB API |
| `execution:log` | Main → Renderer | Push `{ message, type }` events during `execution:run` |

`execution:run` algorithm:
```
for each selectedGroup:
  groupData = GoogleSheetsService.parseTab(sheetId, group)
  if no groupData or no today's date → log warning, skip
  perAccount = groupData.remaining / groupData.accountIds.length
  for each accountId:
    await delay(100–500ms)  ← rate limit mitigation
    result = await FacebookService.setSpendingLimit(accountId, perAccount, token)
    emit 'execution:log' with result
```

---

### Phase 4 — Preload Bridge Expansion

```
electron/preload.ts  (update)
```

Add to `contextBridge.exposeInMainWorld('electronAPI', { ... })`:
```ts
loadConfig:    () => ipcRenderer.invoke('config:load')
saveConfig:    (config) => ipcRenderer.invoke('config:save', config)
fetchGroups:   (sheetId, excludedTabs) => ipcRenderer.invoke('sheets:fetch', sheetId, excludedTabs)
runExecution:  (params) => ipcRenderer.invoke('execution:run', params)
onLog:         (cb) => ipcRenderer.on('execution:log', (_e, entry) => cb(entry))
offLog:        (cb) => ipcRenderer.removeListener('execution:log', cb)
```

Update `src/electron.d.ts` with the new method signatures.

---

### Phase 5 — Renderer Wiring

Replace all mock logic in the renderer with real IPC calls.

#### 5a. `src/hooks/useConfig.ts`
- On mount: call `electronAPI.loadConfig()` → populate `config` state
- On save: call `electronAPI.saveConfig(config)`
- Add `googleSheetId` field to the config shape

#### 5b. `src/hooks/useGroups.ts`
- `refresh(sheetId, excludedTabs)` → calls `electronAPI.fetchGroups()` → updates `groups` state

#### 5c. `src/hooks/useExecution.ts`
- Registers `electronAPI.onLog(cb)` listener → appends to `logs` state
- `run(selectedGroups, config)` → calls `electronAPI.runExecution()`
- Cleans up listener on unmount

#### 5d. `src/pages/Index.tsx` (update)
- Replace `MOCK_GROUPS` + mock async handlers with the three hooks above
- Add `googleSheetId` input field to `SettingsPanel` (or as a new top-level input)

#### 5e. `src/components/SettingsPanel.tsx` (update)
- Add `googleSheetId` field (text input, no file picker needed)

---

### Phase 6 — Dependencies

Add to `package.json` `dependencies` (runtime, consumed in Main process):

```bash
npm install googleapis axios electron-store
```

> `electron-store` requires `"type":"commonjs"` boundary — import it only inside the `electron/` layer (already CJS via `electron/tsconfig.json`).

---

## File Changelist Summary

| File | Action |
|---|---|
| `src/types/index.ts` | **Create** — shared data models |
| `electron/services/googleSheetsService.ts` | **Create** — Sheets API integration |
| `electron/services/facebookService.ts` | **Create** — FB Marketing API integration |
| `electron/services/configService.ts` | **Create** — electron-store persistence |
| `electron/ipcHandlers.ts` | **Create** — all IPC channel registrations |
| `electron/main.ts` | **Update** — import `registerIpcHandlers` |
| `electron/preload.ts` | **Update** — expose new IPC channels |
| `src/electron.d.ts` | **Update** — types for new channels |
| `src/hooks/useConfig.ts` | **Create** — config IPC hook |
| `src/hooks/useGroups.ts` | **Create** — groups IPC hook |
| `src/hooks/useExecution.ts` | **Create** — execution + log streaming hook |
| `src/components/SettingsPanel.tsx` | **Update** — add `googleSheetId` field |
| `src/pages/Index.tsx` | **Update** — replace all mocks with real hooks |
| `package.json` | **Update** — add `googleapis`, `axios`, `electron-store` to `dependencies` |

---

## Open Question → Resolved ✅

> **Sheet Column Mapping:** Cross-checked brief vs `Knowlegdement/GOOGLE_SHEETS_STRUCTURE.md`.

The brief describes a **dedicated AdsManager sheet** with a different structure from the main summary board:

| Cell/Range | Brief Spec | Main Summary Board Convention |
|---|---|---|
| `B2` | Group name | Not used (C2 = Telegram Chat ID) |
| `C3+` | — | Dates (`dd/MM/yyyy`) |
| `H3`, `I3`, `J3`… | Account IDs (horizontal until empty) | Not used |
| Column `G` (rows 3+) | "Search for today's date" | **Remaining balance** |

The brief's phrase *"search Column G for the row corresponding to today's date"* is ambiguous. The two interpretations:

1. **Most likely (matches monorepo convention):** Column **C** holds dates, Column **G** holds remaining balance. The brief misstated the date column. `parseTab` should search **Column C** for today's date and read the **Column G** value from the same row.

2. **Literal brief reading:** Column G holds both date strings and the app picks the matching row. Unlikely given G is currency in all other tabs.

**Decision:** Implement interpretation 1 (Column C = dates, Column G = remaining). This is consistent with `fb_auto_report` and `Telegram` services. Add a code comment referencing this decision.

**Action required before first live test:** confirm the actual AdsManager Google Sheet has this column layout by opening the sheet and checking columns B, C, G, H of a sample customer tab.
