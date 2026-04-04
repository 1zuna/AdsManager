import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'
import type { UpdateStatus } from '../../src/types/index'

const isDev = !!process.env['VITE_DEV_SERVER_URL']

function getWin(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null
}

function send(status: UpdateStatus): void {
  getWin()?.webContents.send('update:status', status)
}

if (!isDev) {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    send({ state: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    send({ state: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', (info) => {
    send({ state: 'not-available', version: info.version })
  })

  autoUpdater.on('download-progress', (progress) => {
    send({ state: 'downloading', percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', (info) => {
    send({ state: 'downloaded', version: info.version })
  })

  autoUpdater.on('error', (err) => {
    send({ state: 'error', error: err.message })
  })
}

export const updaterService = {
  checkForUpdates(): void {
    if (isDev) {
      send({ state: 'error', error: 'Updates not available in dev mode.' })
      return
    }
    autoUpdater.checkForUpdates().catch((err: Error) => {
      send({ state: 'error', error: err.message })
    })
  },

  quitAndInstall(): void {
    if (!isDev) {
      autoUpdater.quitAndInstall()
    }
  },
}
