import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import { readFile } from 'fs/promises'
import { registerIpcHandlers } from './ipcHandlers'

// Injected by rollup when compiled to CJS
declare const __dirname: string

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
// dist-electron/main.cjs lives inside dist-electron/; dist/ is a sibling
const RENDERER_DIST = path.join(__dirname, '..', 'dist')

let win: BrowserWindow | null

function createWindow() {
  win = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 760,
    minHeight: 560,
    title: 'FB Ads Limit Controller',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// IPC: native file picker — restricted to JSON files
ipcMain.handle('dialog:openFile', async () => {
  if (!win) return null
  const result = await dialog.showOpenDialog(win, {
    title: 'Select Google Service Account JSON',
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
    properties: ['openFile'],
  })
  return result.canceled ? null : result.filePaths[0]
})

// IPC: read file from disk — only .json allowed
ipcMain.handle('fs:readFile', async (_event: unknown, filePath: string) => {
  if (!filePath.endsWith('.json')) throw new Error('Only .json files are allowed')
  return readFile(filePath, 'utf-8')
})

// IPC: open external HTTPS URL in system browser
ipcMain.handle('shell:openExternal', (_event: unknown, url: string) => {
  if (/^https:\/\//i.test(url)) shell.openExternal(url)
})

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
})
