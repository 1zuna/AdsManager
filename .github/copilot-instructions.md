# AdsManager – Copilot Instructions

## Purpose
**FB Ads Limit Controller** — Electron desktop app (React + Vite + TypeScript + shadcn/ui) that reads ad-account groups from Google Sheets and sets Facebook Marketing API spending limits per account. Part of the Hieu-Summary-Board monorepo.

## Build & Run

### Development
```bash
# Web-only (browser preview, no Electron)
npm run dev

# Desktop app (Electron + Vite dev server, DevTools auto-opens)
npm run electron:dev
```

### Production builds
```bash
npm run electron:build:win    # Windows → release/*.exe (NSIS installer)
npm run electron:build:mac    # macOS  → release/*.dmg (x64 + arm64)
npm run electron:build:linux  # Linux  → release/*.AppImage
npm run electron:build        # Current platform
```

Packaged output goes to `release/`. Artifacts: `dist/` (Vite renderer), `dist-electron/` (compiled main/preload).

### Other scripts
```bash
npm run build        # Vite web build only (dist/)
npm run test         # Vitest unit tests (run once)
npm run test:watch   # Vitest watch mode
npm run lint         # ESLint
```

Package manager: **npm** (bun.lockb present but npm is used for CI/scripts).

## Architecture

```
electron/
  main.ts        # Electron main process — creates BrowserWindow, IPC handlers
  preload.ts     # Context-bridge — exposes electronAPI to renderer (secure)

src/
  electron.d.ts          # TypeScript types for window.electronAPI
  App.tsx                # Router: HashRouter in Electron, BrowserRouter in browser
  pages/Index.tsx        # Single page: all state + orchestration
  components/
    SettingsPanel.tsx    # Collapsible: service-account path (native picker), FB token, excluded tabs
    GroupSelector.tsx    # Multi-select dropdown populated from Google Sheets
    ExecutionLog.tsx     # Terminal-style auto-scrolling log panel
    NavLink.tsx          # react-router-dom NavLink convenience wrapper
    ui/                  # shadcn/ui components — don't edit, extend via CLI
  lib/utils.ts           # cn() helper (clsx + tailwind-merge)
```

**Build modes:**
- `mode === 'electron'` → `vite-plugin-electron` activates, `base: './'` (relative paths for `file://`)
- `mode === 'development'` → plain Vite SPA, `lovable-tagger` activates

**Electron process boundary:**
```
Main process (electron/main.ts)          Renderer process (React app)
  ├── dialog.showOpenDialog        ←IPC→   window.electronAPI.openFile()
  ├── fs.readFile (.json only)     ←IPC→   window.electronAPI.readFile(path)
  └── shell.openExternal (https)   ←IPC→   window.electronAPI.openExternal(url)
```

`contextIsolation: true` / `nodeIntegration: false` — all Node.js access goes through the preload bridge.

## Conventions

### Electron IPC pattern
Always use `ipcMain.handle` / `ipcRenderer.invoke` (not send/on). New IPC channels:
1. Add handler in `electron/main.ts`
2. Expose in `electron/preload.ts` via `contextBridge.exposeInMainWorld`
3. Add to `Window.electronAPI` interface in `src/electron.d.ts`

### Router
`App.tsx` auto-detects Electron via `navigator.userAgent.includes('Electron')` and uses `HashRouter`. Keep this — `BrowserRouter` breaks on `file://` protocol.

### State management
All state lives in `Index.tsx`. No global store. Pass callbacks down as props. Use `@tanstack/react-query` when adding real async data fetching.

### Styling
- Dark-only theme — no light mode vars defined
- Tailwind utility classes only; no inline styles
- Custom tokens: `terminal-bg/text/error/warning/info`, `warning`, `success`
- Fonts: `font-sans` → Inter, `font-mono` → JetBrains Mono
- Custom Button variant: `variant="execute"` — use for the primary action button

### `@/` alias
Maps to `src/`. Always use for cross-component imports.

### shadcn/ui
`src/components/ui/` is auto-generated. Add new components via CLI:
```bash
npx shadcn-ui@latest add <component>
```

### LogEntry pattern
```ts
type LogEntry = { id: string; timestamp: string; message: string; type: "info" | "success" | "error" | "warning" }
// Construct:
{ id: crypto.randomUUID(), timestamp: now(), message: "...", type: "success" }
```

### System tab exclusion list (keep in sync across monorepo)
```
Configuration, RAW Data Aggregated, Dashboard Summary, Dashboard Summary (VNĐ),
Ads Rules Status, Update Money, Update Money 1, CustomMessage, Bảng Tổng Hợp, USD mẫu
```

## Deploying / Packaging

### Prerequisites
- Place app icons in `assets/` before building:
  - `assets/icon.ico` (Windows)
  - `assets/icon.icns` (macOS)
  - `assets/icon.png` (Linux, min 256×256)
- `electron-builder` config lives in `package.json` under `"build"` key

### Release output structure
```
release/
  FB Ads Limit Controller Setup 1.0.0.exe   ← Windows NSIS installer
  FB Ads Limit Controller-1.0.0.dmg         ← macOS disk image
  FB Ads Limit Controller-1.0.0.AppImage    ← Linux portable
```

### Bump version
Update `version` in `package.json` before each release build.

## Key Integration Points

| Concern | Where | Notes |
|---------|-------|-------|
| Google Sheets groups | `handleRefresh` in `Index.tsx` | Currently mocked; will use Google Sheets API with service-account.json read via `window.electronAPI.readFile` |
| Facebook API limits | `handleExecute` in `Index.tsx` | Currently mocked; will use FB Marketing API with token from config |
| Credentials | `SettingsPanel` → `config` state | service-account path resolved natively via file dialog; token stored in memory only |

## Pitfalls

- **`base: './'` is required** for electron builds — Vite's default `/` prefix makes asset URLs break under `file://`
- **FB account IDs use `act_` prefix** — e.g., `act_1234567890`
- **`window.electronAPI` is `undefined` in browser** — always use optional chaining `window.electronAPI?.openFile()`
- **`dist-electron/main.cjs`** — electron entry is compiled CJS (`.cjs` extension) to coexist with `"type":"module"` in package.json
- **Vitest config**: tests use `src/test/setup.ts`; see [vitest.config.ts](../vitest.config.ts)
- **`lovable-tagger`** Vite plugin (dev-only, from Lovable.dev) — leave in place; harmless in other environments
