/// <reference path="../node_modules/electron/electron.d.ts" />

/**
 * Shim so that `import { app } from 'electron'` resolves correctly in IDE.
 * vite-plugin-electron handles this at build time via Rollup; this is only
 * needed for the TypeScript language server.
 */
declare module 'electron' {
  export = Electron.CrossProcessExports
}
