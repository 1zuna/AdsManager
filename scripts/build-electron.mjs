/**
 * Compiles the Electron main process and preload using esbuild.
 *
 * Usage:
 *   node scripts/build-electron.mjs           → production CJS build
 *   node scripts/build-electron.mjs --dev     → starts Vite dev server + builds electron
 *                                               layer with inlined VITE_DEV_SERVER_URL
 *                                               + auto-launches Electron
 */

import { build } from 'esbuild'
import { spawn } from 'child_process'
import { createServer } from 'vite'

const isDev = process.argv.includes('--dev')

/** External packages that ship in node_modules at runtime — never bundle them */
const external = [
  'electron',
  'electron-updater',
  'googleapis',
  'axios',
  'date-fns',
]

async function buildElectronLayer(devServerUrl) {
  const shared = {
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external,
    sourcemap: isDev ? 'inline' : false,
    ...(devServerUrl && {
      define: { 'process.env.VITE_DEV_SERVER_URL': JSON.stringify(devServerUrl) },
    }),
  }

  await Promise.all([
    build({ ...shared, entryPoints: ['electron/main.ts'], outfile: 'dist-electron/main.cjs' }),
    build({ ...shared, entryPoints: ['electron/preload.ts'], outfile: 'dist-electron/preload.cjs' }),
  ])

  console.log(`✓ Electron layer built (${isDev ? 'dev' : 'prod'})`)
}

if (isDev) {
  // Start the Vite renderer dev server first
  const viteServer = await createServer({ configFile: './vite.config.ts', mode: 'development' })
  await viteServer.listen()
  const port = viteServer.config.server.port ?? 8080
  const devServerUrl = `http://localhost:${port}/`
  viteServer.printUrls()

  // Build electron layer with the dev server URL baked in
  await buildElectronLayer(devServerUrl)

  // Launch Electron
  const electronPath = (await import('electron')).default
  console.log(`  Launching Electron → ${devServerUrl}`)
  const proc = spawn(String(electronPath), ['.'], { stdio: 'inherit' })
  proc.on('close', async (code) => {
    await viteServer.close()
    process.exit(code ?? 0)
  })
} else {
  await buildElectronLayer(null)
}
