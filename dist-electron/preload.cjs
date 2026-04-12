// electron/preload.ts
var import_electron = require("electron");
var logListeners = /* @__PURE__ */ new Map();
var scheduleStatusListeners = /* @__PURE__ */ new Map();
var scheduleLogListeners = /* @__PURE__ */ new Map();
var tabDataListeners = /* @__PURE__ */ new Map();
var updateStatusListeners = /* @__PURE__ */ new Map();
import_electron.contextBridge.exposeInMainWorld("electronAPI", {
  // ── File system (original) ──────────────────────────────────────────────
  openFile: () => import_electron.ipcRenderer.invoke("dialog:openFile"),
  readFile: (filePath) => import_electron.ipcRenderer.invoke("fs:readFile", filePath),
  openExternal: (url) => import_electron.ipcRenderer.invoke("shell:openExternal", url),
  // ── Config ───────────────────────────────────────────────────────────────
  loadConfig: () => import_electron.ipcRenderer.invoke("config:load"),
  saveConfig: (config) => import_electron.ipcRenderer.invoke("config:save", config),
  // ── Google Sheets ─────────────────────────────────────────────────────────
  fetchGroups: (sheetId, excludedTabs) => import_electron.ipcRenderer.invoke("sheets:fetch", sheetId, excludedTabs),
  loadGroupDetails: (sheetId, tabNames) => import_electron.ipcRenderer.invoke("sheets:loadDetails", sheetId, tabNames),
  onTabData: (cb) => {
    const wrapped = (_e, data) => cb(data);
    tabDataListeners.set(cb, wrapped);
    import_electron.ipcRenderer.on("sheets:tab-data", wrapped);
  },
  offTabData: (cb) => {
    const wrapped = tabDataListeners.get(cb);
    if (wrapped) {
      import_electron.ipcRenderer.removeListener("sheets:tab-data", wrapped);
      tabDataListeners.delete(cb);
    }
  },
  // ── Execution ─────────────────────────────────────────────────────────────
  runExecution: (params) => import_electron.ipcRenderer.invoke("execution:run", params),
  onLog: (cb) => {
    const wrapped = (_e, entry) => cb(entry);
    logListeners.set(cb, wrapped);
    import_electron.ipcRenderer.on("execution:log", wrapped);
  },
  offLog: (cb) => {
    const wrapped = logListeners.get(cb);
    if (wrapped) {
      import_electron.ipcRenderer.removeListener("execution:log", wrapped);
      logListeners.delete(cb);
    }
  },
  // ── Schedule ───────────────────────────────────────────────────────────────
  getScheduleStatus: () => import_electron.ipcRenderer.invoke("schedule:status"),
  startSchedule: () => import_electron.ipcRenderer.invoke("schedule:start"),
  stopSchedule: () => import_electron.ipcRenderer.invoke("schedule:stop"),
  getScheduleLastLogs: () => import_electron.ipcRenderer.invoke("schedule:lastLogs"),
  onScheduleStatus: (cb) => {
    const wrapped = (_e, status) => cb(status);
    scheduleStatusListeners.set(cb, wrapped);
    import_electron.ipcRenderer.on("schedule:status-changed", wrapped);
  },
  offScheduleStatus: (cb) => {
    const wrapped = scheduleStatusListeners.get(cb);
    if (wrapped) {
      import_electron.ipcRenderer.removeListener("schedule:status-changed", wrapped);
      scheduleStatusListeners.delete(cb);
    }
  },
  onScheduleLog: (cb) => {
    const wrapped = (_e, entry) => cb(entry);
    scheduleLogListeners.set(cb, wrapped);
    import_electron.ipcRenderer.on("schedule:log", wrapped);
  },
  offScheduleLog: (cb) => {
    const wrapped = scheduleLogListeners.get(cb);
    if (wrapped) {
      import_electron.ipcRenderer.removeListener("schedule:log", wrapped);
      scheduleLogListeners.delete(cb);
    }
  },
  // ── Auto-updater ────────────────────────────────────────────────────────
  getAppVersion: () => import_electron.ipcRenderer.invoke("update:getVersion"),
  checkForUpdates: () => import_electron.ipcRenderer.invoke("update:check"),
  installUpdate: () => import_electron.ipcRenderer.invoke("update:install"),
  onUpdateStatus: (cb) => {
    const wrapped = (_e, status) => cb(status);
    updateStatusListeners.set(cb, wrapped);
    import_electron.ipcRenderer.on("update:status", wrapped);
  },
  offUpdateStatus: (cb) => {
    const wrapped = updateStatusListeners.get(cb);
    if (wrapped) {
      import_electron.ipcRenderer.removeListener("update:status", wrapped);
      updateStatusListeners.delete(cb);
    }
  }
});
