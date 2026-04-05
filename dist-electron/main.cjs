var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// electron/main.ts
var import_electron5 = require("electron");
var import_path = __toESM(require("path"), 1);
var import_promises = require("fs/promises");

// electron/ipcHandlers.ts
var import_electron4 = require("electron");

// electron/services/googleSheetsService.ts
var import_googleapis = require("googleapis");
var import_date_fns = require("date-fns");
var GoogleSheetsService = class {
  constructor() {
    this.auth = null;
  }
  /**
   * Initialise authentication from a service account JSON file path.
   * Called once when credentials are configured or changed.
   */
  async authenticate(serviceAccountPath) {
    this.auth = new import_googleapis.google.auth.GoogleAuth({
      keyFile: serviceAccountPath,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
    });
    await this.auth.getClient();
  }
  get sheets() {
    if (!this.auth) throw new Error("GoogleSheetsService: not authenticated. Call authenticate() first.");
    return import_googleapis.google.sheets({ version: "v4", auth: this.auth });
  }
  /**
   * Returns all tab names from the spreadsheet, excluding system tabs.
   */
  async listTabs(sheetId, excludedTabs) {
    const res = await this.sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheets = res.data.sheets ?? [];
    return sheets.map((s) => s.properties?.title ?? "").filter((name) => name && !excludedTabs.includes(name.trim()));
  }
  /**
   * Parses a single customer tab and returns today's GroupData, or null if:
   * - today's date is not found in Column C
   * - no account IDs are present in row 3 (H3+)
   * - remaining balance is missing or zero
   */
  async parseTab(sheetId, tabName) {
    const todayStr = (0, import_date_fns.format)(/* @__PURE__ */ new Date(), "dd/MM/yyyy");
    const res = await this.sheets.spreadsheets.values.batchGet({
      spreadsheetId: sheetId,
      ranges: [
        `'${tabName}'!B2`,
        `'${tabName}'!C3:C300`,
        `'${tabName}'!F3:F300`,
        `'${tabName}'!G3:G300`,
        `'${tabName}'!H3:ZZ300`
      ]
    });
    const [groupNameRange, datesRange, spentRange, remainingRange, accountBlockRange] = res.data.valueRanges ?? [];
    const groupName = groupNameRange?.values?.[0]?.[0] ?? tabName;
    const accountRow = accountBlockRange?.values?.[0] ?? [];
    const accountIds = accountRow.map((id) => String(id).trim()).filter(Boolean).map((id) => id.startsWith("act_") ? id : `act_${id}`);
    if (accountIds.length === 0) return null;
    const dates = (datesRange?.values ?? []).map((row) => String(row[0] ?? "").trim());
    const rowIndex = dates.findIndex((d) => d === todayStr);
    if (rowIndex === -1) return null;
    const remainingRaw = remainingRange?.values?.[rowIndex]?.[0] ?? "";
    if (!remainingRaw) return null;
    const remaining = parseCurrency(remainingRaw);
    if (isNaN(remaining) || remaining <= 0) return null;
    const spentRaw = spentRange?.values?.[rowIndex]?.[0] ?? "0";
    const spent = parseCurrency(spentRaw);
    const perAccountRow = accountBlockRange?.values?.[rowIndex] ?? [];
    const accountSpentMap = {};
    for (let i = 0; i < accountIds.length; i++) {
      const rawVal = perAccountRow[i] ?? "0";
      const parsedVal = parseCurrency(rawVal);
      accountSpentMap[accountIds[i]] = isNaN(parsedVal) ? 0 : parsedVal;
    }
    return { tabName, groupName, accountIds, remaining, spent: isNaN(spent) ? 0 : spent, accountSpentMap, date: todayStr };
  }
};
function parseCurrency(raw) {
  const cleaned = raw.replace(/[\s$€]/g, "");
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(cleaned)) {
    return parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
  }
  return parseFloat(cleaned.replace(/,/g, ""));
}

// electron/services/facebookService.ts
var import_axios = __toESM(require("axios"), 1);
var FB_API_VERSION = "v24.0";
var FB_API_BASE = `https://graph.facebook.com/${FB_API_VERSION}`;
var FacebookService = class {
  /**
   * Verifies a token is valid by calling /me.
   * Returns the app user name on success, throws on failure.
   */
  async validateToken(token) {
    const res = await import_axios.default.get(`${FB_API_BASE}/me`, {
      params: { access_token: token, fields: "name" },
      timeout: 1e4
    });
    return res.data.name;
  }
  /**
   * Sets the spend cap for a single ad account.
   * POST https://graph.facebook.com/v24.0/act_{id}?spend_cap={cents}&access_token={token}
   * Facebook API expects the amount in cents (USD * 100).
   *
   * @param accountId - with or without "act_" prefix; will normalise
   * @param dailyBudgetUSD - dollar amount (e.g. 150.50)
   * @param token - Facebook Marketing API access token
   */
  async setSpendingLimit(accountId, dailyBudgetUSD, token) {
    const normalised = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
    const spendCap = dailyBudgetUSD;
    try {
      await import_axios.default.post(
        `${FB_API_BASE}/${normalised}`,
        null,
        {
          params: {
            access_token: token,
            spend_cap: spendCap
          },
          timeout: 15e3
        }
      );
      return { success: true };
    } catch (err) {
      const message = extractFbError(err);
      return { success: false, error: message };
    }
  }
  /**
   * Deletes the spend cap for an ad account using spend_cap_action=delete.
   * Used for inactive accounts in Case B to prevent budget lock-up.
   */
  async clearSpendingLimit(accountId, token) {
    const normalised = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
    try {
      await import_axios.default.post(`${FB_API_BASE}/${normalised}`, null, {
        params: { access_token: token, spend_cap_action: "delete" },
        timeout: 15e3
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: extractFbError(err) };
    }
  }
};
function extractFbError(err) {
  if (import_axios.default.isAxiosError(err)) {
    const data = err.response?.data;
    if (data?.error?.message) return `FB API ${data.error.code ?? ""}: ${data.error.message}`;
    if (err.code === "ECONNABORTED") return "Request timed out";
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

// electron/services/configService.ts
var import_electron = require("electron");
var fs = __toESM(require("fs"), 1);
var path = __toESM(require("path"), 1);
var DEFAULT_CONFIG = {
  googleSheetId: "",
  serviceAccountPath: "",
  facebookApiToken: "",
  excludedTabs: "Configuration, RAW Data Aggregated, Dashboard Summary, Dashboard Summary (VN\u0110), Ads Rules Status, Update Money, Update Money 1, CustomMessage, B\u1EA3ng T\u1ED5ng H\u1EE3p, USD m\u1EABu",
  scheduleEnabled: false,
  scheduleIntervalHours: 2,
  scheduleIncludedGroups: [],
  maxBuffer: 100,
  autoRevokeInactive: true
};
function getConfigPath() {
  return path.join(import_electron.app.getPath("userData"), "config.json");
}
var ConfigService = class {
  load() {
    try {
      const raw = fs.readFileSync(getConfigPath(), "utf-8");
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }
  save(config) {
    const configPath = getConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
  }
};

// electron/services/schedulerService.ts
var import_electron2 = require("electron");
var MAX_LOG_ENTRIES = 500;
var SchedulerService = class {
  constructor() {
    this.timer = null;
    this.state = "idle";
    this.lastRunLogs = [];
    this.runCallback = null;
    this.intervalHours = 2;
  }
  setRunCallback(cb) {
    this.runCallback = cb;
  }
  // ── Start / Stop ──────────────────────────────────────────────────────────
  start(config) {
    this.stop();
    if (!config.scheduleEnabled) {
      this.setState("idle");
      return;
    }
    this.intervalHours = config.scheduleIntervalHours ?? 2;
    this.scheduleNext(config);
  }
  stop() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.state !== "running") {
      this.setState("idle");
    }
  }
  // ── Status ────────────────────────────────────────────────────────────────
  getStatus() {
    return {
      state: this.state,
      nextRun: this.nextRun,
      lastRun: this.lastRun,
      error: this.lastError,
      intervalHours: this.intervalHours
    };
  }
  getLastLogs() {
    return [...this.lastRunLogs];
  }
  // ── Internal ──────────────────────────────────────────────────────────────
  scheduleNext(config) {
    const msUntil = (config.scheduleIntervalHours ?? 2) * 60 * 60 * 1e3;
    this.nextRun = new Date(Date.now() + msUntil).toISOString();
    this.setState("scheduled");
    this.timer = setTimeout(async () => {
      this.timer = null;
      await this.trigger(config);
      this.scheduleNext(config);
    }, msUntil);
  }
  async trigger(config) {
    if (!this.runCallback) return;
    this.lastRunLogs = [];
    this.setState("running");
    this.lastError = void 0;
    const logFn = (message, type = "info") => {
      const event = { message, type };
      this.lastRunLogs.push(event);
      if (this.lastRunLogs.length > MAX_LOG_ENTRIES) this.lastRunLogs.shift();
      getWin()?.webContents.send("schedule:log", event);
    };
    try {
      await this.runCallback(config, logFn);
      this.lastRun = (/* @__PURE__ */ new Date()).toISOString();
      this.setState("completed");
    } catch (err) {
      this.lastRun = (/* @__PURE__ */ new Date()).toISOString();
      this.lastError = err instanceof Error ? err.message : String(err);
      this.setState("error");
    }
  }
  setState(state) {
    this.state = state;
    getWin()?.webContents.send("schedule:status-changed", this.getStatus());
  }
};
function getWin() {
  return import_electron2.BrowserWindow.getAllWindows()[0] ?? null;
}

// electron/services/updaterService.ts
var import_electron_updater = require("electron-updater");
var import_electron3 = require("electron");
var isDev = true;
function getWin2() {
  return import_electron3.BrowserWindow.getAllWindows()[0] ?? null;
}
function send(status) {
  getWin2()?.webContents.send("update:status", status);
}
if (!isDev) {
  import_electron_updater.autoUpdater.autoDownload = true;
  import_electron_updater.autoUpdater.autoInstallOnAppQuit = true;
  import_electron_updater.autoUpdater.on("checking-for-update", () => {
    send({ state: "checking" });
  });
  import_electron_updater.autoUpdater.on("update-available", (info) => {
    send({ state: "available", version: info.version });
  });
  import_electron_updater.autoUpdater.on("update-not-available", (info) => {
    send({ state: "not-available", version: info.version });
  });
  import_electron_updater.autoUpdater.on("download-progress", (progress) => {
    send({ state: "downloading", percent: Math.round(progress.percent) });
  });
  import_electron_updater.autoUpdater.on("update-downloaded", (info) => {
    send({ state: "downloaded", version: info.version });
  });
  import_electron_updater.autoUpdater.on("error", (err) => {
    send({ state: "error", error: err.message });
  });
}
var updaterService = {
  checkForUpdates() {
    if (isDev) {
      send({ state: "error", error: "Updates not available in dev mode." });
      return;
    }
    import_electron_updater.autoUpdater.checkForUpdates().catch((err) => {
      send({ state: "error", error: err.message });
    });
  },
  quitAndInstall() {
    if (!isDev) {
      import_electron_updater.autoUpdater.quitAndInstall();
    }
  }
};

// electron/ipcHandlers.ts
var sheetsService = new GoogleSheetsService();
var fbService = new FacebookService();
var configService = new ConfigService();
var schedulerService = new SchedulerService();
function getWin3() {
  return import_electron4.BrowserWindow.getAllWindows()[0] ?? null;
}
function sendLog(event) {
  getWin3()?.webContents.send("execution:log", event);
}
function log(message, type = "info") {
  sendLog({ message, type });
  console.log(`[${type.toUpperCase()}] ${message}`);
}
async function executeForGroups(tabNames, config, logFn) {
  logFn("Pre-flight: validating credentials...");
  try {
    const userName = await fbService.validateToken(config.facebookApiToken);
    logFn(`Pre-flight: FB token valid (${userName}).`, "success");
  } catch {
    logFn("Pre-flight failed: Facebook API token is invalid or expired.", "error");
    return;
  }
  try {
    await sheetsService.authenticate(config.serviceAccountPath);
    logFn("Pre-flight: Google Sheets authenticated.", "success");
  } catch (err) {
    logFn(`Pre-flight failed: Google Sheets auth error \u2014 ${err instanceof Error ? err.message : String(err)}`, "error");
    return;
  }
  const { maxBuffer, autoRevokeInactive } = config;
  logFn(`Starting execution for ${tabNames.length} group(s) [maxBuffer=$${maxBuffer}, autoRevoke=${autoRevokeInactive}]...`);
  for (const tabName of tabNames) {
    logFn(`\u2500\u2500 Group: ${tabName}`);
    let groupData;
    try {
      groupData = await sheetsService.parseTab(config.googleSheetId, tabName);
    } catch (err) {
      logFn(`   Sheets error for "${tabName}": ${err instanceof Error ? err.message : String(err)}`, "error");
      continue;
    }
    if (!groupData) {
      logFn(`   No data for today (${(/* @__PURE__ */ new Date()).toLocaleDateString("en-GB")}) in "${tabName}" \u2014 skipping.`, "warning");
      continue;
    }
    const { groupName, accountIds, remaining, spent: groupSpent, accountSpentMap } = groupData;
    const allAccounts = accountIds;
    const remainingVal = remaining;
    const getSpent = (id) => {
      if (accountSpentMap && id in accountSpentMap) return accountSpentMap[id];
      return groupSpent ?? 0;
    };
    const activeAccounts = allAccounts.filter((id) => getSpent(id) > 0.01);
    const inactiveAccounts = allAccounts.filter((id) => getSpent(id) <= 0.01);
    const isStartOfDay = activeAccounts.length === 0;
    const fundedAccounts = isStartOfDay ? allAccounts : activeAccounts;
    const revokedAccounts = isStartOfDay ? [] : inactiveAccounts;
    const nFund = fundedAccounts.length;
    if (nFund === 0) {
      logFn(`   No accounts to fund \u2014 skipping.`, "warning");
      continue;
    }
    const totalActiveSpent = isStartOfDay ? 0 : activeAccounts.reduce((s, id) => s + getSpent(id), 0);
    const getLimitForAccount = (id) => {
      if (isStartOfDay || totalActiveSpent === 0) return Math.min(maxBuffer, remainingVal / nFund);
      return Math.min(maxBuffer, getSpent(id) / totalActiveSpent * remainingVal);
    };
    logFn(
      `   ${groupName}: ${allAccounts.length} accounts | Spent=$${(groupSpent ?? 0).toFixed(2)} | Remaining=$${remainingVal.toFixed(2)} | ${isStartOfDay ? `Case A \u2014 fund all ${nFund} equally` : `Case B \u2014 fund ${nFund} active (proportional), revoke ${revokedAccounts.length} inactive`}`
    );
    for (const accountId of fundedAccounts) {
      const limit = getLimitForAccount(accountId);
      await sleep(150 + Math.random() * 250);
      const result = await fbService.setSpendingLimit(accountId, limit, config.facebookApiToken);
      if (result.success) {
        logFn(`   \u2713 ${accountId} \u2192 limit set to $${limit.toFixed(2)}`, "success");
      } else {
        logFn(`   \u2717 ${accountId} \u2192 ${result.error ?? "unknown error"}`, "error");
      }
    }
    if (!isStartOfDay && autoRevokeInactive && revokedAccounts.length > 0) {
      for (const accountId of revokedAccounts) {
        await sleep(150 + Math.random() * 250);
        const result = await fbService.clearSpendingLimit(accountId, config.facebookApiToken);
        if (result.success) {
          logFn(`   \u21A9 ${accountId} \u2192 limit cleared (inactive)`, "info");
        } else {
          logFn(`   \u2717 ${accountId} \u2192 clear failed: ${result.error ?? "unknown error"}`, "error");
        }
      }
    } else if (!isStartOfDay && !autoRevokeInactive && revokedAccounts.length > 0) {
      logFn(`   \u2139 ${revokedAccounts.length} inactive account(s) \u2014 auto-revoke disabled, no change.`, "info");
    }
    logFn(`\u2500\u2500 Group "${groupName}" completed.`);
  }
  logFn("Execution finished.", "success");
}
function registerIpcHandlers() {
  schedulerService.setRunCallback(async (config, logFn) => {
    const excluded = config.excludedTabs.split(",").map((t) => t.trim()).filter(Boolean);
    await sheetsService.authenticate(config.serviceAccountPath);
    const allTabs = await sheetsService.listTabs(config.googleSheetId, excluded);
    const included = config.scheduleIncludedGroups ?? [];
    const tabNames = included.length > 0 ? allTabs.filter((t) => included.includes(t)) : [];
    logFn(`Scheduled job: ${tabNames.length} group(s) to process (${included.length} included, ${allTabs.length - tabNames.length} skipped).`);
    await executeForGroups(tabNames, config, logFn);
  });
  import_electron4.ipcMain.handle("config:load", () => configService.load());
  import_electron4.ipcMain.handle("config:save", (_event, config) => {
    configService.save(config);
    schedulerService.start(config);
  });
  import_electron4.ipcMain.handle(
    "sheets:fetch",
    async (_event, sheetId, excludedTabsStr) => {
      const config = configService.load();
      await sheetsService.authenticate(config.serviceAccountPath);
      const excluded = excludedTabsStr.split(",").map((t) => t.trim()).filter(Boolean);
      const tabs = await sheetsService.listTabs(sheetId, excluded);
      const results = await Promise.allSettled(
        tabs.map((tab) => sheetsService.parseTab(sheetId, tab))
      );
      return tabs.map((tabName, i) => {
        const r = results[i];
        if (r.status === "fulfilled" && r.value !== null) return r.value;
        return { tabName, groupName: tabName };
      });
    }
  );
  import_electron4.ipcMain.handle("execution:run", async (_event, params) => {
    const { selectedGroups, config } = params;
    await executeForGroups(selectedGroups, config, (msg, type) => log(msg, type));
  });
  import_electron4.ipcMain.handle("schedule:status", () => schedulerService.getStatus());
  import_electron4.ipcMain.handle("schedule:start", () => {
    const config = configService.load();
    schedulerService.start(config);
    return schedulerService.getStatus();
  });
  import_electron4.ipcMain.handle("schedule:stop", () => {
    schedulerService.stop();
    return schedulerService.getStatus();
  });
  import_electron4.ipcMain.handle("schedule:lastLogs", () => schedulerService.getLastLogs());
  import_electron4.ipcMain.handle("update:check", () => updaterService.checkForUpdates());
  import_electron4.ipcMain.handle("update:install", () => updaterService.quitAndInstall());
  import_electron4.ipcMain.handle("update:getVersion", () => {
    const { app: app3 } = require("electron");
    return app3.getVersion();
  });
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// electron/main.ts
var VITE_DEV_SERVER_URL = "http://localhost:8080/";
var RENDERER_DIST = import_path.default.join(__dirname, "..", "dist");
var win;
function createWindow() {
  win = new import_electron5.BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 760,
    minHeight: 560,
    title: "FB Ads Limit Controller",
    webPreferences: {
      preload: import_path.default.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(import_path.default.join(RENDERER_DIST, "index.html"));
  }
}
import_electron5.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    import_electron5.app.quit();
    win = null;
  }
});
import_electron5.app.on("activate", () => {
  if (import_electron5.BrowserWindow.getAllWindows().length === 0) createWindow();
});
import_electron5.ipcMain.handle("dialog:openFile", async () => {
  if (!win) return null;
  const result = await import_electron5.dialog.showOpenDialog(win, {
    title: "Select Google Service Account JSON",
    filters: [{ name: "JSON Files", extensions: ["json"] }],
    properties: ["openFile"]
  });
  return result.canceled ? null : result.filePaths[0];
});
import_electron5.ipcMain.handle("fs:readFile", async (_event, filePath) => {
  if (!filePath.endsWith(".json")) throw new Error("Only .json files are allowed");
  return (0, import_promises.readFile)(filePath, "utf-8");
});
import_electron5.ipcMain.handle("shell:openExternal", (_event, url) => {
  if (/^https:\/\//i.test(url)) import_electron5.shell.openExternal(url);
});
import_electron5.app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  const savedConfig = new ConfigService().load();
  if (savedConfig.scheduleEnabled) {
    schedulerService.start(savedConfig);
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vZWxlY3Ryb24vbWFpbi50cyIsICIuLi9lbGVjdHJvbi9pcGNIYW5kbGVycy50cyIsICIuLi9lbGVjdHJvbi9zZXJ2aWNlcy9nb29nbGVTaGVldHNTZXJ2aWNlLnRzIiwgIi4uL2VsZWN0cm9uL3NlcnZpY2VzL2ZhY2Vib29rU2VydmljZS50cyIsICIuLi9lbGVjdHJvbi9zZXJ2aWNlcy9jb25maWdTZXJ2aWNlLnRzIiwgIi4uL2VsZWN0cm9uL3NlcnZpY2VzL3NjaGVkdWxlclNlcnZpY2UudHMiLCAiLi4vZWxlY3Ryb24vc2VydmljZXMvdXBkYXRlclNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IGFwcCwgQnJvd3NlcldpbmRvdywgaXBjTWFpbiwgZGlhbG9nLCBzaGVsbCB9IGZyb20gJ2VsZWN0cm9uJ1xyXG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJ1xyXG5pbXBvcnQgeyByZWFkRmlsZSB9IGZyb20gJ2ZzL3Byb21pc2VzJ1xyXG5pbXBvcnQgeyByZWdpc3RlcklwY0hhbmRsZXJzLCBzY2hlZHVsZXJTZXJ2aWNlIH0gZnJvbSAnLi9pcGNIYW5kbGVycydcclxuaW1wb3J0IHsgQ29uZmlnU2VydmljZSB9IGZyb20gJy4vc2VydmljZXMvY29uZmlnU2VydmljZSdcclxuXHJcbi8vIEluamVjdGVkIGJ5IHJvbGx1cCB3aGVuIGNvbXBpbGVkIHRvIENKU1xyXG5kZWNsYXJlIGNvbnN0IF9fZGlybmFtZTogc3RyaW5nXHJcblxyXG5jb25zdCBWSVRFX0RFVl9TRVJWRVJfVVJMID0gcHJvY2Vzcy5lbnZbJ1ZJVEVfREVWX1NFUlZFUl9VUkwnXVxyXG4vLyBkaXN0LWVsZWN0cm9uL21haW4uY2pzIGxpdmVzIGluc2lkZSBkaXN0LWVsZWN0cm9uLzsgZGlzdC8gaXMgYSBzaWJsaW5nXHJcbmNvbnN0IFJFTkRFUkVSX0RJU1QgPSBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4nLCAnZGlzdCcpXHJcblxyXG5sZXQgd2luOiBCcm93c2VyV2luZG93IHwgbnVsbFxyXG5cclxuZnVuY3Rpb24gY3JlYXRlV2luZG93KCkge1xyXG4gIHdpbiA9IG5ldyBCcm93c2VyV2luZG93KHtcclxuICAgIHdpZHRoOiA5NjAsXHJcbiAgICBoZWlnaHQ6IDcyMCxcclxuICAgIG1pbldpZHRoOiA3NjAsXHJcbiAgICBtaW5IZWlnaHQ6IDU2MCxcclxuICAgIHRpdGxlOiAnRkIgQWRzIExpbWl0IENvbnRyb2xsZXInLFxyXG4gICAgd2ViUHJlZmVyZW5jZXM6IHtcclxuICAgICAgcHJlbG9hZDogcGF0aC5qb2luKF9fZGlybmFtZSwgJ3ByZWxvYWQuY2pzJyksXHJcbiAgICAgIGNvbnRleHRJc29sYXRpb246IHRydWUsXHJcbiAgICAgIG5vZGVJbnRlZ3JhdGlvbjogZmFsc2UsXHJcbiAgICB9LFxyXG4gIH0pXHJcblxyXG4gIGlmIChWSVRFX0RFVl9TRVJWRVJfVVJMKSB7XHJcbiAgICB3aW4ubG9hZFVSTChWSVRFX0RFVl9TRVJWRVJfVVJMKVxyXG4gICAgd2luLndlYkNvbnRlbnRzLm9wZW5EZXZUb29scygpXHJcbiAgfSBlbHNlIHtcclxuICAgIHdpbi5sb2FkRmlsZShwYXRoLmpvaW4oUkVOREVSRVJfRElTVCwgJ2luZGV4Lmh0bWwnKSlcclxuICB9XHJcbn1cclxuXHJcbmFwcC5vbignd2luZG93LWFsbC1jbG9zZWQnLCAoKSA9PiB7XHJcbiAgaWYgKHByb2Nlc3MucGxhdGZvcm0gIT09ICdkYXJ3aW4nKSB7XHJcbiAgICBhcHAucXVpdCgpXHJcbiAgICB3aW4gPSBudWxsXHJcbiAgfVxyXG59KVxyXG5cclxuYXBwLm9uKCdhY3RpdmF0ZScsICgpID0+IHtcclxuICBpZiAoQnJvd3NlcldpbmRvdy5nZXRBbGxXaW5kb3dzKCkubGVuZ3RoID09PSAwKSBjcmVhdGVXaW5kb3coKVxyXG59KVxyXG5cclxuLy8gSVBDOiBuYXRpdmUgZmlsZSBwaWNrZXIgXHUyMDE0IHJlc3RyaWN0ZWQgdG8gSlNPTiBmaWxlc1xyXG5pcGNNYWluLmhhbmRsZSgnZGlhbG9nOm9wZW5GaWxlJywgYXN5bmMgKCkgPT4ge1xyXG4gIGlmICghd2luKSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRpYWxvZy5zaG93T3BlbkRpYWxvZyh3aW4sIHtcclxuICAgIHRpdGxlOiAnU2VsZWN0IEdvb2dsZSBTZXJ2aWNlIEFjY291bnQgSlNPTicsXHJcbiAgICBmaWx0ZXJzOiBbeyBuYW1lOiAnSlNPTiBGaWxlcycsIGV4dGVuc2lvbnM6IFsnanNvbiddIH1dLFxyXG4gICAgcHJvcGVydGllczogWydvcGVuRmlsZSddLFxyXG4gIH0pXHJcbiAgcmV0dXJuIHJlc3VsdC5jYW5jZWxlZCA/IG51bGwgOiByZXN1bHQuZmlsZVBhdGhzWzBdXHJcbn0pXHJcblxyXG4vLyBJUEM6IHJlYWQgZmlsZSBmcm9tIGRpc2sgXHUyMDE0IG9ubHkgLmpzb24gYWxsb3dlZFxyXG5pcGNNYWluLmhhbmRsZSgnZnM6cmVhZEZpbGUnLCBhc3luYyAoX2V2ZW50OiB1bmtub3duLCBmaWxlUGF0aDogc3RyaW5nKSA9PiB7XHJcbiAgaWYgKCFmaWxlUGF0aC5lbmRzV2l0aCgnLmpzb24nKSkgdGhyb3cgbmV3IEVycm9yKCdPbmx5IC5qc29uIGZpbGVzIGFyZSBhbGxvd2VkJylcclxuICByZXR1cm4gcmVhZEZpbGUoZmlsZVBhdGgsICd1dGYtOCcpXHJcbn0pXHJcblxyXG4vLyBJUEM6IG9wZW4gZXh0ZXJuYWwgSFRUUFMgVVJMIGluIHN5c3RlbSBicm93c2VyXHJcbmlwY01haW4uaGFuZGxlKCdzaGVsbDpvcGVuRXh0ZXJuYWwnLCAoX2V2ZW50OiB1bmtub3duLCB1cmw6IHN0cmluZykgPT4ge1xyXG4gIGlmICgvXmh0dHBzOlxcL1xcLy9pLnRlc3QodXJsKSkgc2hlbGwub3BlbkV4dGVybmFsKHVybClcclxufSlcclxuXHJcbmFwcC53aGVuUmVhZHkoKS50aGVuKCgpID0+IHtcclxuICByZWdpc3RlcklwY0hhbmRsZXJzKClcclxuICBjcmVhdGVXaW5kb3coKVxyXG4gIC8vIEF1dG8tc3RhcnQgdGhlIHNjaGVkdWxlciBpZiBpdCB3YXMgZW5hYmxlZCB3aGVuIHRoZSBhcHAgd2FzIGxhc3QgY2xvc2VkXHJcbiAgY29uc3Qgc2F2ZWRDb25maWcgPSBuZXcgQ29uZmlnU2VydmljZSgpLmxvYWQoKVxyXG4gIGlmIChzYXZlZENvbmZpZy5zY2hlZHVsZUVuYWJsZWQpIHtcclxuICAgIHNjaGVkdWxlclNlcnZpY2Uuc3RhcnQoc2F2ZWRDb25maWcpXHJcbiAgfVxyXG59KVxyXG4iLCAiaW1wb3J0IHsgaXBjTWFpbiwgQnJvd3NlcldpbmRvdyB9IGZyb20gJ2VsZWN0cm9uJ1xyXG5pbXBvcnQgeyBHb29nbGVTaGVldHNTZXJ2aWNlIH0gZnJvbSAnLi9zZXJ2aWNlcy9nb29nbGVTaGVldHNTZXJ2aWNlJ1xyXG5pbXBvcnQgeyBGYWNlYm9va1NlcnZpY2UgfSBmcm9tICcuL3NlcnZpY2VzL2ZhY2Vib29rU2VydmljZSdcclxuaW1wb3J0IHsgQ29uZmlnU2VydmljZSB9IGZyb20gJy4vc2VydmljZXMvY29uZmlnU2VydmljZSdcclxuaW1wb3J0IHsgU2NoZWR1bGVyU2VydmljZSB9IGZyb20gJy4vc2VydmljZXMvc2NoZWR1bGVyU2VydmljZSdcclxuaW1wb3J0IHsgdXBkYXRlclNlcnZpY2UgfSBmcm9tICcuL3NlcnZpY2VzL3VwZGF0ZXJTZXJ2aWNlJ1xyXG5pbXBvcnQgdHlwZSB7IEFwcENvbmZpZ3VyYXRpb24sIEV4ZWN1dGlvblBhcmFtcywgTG9nRXZlbnQsIEdyb3VwRGF0YSB9IGZyb20gJy4uL3NyYy90eXBlcy9pbmRleCdcclxuXHJcbmNvbnN0IHNoZWV0c1NlcnZpY2UgPSBuZXcgR29vZ2xlU2hlZXRzU2VydmljZSgpXHJcbmNvbnN0IGZiU2VydmljZSA9IG5ldyBGYWNlYm9va1NlcnZpY2UoKVxyXG5jb25zdCBjb25maWdTZXJ2aWNlID0gbmV3IENvbmZpZ1NlcnZpY2UoKVxyXG5leHBvcnQgY29uc3Qgc2NoZWR1bGVyU2VydmljZSA9IG5ldyBTY2hlZHVsZXJTZXJ2aWNlKClcclxuXHJcbmZ1bmN0aW9uIGdldFdpbigpOiBCcm93c2VyV2luZG93IHwgbnVsbCB7XHJcbiAgcmV0dXJuIEJyb3dzZXJXaW5kb3cuZ2V0QWxsV2luZG93cygpWzBdID8/IG51bGxcclxufVxyXG5cclxuZnVuY3Rpb24gc2VuZExvZyhldmVudDogTG9nRXZlbnQpOiB2b2lkIHtcclxuICBnZXRXaW4oKT8ud2ViQ29udGVudHMuc2VuZCgnZXhlY3V0aW9uOmxvZycsIGV2ZW50KVxyXG59XHJcblxyXG5mdW5jdGlvbiBsb2cobWVzc2FnZTogc3RyaW5nLCB0eXBlOiBMb2dFdmVudFsndHlwZSddID0gJ2luZm8nKTogdm9pZCB7XHJcbiAgc2VuZExvZyh7IG1lc3NhZ2UsIHR5cGUgfSlcclxuICBjb25zb2xlLmxvZyhgWyR7dHlwZS50b1VwcGVyQ2FzZSgpfV0gJHttZXNzYWdlfWApXHJcbn1cclxuXHJcbi8vIFx1MjUwMFx1MjUwMCBTaGFyZWQgZXhlY3V0aW9uIGxvb3AgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHJcbi8vIEltcGxlbWVudHMgdGhlIFwiQ2xhc3NpZmljYXRpb24gKyBSZWRpc3RyaWJ1dGlvblwiIHN0cmF0ZWd5OlxyXG4vL1xyXG4vLyAgIENhc2UgQSBcdTIwMTMgU3RhcnQgb2YgZGF5IChhbGwgYWNjb3VudHMgU3BlbnQgPSAwKTpcclxuLy8gICAgIE5fZnVuZCA9IHRvdGFsIGFjY291bnRzOyBzZXQgbGltaXQgPSBtaW4obWF4QnVmZmVyLCByZW1haW5pbmcgLyBOX2Z1bmQpIGZvciBhbGxcclxuLy9cclxuLy8gICBDYXNlIEIgXHUyMDEzIER1cmluZyBkYXkgKFx1MjI2NTEgYWNjb3VudCBoYXMgU3BlbnQgPiAwKTpcclxuLy8gICAgIEFjdGl2ZSAgPSBhY2NvdW50cyB3aXRoIFNwZW50ID4gMC4wMSAgIFx1MjE5MiBnZXQgbGltaXQgPSBtaW4obWF4QnVmZmVyLCByZW1haW5pbmcgLyBOX2FjdGl2ZSlcclxuLy8gICAgIEluYWN0aXZlID0gYWNjb3VudHMgd2l0aCBTcGVudCA9IDAgICAgICBcdTIxOTIgbGltaXQgY2xlYXJlZCAob3B0aW9uYWw6IGF1dG9SZXZva2VJbmFjdGl2ZSlcclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVGb3JHcm91cHMoXHJcbiAgdGFiTmFtZXM6IHN0cmluZ1tdLFxyXG4gIGNvbmZpZzogQXBwQ29uZmlndXJhdGlvbixcclxuICBsb2dGbjogKG1lc3NhZ2U6IHN0cmluZywgdHlwZT86IExvZ0V2ZW50Wyd0eXBlJ10pID0+IHZvaWQsXHJcbik6IFByb21pc2U8dm9pZD4ge1xyXG4gIGxvZ0ZuKCdQcmUtZmxpZ2h0OiB2YWxpZGF0aW5nIGNyZWRlbnRpYWxzLi4uJylcclxuXHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IHVzZXJOYW1lID0gYXdhaXQgZmJTZXJ2aWNlLnZhbGlkYXRlVG9rZW4oY29uZmlnLmZhY2Vib29rQXBpVG9rZW4pXHJcbiAgICBsb2dGbihgUHJlLWZsaWdodDogRkIgdG9rZW4gdmFsaWQgKCR7dXNlck5hbWV9KS5gLCAnc3VjY2VzcycpXHJcbiAgfSBjYXRjaCB7XHJcbiAgICBsb2dGbignUHJlLWZsaWdodCBmYWlsZWQ6IEZhY2Vib29rIEFQSSB0b2tlbiBpcyBpbnZhbGlkIG9yIGV4cGlyZWQuJywgJ2Vycm9yJylcclxuICAgIHJldHVyblxyXG4gIH1cclxuXHJcbiAgdHJ5IHtcclxuICAgIGF3YWl0IHNoZWV0c1NlcnZpY2UuYXV0aGVudGljYXRlKGNvbmZpZy5zZXJ2aWNlQWNjb3VudFBhdGgpXHJcbiAgICBsb2dGbignUHJlLWZsaWdodDogR29vZ2xlIFNoZWV0cyBhdXRoZW50aWNhdGVkLicsICdzdWNjZXNzJylcclxuICB9IGNhdGNoIChlcnIpIHtcclxuICAgIGxvZ0ZuKGBQcmUtZmxpZ2h0IGZhaWxlZDogR29vZ2xlIFNoZWV0cyBhdXRoIGVycm9yIFx1MjAxNCAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gLCAnZXJyb3InKVxyXG4gICAgcmV0dXJuXHJcbiAgfVxyXG5cclxuICBjb25zdCB7IG1heEJ1ZmZlciwgYXV0b1Jldm9rZUluYWN0aXZlIH0gPSBjb25maWdcclxuXHJcbiAgbG9nRm4oYFN0YXJ0aW5nIGV4ZWN1dGlvbiBmb3IgJHt0YWJOYW1lcy5sZW5ndGh9IGdyb3VwKHMpIFttYXhCdWZmZXI9JCR7bWF4QnVmZmVyfSwgYXV0b1Jldm9rZT0ke2F1dG9SZXZva2VJbmFjdGl2ZX1dLi4uYClcclxuXHJcbiAgZm9yIChjb25zdCB0YWJOYW1lIG9mIHRhYk5hbWVzKSB7XHJcbiAgICBsb2dGbihgXHUyNTAwXHUyNTAwIEdyb3VwOiAke3RhYk5hbWV9YClcclxuXHJcbiAgICBsZXQgZ3JvdXBEYXRhOiBHcm91cERhdGEgfCBudWxsXHJcbiAgICB0cnkge1xyXG4gICAgICBncm91cERhdGEgPSBhd2FpdCBzaGVldHNTZXJ2aWNlLnBhcnNlVGFiKGNvbmZpZy5nb29nbGVTaGVldElkLCB0YWJOYW1lKVxyXG4gICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgIGxvZ0ZuKGAgICBTaGVldHMgZXJyb3IgZm9yIFwiJHt0YWJOYW1lfVwiOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gLCAnZXJyb3InKVxyXG4gICAgICBjb250aW51ZVxyXG4gICAgfVxyXG5cclxuICAgIGlmICghZ3JvdXBEYXRhKSB7XHJcbiAgICAgIGxvZ0ZuKGAgICBObyBkYXRhIGZvciB0b2RheSAoJHtuZXcgRGF0ZSgpLnRvTG9jYWxlRGF0ZVN0cmluZygnZW4tR0InKX0pIGluIFwiJHt0YWJOYW1lfVwiIFx1MjAxNCBza2lwcGluZy5gLCAnd2FybmluZycpXHJcbiAgICAgIGNvbnRpbnVlXHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgeyBncm91cE5hbWUsIGFjY291bnRJZHMsIHJlbWFpbmluZywgc3BlbnQ6IGdyb3VwU3BlbnQsIGFjY291bnRTcGVudE1hcCB9ID0gZ3JvdXBEYXRhXHJcbiAgICBjb25zdCBhbGxBY2NvdW50cyA9IGFjY291bnRJZHMhXHJcbiAgICBjb25zdCByZW1haW5pbmdWYWwgPSByZW1haW5pbmchXHJcblxyXG4gICAgLy8gXHUyNTAwXHUyNTAwIFN0ZXAgMTogQ2xhc3NpZnkgcGVyLWFjY291bnQgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHJcbiAgICAvLyBVc2UgcGVyLWFjY291bnQgc3BlbnQgZnJvbSBjb2x1bW5zIEgrIChhY2NvdW50U3BlbnRNYXApLiBGYWxsIGJhY2sgdG9cclxuICAgIC8vIHRhYi1sZXZlbCBhZ2dyZWdhdGUgKGNvbHVtbiBGKSBvbmx5IGlmIGFjY291bnRTcGVudE1hcCBpcyBhYnNlbnQuXHJcbiAgICBjb25zdCBnZXRTcGVudCA9IChpZDogc3RyaW5nKTogbnVtYmVyID0+IHtcclxuICAgICAgaWYgKGFjY291bnRTcGVudE1hcCAmJiBpZCBpbiBhY2NvdW50U3BlbnRNYXApIHJldHVybiBhY2NvdW50U3BlbnRNYXBbaWRdXHJcbiAgICAgIHJldHVybiBncm91cFNwZW50ID8/IDBcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBhY3RpdmVBY2NvdW50cyA9IGFsbEFjY291bnRzLmZpbHRlcigoaWQpID0+IGdldFNwZW50KGlkKSA+IDAuMDEpXHJcbiAgICBjb25zdCBpbmFjdGl2ZUFjY291bnRzID0gYWxsQWNjb3VudHMuZmlsdGVyKChpZCkgPT4gZ2V0U3BlbnQoaWQpIDw9IDAuMDEpXHJcblxyXG4gICAgLy8gQ2FzZSBBOiBhbGwgYWNjb3VudHMgYXQgJDAgXHUyMTkyIGZ1bmQgYWxsIChzdGFydCBvZiBkYXkpXHJcbiAgICBjb25zdCBpc1N0YXJ0T2ZEYXkgPSBhY3RpdmVBY2NvdW50cy5sZW5ndGggPT09IDBcclxuICAgIGNvbnN0IGZ1bmRlZEFjY291bnRzID0gaXNTdGFydE9mRGF5ID8gYWxsQWNjb3VudHMgOiBhY3RpdmVBY2NvdW50c1xyXG4gICAgY29uc3QgcmV2b2tlZEFjY291bnRzID0gaXNTdGFydE9mRGF5ID8gW10gOiBpbmFjdGl2ZUFjY291bnRzXHJcblxyXG4gICAgY29uc3QgbkZ1bmQgPSBmdW5kZWRBY2NvdW50cy5sZW5ndGhcclxuICAgIGlmIChuRnVuZCA9PT0gMCkge1xyXG4gICAgICBsb2dGbihgICAgTm8gYWNjb3VudHMgdG8gZnVuZCBcdTIwMTQgc2tpcHBpbmcuYCwgJ3dhcm5pbmcnKVxyXG4gICAgICBjb250aW51ZVxyXG4gICAgfVxyXG5cclxuICAgIC8vIENhc2UgQSAoc3RhcnQgb2YgZGF5KTogZXF1YWwgc3BsaXQgXHUyMDE0IG5vIHNwZW5kIHJhdGlvIGF2YWlsYWJsZSB5ZXRcclxuICAgIC8vIENhc2UgQjogcHJvcG9ydGlvbmFsIHRvIGVhY2ggYWNjb3VudCdzIHNwZW5kIHNoYXJlIChjYXBwZWQgYXQgbWF4QnVmZmVyKVxyXG4gICAgY29uc3QgdG90YWxBY3RpdmVTcGVudCA9IGlzU3RhcnRPZkRheSA/IDAgOiBhY3RpdmVBY2NvdW50cy5yZWR1Y2UoKHMsIGlkKSA9PiBzICsgZ2V0U3BlbnQoaWQpLCAwKVxyXG4gICAgY29uc3QgZ2V0TGltaXRGb3JBY2NvdW50ID0gKGlkOiBzdHJpbmcpOiBudW1iZXIgPT4ge1xyXG4gICAgICBpZiAoaXNTdGFydE9mRGF5IHx8IHRvdGFsQWN0aXZlU3BlbnQgPT09IDApIHJldHVybiBNYXRoLm1pbihtYXhCdWZmZXIsIHJlbWFpbmluZ1ZhbCAvIG5GdW5kKVxyXG4gICAgICByZXR1cm4gTWF0aC5taW4obWF4QnVmZmVyLCAoZ2V0U3BlbnQoaWQpIC8gdG90YWxBY3RpdmVTcGVudCkgKiByZW1haW5pbmdWYWwpXHJcbiAgICB9XHJcblxyXG4gICAgbG9nRm4oXHJcbiAgICAgIGAgICAke2dyb3VwTmFtZX06ICR7YWxsQWNjb3VudHMubGVuZ3RofSBhY2NvdW50cyB8IFNwZW50PSQkeyhncm91cFNwZW50ID8/IDApLnRvRml4ZWQoMil9IHwgUmVtYWluaW5nPSQke3JlbWFpbmluZ1ZhbC50b0ZpeGVkKDIpfSB8ICR7XHJcbiAgICAgICAgaXNTdGFydE9mRGF5ID8gYENhc2UgQSBcdTIwMTQgZnVuZCBhbGwgJHtuRnVuZH0gZXF1YWxseWAgOiBgQ2FzZSBCIFx1MjAxNCBmdW5kICR7bkZ1bmR9IGFjdGl2ZSAocHJvcG9ydGlvbmFsKSwgcmV2b2tlICR7cmV2b2tlZEFjY291bnRzLmxlbmd0aH0gaW5hY3RpdmVgXHJcbiAgICAgIH1gLFxyXG4gICAgKVxyXG5cclxuICAgIC8vIFx1MjUwMFx1MjUwMCBTdGVwIDI6IEZ1bmQgYWN0aXZlIChvciBhbGwpIGFjY291bnRzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxyXG4gICAgZm9yIChjb25zdCBhY2NvdW50SWQgb2YgZnVuZGVkQWNjb3VudHMpIHtcclxuICAgICAgY29uc3QgbGltaXQgPSBnZXRMaW1pdEZvckFjY291bnQoYWNjb3VudElkKVxyXG4gICAgICBhd2FpdCBzbGVlcCgxNTAgKyBNYXRoLnJhbmRvbSgpICogMjUwKVxyXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBmYlNlcnZpY2Uuc2V0U3BlbmRpbmdMaW1pdChhY2NvdW50SWQsIGxpbWl0LCBjb25maWcuZmFjZWJvb2tBcGlUb2tlbilcclxuICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XHJcbiAgICAgICAgbG9nRm4oYCAgIFx1MjcxMyAke2FjY291bnRJZH0gXHUyMTkyIGxpbWl0IHNldCB0byAkJHtsaW1pdC50b0ZpeGVkKDIpfWAsICdzdWNjZXNzJylcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBsb2dGbihgICAgXHUyNzE3ICR7YWNjb3VudElkfSBcdTIxOTIgJHtyZXN1bHQuZXJyb3IgPz8gJ3Vua25vd24gZXJyb3InfWAsICdlcnJvcicpXHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBcdTI1MDBcdTI1MDAgU3RlcCAzOiBSZXZva2UgaW5hY3RpdmUgYWNjb3VudHMgKENhc2UgQiBvbmx5KSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcclxuICAgIGlmICghaXNTdGFydE9mRGF5ICYmIGF1dG9SZXZva2VJbmFjdGl2ZSAmJiByZXZva2VkQWNjb3VudHMubGVuZ3RoID4gMCkge1xyXG4gICAgICBmb3IgKGNvbnN0IGFjY291bnRJZCBvZiByZXZva2VkQWNjb3VudHMpIHtcclxuICAgICAgICBhd2FpdCBzbGVlcCgxNTAgKyBNYXRoLnJhbmRvbSgpICogMjUwKVxyXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZiU2VydmljZS5jbGVhclNwZW5kaW5nTGltaXQoYWNjb3VudElkLCBjb25maWcuZmFjZWJvb2tBcGlUb2tlbilcclxuICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcclxuICAgICAgICAgIGxvZ0ZuKGAgICBcdTIxQTkgJHthY2NvdW50SWR9IFx1MjE5MiBsaW1pdCBjbGVhcmVkIChpbmFjdGl2ZSlgLCAnaW5mbycpXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGxvZ0ZuKGAgICBcdTI3MTcgJHthY2NvdW50SWR9IFx1MjE5MiBjbGVhciBmYWlsZWQ6ICR7cmVzdWx0LmVycm9yID8/ICd1bmtub3duIGVycm9yJ31gLCAnZXJyb3InKVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfSBlbHNlIGlmICghaXNTdGFydE9mRGF5ICYmICFhdXRvUmV2b2tlSW5hY3RpdmUgJiYgcmV2b2tlZEFjY291bnRzLmxlbmd0aCA+IDApIHtcclxuICAgICAgbG9nRm4oYCAgIFx1MjEzOSAke3Jldm9rZWRBY2NvdW50cy5sZW5ndGh9IGluYWN0aXZlIGFjY291bnQocykgXHUyMDE0IGF1dG8tcmV2b2tlIGRpc2FibGVkLCBubyBjaGFuZ2UuYCwgJ2luZm8nKVxyXG4gICAgfVxyXG5cclxuICAgIGxvZ0ZuKGBcdTI1MDBcdTI1MDAgR3JvdXAgXCIke2dyb3VwTmFtZX1cIiBjb21wbGV0ZWQuYClcclxuICB9XHJcblxyXG4gIGxvZ0ZuKCdFeGVjdXRpb24gZmluaXNoZWQuJywgJ3N1Y2Nlc3MnKVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJJcGNIYW5kbGVycygpOiB2b2lkIHtcclxuICAvLyBXaXJlIHRoZSBzY2hlZHVsZXIncyBydW4gY2FsbGJhY2sgKHVzZXMgdGhlIHNoYXJlZCBleGVjdXRpb24gbG9vcClcclxuICBzY2hlZHVsZXJTZXJ2aWNlLnNldFJ1bkNhbGxiYWNrKGFzeW5jIChjb25maWcsIGxvZ0ZuKSA9PiB7XHJcbiAgICAvLyBGZXRjaCBhbGwgdGFicywgdGhlbiBmaWx0ZXIgb3V0IHNjaGVkdWxlLWV4Y2x1ZGVkIGdyb3Vwc1xyXG4gICAgY29uc3QgZXhjbHVkZWQgPSBjb25maWcuZXhjbHVkZWRUYWJzXHJcbiAgICAgIC5zcGxpdCgnLCcpXHJcbiAgICAgIC5tYXAoKHQpID0+IHQudHJpbSgpKVxyXG4gICAgICAuZmlsdGVyKEJvb2xlYW4pXHJcbiAgICBhd2FpdCBzaGVldHNTZXJ2aWNlLmF1dGhlbnRpY2F0ZShjb25maWcuc2VydmljZUFjY291bnRQYXRoKVxyXG4gICAgY29uc3QgYWxsVGFicyA9IGF3YWl0IHNoZWV0c1NlcnZpY2UubGlzdFRhYnMoY29uZmlnLmdvb2dsZVNoZWV0SWQsIGV4Y2x1ZGVkKVxyXG4gICAgY29uc3QgaW5jbHVkZWQgPSBjb25maWcuc2NoZWR1bGVJbmNsdWRlZEdyb3VwcyA/PyBbXVxyXG4gICAgY29uc3QgdGFiTmFtZXMgPSBpbmNsdWRlZC5sZW5ndGggPiAwID8gYWxsVGFicy5maWx0ZXIoKHQpID0+IGluY2x1ZGVkLmluY2x1ZGVzKHQpKSA6IFtdXHJcbiAgICBsb2dGbihgU2NoZWR1bGVkIGpvYjogJHt0YWJOYW1lcy5sZW5ndGh9IGdyb3VwKHMpIHRvIHByb2Nlc3MgKCR7aW5jbHVkZWQubGVuZ3RofSBpbmNsdWRlZCwgJHthbGxUYWJzLmxlbmd0aCAtIHRhYk5hbWVzLmxlbmd0aH0gc2tpcHBlZCkuYClcclxuICAgIGF3YWl0IGV4ZWN1dGVGb3JHcm91cHModGFiTmFtZXMsIGNvbmZpZywgbG9nRm4pXHJcbiAgfSlcclxuXHJcbiAgLy8gXHUyNTAwXHUyNTAwIENvbmZpZyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcclxuICBpcGNNYWluLmhhbmRsZSgnY29uZmlnOmxvYWQnLCAoKSA9PiBjb25maWdTZXJ2aWNlLmxvYWQoKSlcclxuXHJcbiAgaXBjTWFpbi5oYW5kbGUoJ2NvbmZpZzpzYXZlJywgKF9ldmVudDogdW5rbm93biwgY29uZmlnOiBQYXJhbWV0ZXJzPENvbmZpZ1NlcnZpY2VbJ3NhdmUnXT5bMF0pID0+IHtcclxuICAgIGNvbmZpZ1NlcnZpY2Uuc2F2ZShjb25maWcpXHJcbiAgICAvLyBSZXN0YXJ0IHNjaGVkdWxlciB3aGVuZXZlciBjb25maWcgY2hhbmdlcyAoaW4gY2FzZSB0aW1lIC8gZW5hYmxlZCBjaGFuZ2VkKVxyXG4gICAgc2NoZWR1bGVyU2VydmljZS5zdGFydChjb25maWcpXHJcbiAgfSlcclxuXHJcbiAgLy8gXHUyNTAwXHUyNTAwIFNoZWV0cyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcclxuICBpcGNNYWluLmhhbmRsZShcclxuICAgICdzaGVldHM6ZmV0Y2gnLFxyXG4gICAgYXN5bmMgKF9ldmVudDogdW5rbm93biwgc2hlZXRJZDogc3RyaW5nLCBleGNsdWRlZFRhYnNTdHI6IHN0cmluZykgPT4ge1xyXG4gICAgICBjb25zdCBjb25maWcgPSBjb25maWdTZXJ2aWNlLmxvYWQoKVxyXG4gICAgICBhd2FpdCBzaGVldHNTZXJ2aWNlLmF1dGhlbnRpY2F0ZShjb25maWcuc2VydmljZUFjY291bnRQYXRoKVxyXG4gICAgICBjb25zdCBleGNsdWRlZCA9IGV4Y2x1ZGVkVGFic1N0clxyXG4gICAgICAgIC5zcGxpdCgnLCcpXHJcbiAgICAgICAgLm1hcCgodCkgPT4gdC50cmltKCkpXHJcbiAgICAgICAgLmZpbHRlcihCb29sZWFuKVxyXG4gICAgICBjb25zdCB0YWJzID0gYXdhaXQgc2hlZXRzU2VydmljZS5saXN0VGFicyhzaGVldElkLCBleGNsdWRlZClcclxuICAgICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChcclxuICAgICAgICB0YWJzLm1hcCgodGFiKSA9PiBzaGVldHNTZXJ2aWNlLnBhcnNlVGFiKHNoZWV0SWQsIHRhYikpLFxyXG4gICAgICApXHJcbiAgICAgIHJldHVybiB0YWJzLm1hcCgodGFiTmFtZSwgaSk6IEdyb3VwRGF0YSA9PiB7XHJcbiAgICAgICAgY29uc3QgciA9IHJlc3VsdHNbaV1cclxuICAgICAgICBpZiAoci5zdGF0dXMgPT09ICdmdWxmaWxsZWQnICYmIHIudmFsdWUgIT09IG51bGwpIHJldHVybiByLnZhbHVlXHJcbiAgICAgICAgcmV0dXJuIHsgdGFiTmFtZSwgZ3JvdXBOYW1lOiB0YWJOYW1lIH1cclxuICAgICAgfSlcclxuICAgIH0sXHJcbiAgKVxyXG5cclxuICAvLyBcdTI1MDBcdTI1MDAgTWFudWFsIEV4ZWN1dGlvbiBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcclxuICBpcGNNYWluLmhhbmRsZSgnZXhlY3V0aW9uOnJ1bicsIGFzeW5jIChfZXZlbnQ6IHVua25vd24sIHBhcmFtczogRXhlY3V0aW9uUGFyYW1zKSA9PiB7XHJcbiAgICBjb25zdCB7IHNlbGVjdGVkR3JvdXBzLCBjb25maWcgfSA9IHBhcmFtc1xyXG4gICAgYXdhaXQgZXhlY3V0ZUZvckdyb3VwcyhzZWxlY3RlZEdyb3VwcywgY29uZmlnLCAobXNnLCB0eXBlKSA9PiBsb2cobXNnLCB0eXBlKSlcclxuICB9KVxyXG5cclxuICAvLyBcdTI1MDBcdTI1MDAgU2NoZWR1bGUgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHJcbiAgaXBjTWFpbi5oYW5kbGUoJ3NjaGVkdWxlOnN0YXR1cycsICgpID0+IHNjaGVkdWxlclNlcnZpY2UuZ2V0U3RhdHVzKCkpXHJcblxyXG4gIGlwY01haW4uaGFuZGxlKCdzY2hlZHVsZTpzdGFydCcsICgpID0+IHtcclxuICAgIGNvbnN0IGNvbmZpZyA9IGNvbmZpZ1NlcnZpY2UubG9hZCgpXHJcbiAgICBzY2hlZHVsZXJTZXJ2aWNlLnN0YXJ0KGNvbmZpZylcclxuICAgIHJldHVybiBzY2hlZHVsZXJTZXJ2aWNlLmdldFN0YXR1cygpXHJcbiAgfSlcclxuXHJcbiAgaXBjTWFpbi5oYW5kbGUoJ3NjaGVkdWxlOnN0b3AnLCAoKSA9PiB7XHJcbiAgICBzY2hlZHVsZXJTZXJ2aWNlLnN0b3AoKVxyXG4gICAgcmV0dXJuIHNjaGVkdWxlclNlcnZpY2UuZ2V0U3RhdHVzKClcclxuICB9KVxyXG5cclxuICBpcGNNYWluLmhhbmRsZSgnc2NoZWR1bGU6bGFzdExvZ3MnLCAoKSA9PiBzY2hlZHVsZXJTZXJ2aWNlLmdldExhc3RMb2dzKCkpXHJcblxyXG4gIC8vIFx1MjUwMFx1MjUwMCBBdXRvLXVwZGF0ZXIgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHJcbiAgaXBjTWFpbi5oYW5kbGUoJ3VwZGF0ZTpjaGVjaycsICgpID0+IHVwZGF0ZXJTZXJ2aWNlLmNoZWNrRm9yVXBkYXRlcygpKVxyXG4gIGlwY01haW4uaGFuZGxlKCd1cGRhdGU6aW5zdGFsbCcsICgpID0+IHVwZGF0ZXJTZXJ2aWNlLnF1aXRBbmRJbnN0YWxsKCkpXHJcbiAgaXBjTWFpbi5oYW5kbGUoJ3VwZGF0ZTpnZXRWZXJzaW9uJywgKCkgPT4ge1xyXG4gICAgY29uc3QgeyBhcHAgfSA9IHJlcXVpcmUoJ2VsZWN0cm9uJykgYXMgdHlwZW9mIGltcG9ydCgnZWxlY3Ryb24nKVxyXG4gICAgcmV0dXJuIGFwcC5nZXRWZXJzaW9uKClcclxuICB9KVxyXG59XHJcblxyXG5mdW5jdGlvbiBzbGVlcChtczogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIG1zKSlcclxufVxyXG5cclxuIiwgImltcG9ydCB7IGdvb2dsZSB9IGZyb20gJ2dvb2dsZWFwaXMnXHJcbmltcG9ydCB7IGZvcm1hdCB9IGZyb20gJ2RhdGUtZm5zJ1xyXG5pbXBvcnQgdHlwZSB7IEdyb3VwRGF0YSB9IGZyb20gJy4uLy4uL3NyYy90eXBlcy9pbmRleCdcclxuXHJcbi8vIENvbHVtbiBtYXBwaW5nIGZvciBBZHNNYW5hZ2VyIHNoZWV0IHRhYnMgKGNvbmZpcm1lZCBhZ2FpbnN0IG1vbm9yZXBvIGNvbnZlbnRpb24pOlxyXG4vLyAgIEIyICAgICAgICA9IGdyb3VwIG5hbWVcclxuLy8gICBDMysgICAgICAgPSBkYXRlcyAoZGQvTU0veXl5eSkgXHUyMDE0IGRhdGVzIGNvbHVtblxyXG4vLyAgIEYzKyAgICAgICA9IHRvdGFsIHNwZW50IHRvZGF5XHJcbi8vICAgRzMrICAgICAgID0gcmVtYWluaW5nIGJhbGFuY2UgKG51bWVyaWMvY3VycmVuY3kpXHJcbi8vICAgSDMsIEkzXHUyMDI2ID0gYWQgYWNjb3VudCBJRHMgKGhvcml6b250YWwsIHVudGlsIGVtcHR5IGNlbGwpXHJcblxyXG5leHBvcnQgY2xhc3MgR29vZ2xlU2hlZXRzU2VydmljZSB7XHJcbiAgcHJpdmF0ZSBhdXRoOiBJbnN0YW5jZVR5cGU8dHlwZW9mIGdvb2dsZS5hdXRoLkdvb2dsZUF1dGg+IHwgbnVsbCA9IG51bGxcclxuXHJcbiAgLyoqXHJcbiAgICogSW5pdGlhbGlzZSBhdXRoZW50aWNhdGlvbiBmcm9tIGEgc2VydmljZSBhY2NvdW50IEpTT04gZmlsZSBwYXRoLlxyXG4gICAqIENhbGxlZCBvbmNlIHdoZW4gY3JlZGVudGlhbHMgYXJlIGNvbmZpZ3VyZWQgb3IgY2hhbmdlZC5cclxuICAgKi9cclxuICBhc3luYyBhdXRoZW50aWNhdGUoc2VydmljZUFjY291bnRQYXRoOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIHRoaXMuYXV0aCA9IG5ldyBnb29nbGUuYXV0aC5Hb29nbGVBdXRoKHtcclxuICAgICAga2V5RmlsZTogc2VydmljZUFjY291bnRQYXRoLFxyXG4gICAgICBzY29wZXM6IFsnaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vYXV0aC9zcHJlYWRzaGVldHMucmVhZG9ubHknXSxcclxuICAgIH0pXHJcbiAgICAvLyBFYWdlcmx5IHZlcmlmeSBjcmVkZW50aWFscyBhcmUgdmFsaWRcclxuICAgIGF3YWl0IHRoaXMuYXV0aC5nZXRDbGllbnQoKVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBnZXQgc2hlZXRzKCkge1xyXG4gICAgaWYgKCF0aGlzLmF1dGgpIHRocm93IG5ldyBFcnJvcignR29vZ2xlU2hlZXRzU2VydmljZTogbm90IGF1dGhlbnRpY2F0ZWQuIENhbGwgYXV0aGVudGljYXRlKCkgZmlyc3QuJylcclxuICAgIHJldHVybiBnb29nbGUuc2hlZXRzKHsgdmVyc2lvbjogJ3Y0JywgYXV0aDogdGhpcy5hdXRoIH0pXHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBSZXR1cm5zIGFsbCB0YWIgbmFtZXMgZnJvbSB0aGUgc3ByZWFkc2hlZXQsIGV4Y2x1ZGluZyBzeXN0ZW0gdGFicy5cclxuICAgKi9cclxuICBhc3luYyBsaXN0VGFicyhzaGVldElkOiBzdHJpbmcsIGV4Y2x1ZGVkVGFiczogc3RyaW5nW10pOiBQcm9taXNlPHN0cmluZ1tdPiB7XHJcbiAgICBjb25zdCByZXMgPSBhd2FpdCB0aGlzLnNoZWV0cy5zcHJlYWRzaGVldHMuZ2V0KHsgc3ByZWFkc2hlZXRJZDogc2hlZXRJZCB9KVxyXG4gICAgY29uc3Qgc2hlZXRzID0gcmVzLmRhdGEuc2hlZXRzID8/IFtdXHJcbiAgICByZXR1cm4gc2hlZXRzXHJcbiAgICAgIC5tYXAoKHMpID0+IHMucHJvcGVydGllcz8udGl0bGUgPz8gJycpXHJcbiAgICAgIC5maWx0ZXIoKG5hbWUpID0+IG5hbWUgJiYgIWV4Y2x1ZGVkVGFicy5pbmNsdWRlcyhuYW1lLnRyaW0oKSkpXHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBQYXJzZXMgYSBzaW5nbGUgY3VzdG9tZXIgdGFiIGFuZCByZXR1cm5zIHRvZGF5J3MgR3JvdXBEYXRhLCBvciBudWxsIGlmOlxyXG4gICAqIC0gdG9kYXkncyBkYXRlIGlzIG5vdCBmb3VuZCBpbiBDb2x1bW4gQ1xyXG4gICAqIC0gbm8gYWNjb3VudCBJRHMgYXJlIHByZXNlbnQgaW4gcm93IDMgKEgzKylcclxuICAgKiAtIHJlbWFpbmluZyBiYWxhbmNlIGlzIG1pc3Npbmcgb3IgemVyb1xyXG4gICAqL1xyXG4gIGFzeW5jIHBhcnNlVGFiKHNoZWV0SWQ6IHN0cmluZywgdGFiTmFtZTogc3RyaW5nKTogUHJvbWlzZTxHcm91cERhdGEgfCBudWxsPiB7XHJcbiAgICBjb25zdCB0b2RheVN0ciA9IGZvcm1hdChuZXcgRGF0ZSgpLCAnZGQvTU0veXl5eScpXHJcblxyXG4gICAgLy8gQmF0Y2ggcmVhZDogQjIgKGdyb3VwIG5hbWUpLCBDMzpDMzAwIChkYXRlcyksIEYzOkYzMDAgKHNwZW50KSwgRzM6RzMwMCAocmVtYWluaW5nKSxcclxuICAgIC8vIEgzOlpaMzAwIChyb3cgMyA9IGFjY291bnQgSURzOyB0b2RheSdzIHJvdyA9IHBlci1hY2NvdW50IHNwZW50IHZhbHVlcylcclxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMuc2hlZXRzLnNwcmVhZHNoZWV0cy52YWx1ZXMuYmF0Y2hHZXQoe1xyXG4gICAgICBzcHJlYWRzaGVldElkOiBzaGVldElkLFxyXG4gICAgICByYW5nZXM6IFtcclxuICAgICAgICBgJyR7dGFiTmFtZX0nIUIyYCxcclxuICAgICAgICBgJyR7dGFiTmFtZX0nIUMzOkMzMDBgLFxyXG4gICAgICAgIGAnJHt0YWJOYW1lfSchRjM6RjMwMGAsXHJcbiAgICAgICAgYCcke3RhYk5hbWV9JyFHMzpHMzAwYCxcclxuICAgICAgICBgJyR7dGFiTmFtZX0nIUgzOlpaMzAwYCxcclxuICAgICAgXSxcclxuICAgIH0pXHJcblxyXG4gICAgY29uc3QgW2dyb3VwTmFtZVJhbmdlLCBkYXRlc1JhbmdlLCBzcGVudFJhbmdlLCByZW1haW5pbmdSYW5nZSwgYWNjb3VudEJsb2NrUmFuZ2VdID1cclxuICAgICAgcmVzLmRhdGEudmFsdWVSYW5nZXMgPz8gW11cclxuXHJcbiAgICAvLyBHcm91cCBuYW1lIGZyb20gQjJcclxuICAgIGNvbnN0IGdyb3VwTmFtZSA9IChncm91cE5hbWVSYW5nZT8udmFsdWVzPy5bMF0/LlswXSBhcyBzdHJpbmcgfCB1bmRlZmluZWQpID8/IHRhYk5hbWVcclxuXHJcbiAgICAvLyBBY2NvdW50IElEcyBmcm9tIHJvdyAzIChpbmRleCAwKSwgSCBvbndhcmRzIFx1MjAxNCBmaWx0ZXIgZW1wdHkgY2VsbHMsIG5vcm1hbGlzZSBhY3RfIHByZWZpeFxyXG4gICAgY29uc3QgYWNjb3VudFJvdzogc3RyaW5nW10gPSAoYWNjb3VudEJsb2NrUmFuZ2U/LnZhbHVlcz8uWzBdID8/IFtdKSBhcyBzdHJpbmdbXVxyXG4gICAgY29uc3QgYWNjb3VudElkcyA9IGFjY291bnRSb3dcclxuICAgICAgLm1hcCgoaWQpID0+IFN0cmluZyhpZCkudHJpbSgpKVxyXG4gICAgICAuZmlsdGVyKEJvb2xlYW4pXHJcbiAgICAgIC5tYXAoKGlkKSA9PiAoaWQuc3RhcnRzV2l0aCgnYWN0XycpID8gaWQgOiBgYWN0XyR7aWR9YCkpXHJcblxyXG4gICAgaWYgKGFjY291bnRJZHMubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbFxyXG5cclxuICAgIC8vIEZpbmQgcm93IGluZGV4IHdoZXJlIENvbHVtbiBDIG1hdGNoZXMgdG9kYXkncyBkYXRlXHJcbiAgICBjb25zdCBkYXRlczogc3RyaW5nW10gPSAoZGF0ZXNSYW5nZT8udmFsdWVzID8/IFtdKS5tYXAoKHJvdykgPT4gU3RyaW5nKHJvd1swXSA/PyAnJykudHJpbSgpKVxyXG4gICAgY29uc3Qgcm93SW5kZXggPSBkYXRlcy5maW5kSW5kZXgoKGQpID0+IGQgPT09IHRvZGF5U3RyKVxyXG4gICAgaWYgKHJvd0luZGV4ID09PSAtMSkgcmV0dXJuIG51bGxcclxuXHJcbiAgICAvLyBSZWFkIENvbHVtbiBHIGF0IHRoZSBzYW1lIHJvdyBpbmRleFxyXG4gICAgY29uc3QgcmVtYWluaW5nUmF3ID0gKHJlbWFpbmluZ1JhbmdlPy52YWx1ZXM/Lltyb3dJbmRleF0/LlswXSBhcyBzdHJpbmcgfCB1bmRlZmluZWQpID8/ICcnXHJcbiAgICBpZiAoIXJlbWFpbmluZ1JhdykgcmV0dXJuIG51bGxcclxuXHJcbiAgICAvLyBQYXJzZSBFdXJvcGVhbiBjdXJyZW5jeSBmb3JtYXQgXHUyMDE0IHN0cmlwICQgYW5kIHdoaXRlc3BhY2UsIGNvbnZlcnQgY29tbWEvcGVyaW9kXHJcbiAgICAvLyBlLmcuIFwiJDUuOTQyLDQzXCIgXHUyMTkyIDU5NDIuNDMgIHwgIFwiJDEwNCw0MFwiIFx1MjE5MiAxMDQuNDBcclxuICAgIGNvbnN0IHJlbWFpbmluZyA9IHBhcnNlQ3VycmVuY3kocmVtYWluaW5nUmF3KVxyXG4gICAgaWYgKGlzTmFOKHJlbWFpbmluZykgfHwgcmVtYWluaW5nIDw9IDApIHJldHVybiBudWxsXHJcblxyXG4gICAgLy8gUmVhZCBDb2x1bW4gRiBhdCB0aGUgc2FtZSByb3cgaW5kZXggKHNwZW50IHRvZGF5KSBcdTIwMTQgbWF5IGJlIGFic2VudCAvIHplcm8gb24gZGF5IHN0YXJ0XHJcbiAgICBjb25zdCBzcGVudFJhdyA9IChzcGVudFJhbmdlPy52YWx1ZXM/Lltyb3dJbmRleF0/LlswXSBhcyBzdHJpbmcgfCB1bmRlZmluZWQpID8/ICcwJ1xyXG4gICAgY29uc3Qgc3BlbnQgPSBwYXJzZUN1cnJlbmN5KHNwZW50UmF3KVxyXG5cclxuICAgIC8vIEJ1aWxkIHBlci1hY2NvdW50IHNwZW50IG1hcDogYWNjb3VudElkc1tpXSBcdTIxOTIgSFtyb3dJbmRleF1baV1cclxuICAgIC8vIGFjY291bnRCbG9ja1JhbmdlIHJvdyAwID0gYWNjb3VudCBJRHMgKEgzKSwgcm93IHJvd0luZGV4ID0gcGVyLWFjY291bnQgc3BlbnQgKEhbMytyb3dJbmRleF0pXHJcbiAgICBjb25zdCBwZXJBY2NvdW50Um93OiBzdHJpbmdbXSA9IChhY2NvdW50QmxvY2tSYW5nZT8udmFsdWVzPy5bcm93SW5kZXhdID8/IFtdKSBhcyBzdHJpbmdbXVxyXG4gICAgY29uc3QgYWNjb3VudFNwZW50TWFwOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge31cclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYWNjb3VudElkcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICBjb25zdCByYXdWYWwgPSBwZXJBY2NvdW50Um93W2ldID8/ICcwJ1xyXG4gICAgICBjb25zdCBwYXJzZWRWYWwgPSBwYXJzZUN1cnJlbmN5KHJhd1ZhbClcclxuICAgICAgYWNjb3VudFNwZW50TWFwW2FjY291bnRJZHNbaV1dID0gaXNOYU4ocGFyc2VkVmFsKSA/IDAgOiBwYXJzZWRWYWxcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4geyB0YWJOYW1lLCBncm91cE5hbWUsIGFjY291bnRJZHMsIHJlbWFpbmluZywgc3BlbnQ6IGlzTmFOKHNwZW50KSA/IDAgOiBzcGVudCwgYWNjb3VudFNwZW50TWFwLCBkYXRlOiB0b2RheVN0ciB9XHJcbiAgfVxyXG59XHJcblxyXG4vKiogUGFyc2UgRXVyb3BlYW4gb3IgVVMgY3VycmVuY3kgc3RyaW5ncyB0byBmbG9hdC5cclxuICogIFwiJDUuOTQyLDQzXCIgXHUyMTkyIDU5NDIuNDMgIHwgIFwiJDEwNCw0MFwiIFx1MjE5MiAxMDQuNDAgIHwgIFwiMTIzNC41NlwiIFx1MjE5MiAxMjM0LjU2XHJcbiAqL1xyXG5mdW5jdGlvbiBwYXJzZUN1cnJlbmN5KHJhdzogc3RyaW5nKTogbnVtYmVyIHtcclxuICBjb25zdCBjbGVhbmVkID0gcmF3LnJlcGxhY2UoL1tcXHMkXHUyMEFDXS9nLCAnJylcclxuICBpZiAoL15cXGR7MSwzfShcXC5cXGR7M30pKigsXFxkKyk/JC8udGVzdChjbGVhbmVkKSkge1xyXG4gICAgcmV0dXJuIHBhcnNlRmxvYXQoY2xlYW5lZC5yZXBsYWNlKC9cXC4vZywgJycpLnJlcGxhY2UoJywnLCAnLicpKVxyXG4gIH1cclxuICByZXR1cm4gcGFyc2VGbG9hdChjbGVhbmVkLnJlcGxhY2UoLywvZywgJycpKVxyXG59XHJcbiIsICJpbXBvcnQgYXhpb3MgZnJvbSAnYXhpb3MnXHJcblxyXG5jb25zdCBGQl9BUElfVkVSU0lPTiA9ICd2MjQuMCdcclxuY29uc3QgRkJfQVBJX0JBU0UgPSBgaHR0cHM6Ly9ncmFwaC5mYWNlYm9vay5jb20vJHtGQl9BUElfVkVSU0lPTn1gXHJcblxyXG5leHBvcnQgY2xhc3MgRmFjZWJvb2tTZXJ2aWNlIHtcclxuICAvKipcclxuICAgKiBWZXJpZmllcyBhIHRva2VuIGlzIHZhbGlkIGJ5IGNhbGxpbmcgL21lLlxyXG4gICAqIFJldHVybnMgdGhlIGFwcCB1c2VyIG5hbWUgb24gc3VjY2VzcywgdGhyb3dzIG9uIGZhaWx1cmUuXHJcbiAgICovXHJcbiAgYXN5bmMgdmFsaWRhdGVUb2tlbih0b2tlbjogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcclxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IGF4aW9zLmdldDx7IG5hbWU6IHN0cmluZyB9PihgJHtGQl9BUElfQkFTRX0vbWVgLCB7XHJcbiAgICAgIHBhcmFtczogeyBhY2Nlc3NfdG9rZW46IHRva2VuLCBmaWVsZHM6ICduYW1lJyB9LFxyXG4gICAgICB0aW1lb3V0OiAxMF8wMDAsXHJcbiAgICB9KVxyXG4gICAgcmV0dXJuIHJlcy5kYXRhLm5hbWVcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFNldHMgdGhlIHNwZW5kIGNhcCBmb3IgYSBzaW5nbGUgYWQgYWNjb3VudC5cclxuICAgKiBQT1NUIGh0dHBzOi8vZ3JhcGguZmFjZWJvb2suY29tL3YyNC4wL2FjdF97aWR9P3NwZW5kX2NhcD17Y2VudHN9JmFjY2Vzc190b2tlbj17dG9rZW59XHJcbiAgICogRmFjZWJvb2sgQVBJIGV4cGVjdHMgdGhlIGFtb3VudCBpbiBjZW50cyAoVVNEICogMTAwKS5cclxuICAgKlxyXG4gICAqIEBwYXJhbSBhY2NvdW50SWQgLSB3aXRoIG9yIHdpdGhvdXQgXCJhY3RfXCIgcHJlZml4OyB3aWxsIG5vcm1hbGlzZVxyXG4gICAqIEBwYXJhbSBkYWlseUJ1ZGdldFVTRCAtIGRvbGxhciBhbW91bnQgKGUuZy4gMTUwLjUwKVxyXG4gICAqIEBwYXJhbSB0b2tlbiAtIEZhY2Vib29rIE1hcmtldGluZyBBUEkgYWNjZXNzIHRva2VuXHJcbiAgICovXHJcbiAgYXN5bmMgc2V0U3BlbmRpbmdMaW1pdChcclxuICAgIGFjY291bnRJZDogc3RyaW5nLFxyXG4gICAgZGFpbHlCdWRnZXRVU0Q6IG51bWJlcixcclxuICAgIHRva2VuOiBzdHJpbmcsXHJcbiAgKTogUHJvbWlzZTx7IHN1Y2Nlc3M6IGJvb2xlYW47IGVycm9yPzogc3RyaW5nIH0+IHtcclxuICAgIC8vIE5vcm1hbGlzZSBhY2NvdW50IElEXHJcbiAgICBjb25zdCBub3JtYWxpc2VkID0gYWNjb3VudElkLnN0YXJ0c1dpdGgoJ2FjdF8nKSA/IGFjY291bnRJZCA6IGBhY3RfJHthY2NvdW50SWR9YFxyXG4gICAgLy8gRkIgQVBJIHNwZW5kX2NhcCBhY2NlcHRzIHRoZSBleGFjdCBkb2xsYXIgYW1vdW50IGFzIGEgZmxvYXQgKGUuZy4gNjI3LjQ3KVxyXG4gICAgY29uc3Qgc3BlbmRDYXAgPSBkYWlseUJ1ZGdldFVTRFxyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGF3YWl0IGF4aW9zLnBvc3QoXHJcbiAgICAgICAgYCR7RkJfQVBJX0JBU0V9LyR7bm9ybWFsaXNlZH1gLFxyXG4gICAgICAgIG51bGwsXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgcGFyYW1zOiB7XHJcbiAgICAgICAgICAgIGFjY2Vzc190b2tlbjogdG9rZW4sXHJcbiAgICAgICAgICAgIHNwZW5kX2NhcDogc3BlbmRDYXAsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAgdGltZW91dDogMTVfMDAwLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIClcclxuICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSB9XHJcbiAgICB9IGNhdGNoIChlcnI6IHVua25vd24pIHtcclxuICAgICAgY29uc3QgbWVzc2FnZSA9IGV4dHJhY3RGYkVycm9yKGVycilcclxuICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBtZXNzYWdlIH1cclxuICAgIH1cclxuICB9XHJcbiAgLyoqXHJcbiAgICogRGVsZXRlcyB0aGUgc3BlbmQgY2FwIGZvciBhbiBhZCBhY2NvdW50IHVzaW5nIHNwZW5kX2NhcF9hY3Rpb249ZGVsZXRlLlxyXG4gICAqIFVzZWQgZm9yIGluYWN0aXZlIGFjY291bnRzIGluIENhc2UgQiB0byBwcmV2ZW50IGJ1ZGdldCBsb2NrLXVwLlxyXG4gICAqL1xyXG4gIGFzeW5jIGNsZWFyU3BlbmRpbmdMaW1pdChcclxuICAgIGFjY291bnRJZDogc3RyaW5nLFxyXG4gICAgdG9rZW46IHN0cmluZyxcclxuICApOiBQcm9taXNlPHsgc3VjY2VzczogYm9vbGVhbjsgZXJyb3I/OiBzdHJpbmcgfT4ge1xyXG4gICAgY29uc3Qgbm9ybWFsaXNlZCA9IGFjY291bnRJZC5zdGFydHNXaXRoKCdhY3RfJykgPyBhY2NvdW50SWQgOiBgYWN0XyR7YWNjb3VudElkfWBcclxuICAgIHRyeSB7XHJcbiAgICAgIGF3YWl0IGF4aW9zLnBvc3QoYCR7RkJfQVBJX0JBU0V9LyR7bm9ybWFsaXNlZH1gLCBudWxsLCB7XHJcbiAgICAgICAgcGFyYW1zOiB7IGFjY2Vzc190b2tlbjogdG9rZW4sIHNwZW5kX2NhcF9hY3Rpb246ICdkZWxldGUnIH0sXHJcbiAgICAgICAgdGltZW91dDogMTVfMDAwLFxyXG4gICAgICB9KVxyXG4gICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlIH1cclxuICAgIH0gY2F0Y2ggKGVycjogdW5rbm93bikge1xyXG4gICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGV4dHJhY3RGYkVycm9yKGVycikgfVxyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZXh0cmFjdEZiRXJyb3IoZXJyOiB1bmtub3duKTogc3RyaW5nIHtcclxuICBpZiAoYXhpb3MuaXNBeGlvc0Vycm9yKGVycikpIHtcclxuICAgIGNvbnN0IGRhdGEgPSBlcnIucmVzcG9uc2U/LmRhdGEgYXMgeyBlcnJvcj86IHsgbWVzc2FnZT86IHN0cmluZzsgY29kZT86IG51bWJlciB9IH0gfCB1bmRlZmluZWRcclxuICAgIGlmIChkYXRhPy5lcnJvcj8ubWVzc2FnZSkgcmV0dXJuIGBGQiBBUEkgJHtkYXRhLmVycm9yLmNvZGUgPz8gJyd9OiAke2RhdGEuZXJyb3IubWVzc2FnZX1gXHJcbiAgICBpZiAoZXJyLmNvZGUgPT09ICdFQ09OTkFCT1JURUQnKSByZXR1cm4gJ1JlcXVlc3QgdGltZWQgb3V0J1xyXG4gICAgcmV0dXJuIGVyci5tZXNzYWdlXHJcbiAgfVxyXG4gIGlmIChlcnIgaW5zdGFuY2VvZiBFcnJvcikgcmV0dXJuIGVyci5tZXNzYWdlXHJcbiAgcmV0dXJuIFN0cmluZyhlcnIpXHJcbn1cclxuIiwgImltcG9ydCB7IGFwcCB9IGZyb20gJ2VsZWN0cm9uJ1xyXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcydcclxuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJ1xyXG5pbXBvcnQgdHlwZSB7IEFwcENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi9zcmMvdHlwZXMvaW5kZXgnXHJcblxyXG5jb25zdCBERUZBVUxUX0NPTkZJRzogQXBwQ29uZmlndXJhdGlvbiA9IHtcclxuICBnb29nbGVTaGVldElkOiAnJyxcclxuICBzZXJ2aWNlQWNjb3VudFBhdGg6ICcnLFxyXG4gIGZhY2Vib29rQXBpVG9rZW46ICcnLFxyXG4gIGV4Y2x1ZGVkVGFiczpcclxuICAgICdDb25maWd1cmF0aW9uLCBSQVcgRGF0YSBBZ2dyZWdhdGVkLCBEYXNoYm9hcmQgU3VtbWFyeSwgRGFzaGJvYXJkIFN1bW1hcnkgKFZOXHUwMTEwKSwgQWRzIFJ1bGVzIFN0YXR1cywgVXBkYXRlIE1vbmV5LCBVcGRhdGUgTW9uZXkgMSwgQ3VzdG9tTWVzc2FnZSwgQlx1MUVBM25nIFRcdTFFRDVuZyBIXHUxRUUzcCwgVVNEIG1cdTFFQUJ1JyxcclxuICBzY2hlZHVsZUVuYWJsZWQ6IGZhbHNlLFxyXG4gIHNjaGVkdWxlSW50ZXJ2YWxIb3VyczogMixcclxuICBzY2hlZHVsZUluY2x1ZGVkR3JvdXBzOiBbXSxcclxuICBtYXhCdWZmZXI6IDEwMCxcclxuICBhdXRvUmV2b2tlSW5hY3RpdmU6IHRydWUsXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldENvbmZpZ1BhdGgoKTogc3RyaW5nIHtcclxuICByZXR1cm4gcGF0aC5qb2luKGFwcC5nZXRQYXRoKCd1c2VyRGF0YScpLCAnY29uZmlnLmpzb24nKVxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgQ29uZmlnU2VydmljZSB7XHJcbiAgbG9hZCgpOiBBcHBDb25maWd1cmF0aW9uIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHJhdyA9IGZzLnJlYWRGaWxlU3luYyhnZXRDb25maWdQYXRoKCksICd1dGYtOCcpXHJcbiAgICAgIHJldHVybiB7IC4uLkRFRkFVTFRfQ09ORklHLCAuLi5KU09OLnBhcnNlKHJhdykgfVxyXG4gICAgfSBjYXRjaCB7XHJcbiAgICAgIHJldHVybiB7IC4uLkRFRkFVTFRfQ09ORklHIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIHNhdmUoY29uZmlnOiBBcHBDb25maWd1cmF0aW9uKTogdm9pZCB7XHJcbiAgICBjb25zdCBjb25maWdQYXRoID0gZ2V0Q29uZmlnUGF0aCgpXHJcbiAgICBmcy5ta2RpclN5bmMocGF0aC5kaXJuYW1lKGNvbmZpZ1BhdGgpLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KVxyXG4gICAgZnMud3JpdGVGaWxlU3luYyhjb25maWdQYXRoLCBKU09OLnN0cmluZ2lmeShjb25maWcsIG51bGwsIDIpLCAndXRmLTgnKVxyXG4gIH1cclxufVxyXG4iLCAiaW1wb3J0IHsgQnJvd3NlcldpbmRvdyB9IGZyb20gJ2VsZWN0cm9uJ1xyXG5pbXBvcnQgdHlwZSB7IEFwcENvbmZpZ3VyYXRpb24sIExvZ0V2ZW50LCBTY2hlZHVsZVN0YXR1cywgU2NoZWR1bGVTdGF0ZSB9IGZyb20gJy4uLy4uL3NyYy90eXBlcy9pbmRleCdcclxuXHJcbi8qKiBMYXN0LXJ1biBsb2cgcmluZyBidWZmZXIgY2FwICovXHJcbmNvbnN0IE1BWF9MT0dfRU5UUklFUyA9IDUwMFxyXG5cclxuLyoqIFRoZSBsb2dGbiBzaWduYXR1cmUgbWF0Y2hlcyBleGVjdXRlRm9yR3JvdXBzOiAobWVzc2FnZSwgdHlwZT8pICovXHJcbmV4cG9ydCB0eXBlIFNjaGVkdWxlTG9nRm4gPSAobWVzc2FnZTogc3RyaW5nLCB0eXBlPzogTG9nRXZlbnRbJ3R5cGUnXSkgPT4gdm9pZFxyXG5cclxuLyoqIENhbGxiYWNrIGluamVjdGVkIGJ5IGlwY0hhbmRsZXJzIHRvIGF2b2lkIGNpcmN1bGFyIGltcG9ydHMgKi9cclxuZXhwb3J0IHR5cGUgU2NoZWR1bGVSdW5DYWxsYmFjayA9IChjb25maWc6IEFwcENvbmZpZ3VyYXRpb24sIGxvZ0ZuOiBTY2hlZHVsZUxvZ0ZuKSA9PiBQcm9taXNlPHZvaWQ+XHJcblxyXG5leHBvcnQgY2xhc3MgU2NoZWR1bGVyU2VydmljZSB7XHJcbiAgcHJpdmF0ZSB0aW1lcjogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCBudWxsID0gbnVsbFxyXG4gIHByaXZhdGUgc3RhdGU6IFNjaGVkdWxlU3RhdGUgPSAnaWRsZSdcclxuICBwcml2YXRlIG5leHRSdW46IHN0cmluZyB8IHVuZGVmaW5lZFxyXG4gIHByaXZhdGUgbGFzdFJ1bjogc3RyaW5nIHwgdW5kZWZpbmVkXHJcbiAgcHJpdmF0ZSBsYXN0RXJyb3I6IHN0cmluZyB8IHVuZGVmaW5lZFxyXG4gIHByaXZhdGUgbGFzdFJ1bkxvZ3M6IExvZ0V2ZW50W10gPSBbXVxyXG4gIHByaXZhdGUgcnVuQ2FsbGJhY2s6IFNjaGVkdWxlUnVuQ2FsbGJhY2sgfCBudWxsID0gbnVsbFxyXG4gIHByaXZhdGUgaW50ZXJ2YWxIb3VycyA9IDJcclxuXHJcbiAgc2V0UnVuQ2FsbGJhY2soY2I6IFNjaGVkdWxlUnVuQ2FsbGJhY2spOiB2b2lkIHtcclxuICAgIHRoaXMucnVuQ2FsbGJhY2sgPSBjYlxyXG4gIH1cclxuXHJcbiAgLy8gXHUyNTAwXHUyNTAwIFN0YXJ0IC8gU3RvcCBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcclxuXHJcbiAgc3RhcnQoY29uZmlnOiBBcHBDb25maWd1cmF0aW9uKTogdm9pZCB7XHJcbiAgICB0aGlzLnN0b3AoKVxyXG4gICAgaWYgKCFjb25maWcuc2NoZWR1bGVFbmFibGVkKSB7XHJcbiAgICAgIHRoaXMuc2V0U3RhdGUoJ2lkbGUnKVxyXG4gICAgICByZXR1cm5cclxuICAgIH1cclxuICAgIHRoaXMuaW50ZXJ2YWxIb3VycyA9IGNvbmZpZy5zY2hlZHVsZUludGVydmFsSG91cnMgPz8gMlxyXG4gICAgdGhpcy5zY2hlZHVsZU5leHQoY29uZmlnKVxyXG4gIH1cclxuXHJcbiAgc3RvcCgpOiB2b2lkIHtcclxuICAgIGlmICh0aGlzLnRpbWVyICE9PSBudWxsKSB7XHJcbiAgICAgIGNsZWFyVGltZW91dCh0aGlzLnRpbWVyKVxyXG4gICAgICB0aGlzLnRpbWVyID0gbnVsbFxyXG4gICAgfVxyXG4gICAgaWYgKHRoaXMuc3RhdGUgIT09ICdydW5uaW5nJykge1xyXG4gICAgICB0aGlzLnNldFN0YXRlKCdpZGxlJylcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8vIFx1MjUwMFx1MjUwMCBTdGF0dXMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHJcblxyXG4gIGdldFN0YXR1cygpOiBTY2hlZHVsZVN0YXR1cyB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBzdGF0ZTogdGhpcy5zdGF0ZSxcclxuICAgICAgbmV4dFJ1bjogdGhpcy5uZXh0UnVuLFxyXG4gICAgICBsYXN0UnVuOiB0aGlzLmxhc3RSdW4sXHJcbiAgICAgIGVycm9yOiB0aGlzLmxhc3RFcnJvcixcclxuICAgICAgaW50ZXJ2YWxIb3VyczogdGhpcy5pbnRlcnZhbEhvdXJzLFxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZ2V0TGFzdExvZ3MoKTogTG9nRXZlbnRbXSB7XHJcbiAgICByZXR1cm4gWy4uLnRoaXMubGFzdFJ1bkxvZ3NdXHJcbiAgfVxyXG5cclxuICAvLyBcdTI1MDBcdTI1MDAgSW50ZXJuYWwgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHJcblxyXG4gIHByaXZhdGUgc2NoZWR1bGVOZXh0KGNvbmZpZzogQXBwQ29uZmlndXJhdGlvbik6IHZvaWQge1xyXG4gICAgY29uc3QgbXNVbnRpbCA9IChjb25maWcuc2NoZWR1bGVJbnRlcnZhbEhvdXJzID8/IDIpICogNjAgKiA2MCAqIDEwMDBcclxuICAgIHRoaXMubmV4dFJ1biA9IG5ldyBEYXRlKERhdGUubm93KCkgKyBtc1VudGlsKS50b0lTT1N0cmluZygpXHJcbiAgICB0aGlzLnNldFN0YXRlKCdzY2hlZHVsZWQnKVxyXG5cclxuICAgIHRoaXMudGltZXIgPSBzZXRUaW1lb3V0KGFzeW5jICgpID0+IHtcclxuICAgICAgdGhpcy50aW1lciA9IG51bGxcclxuICAgICAgYXdhaXQgdGhpcy50cmlnZ2VyKGNvbmZpZylcclxuICAgICAgLy8gUmUtc2NoZWR1bGUgZm9yIHRoZSBuZXh0IGludGVydmFsXHJcbiAgICAgIHRoaXMuc2NoZWR1bGVOZXh0KGNvbmZpZylcclxuICAgIH0sIG1zVW50aWwpXHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzeW5jIHRyaWdnZXIoY29uZmlnOiBBcHBDb25maWd1cmF0aW9uKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBpZiAoIXRoaXMucnVuQ2FsbGJhY2spIHJldHVyblxyXG5cclxuICAgIHRoaXMubGFzdFJ1bkxvZ3MgPSBbXVxyXG4gICAgdGhpcy5zZXRTdGF0ZSgncnVubmluZycpXHJcbiAgICB0aGlzLmxhc3RFcnJvciA9IHVuZGVmaW5lZFxyXG5cclxuICAgIGNvbnN0IGxvZ0ZuOiBTY2hlZHVsZUxvZ0ZuID0gKG1lc3NhZ2UsIHR5cGUgPSAnaW5mbycpID0+IHtcclxuICAgICAgY29uc3QgZXZlbnQ6IExvZ0V2ZW50ID0geyBtZXNzYWdlLCB0eXBlIH1cclxuICAgICAgdGhpcy5sYXN0UnVuTG9ncy5wdXNoKGV2ZW50KVxyXG4gICAgICBpZiAodGhpcy5sYXN0UnVuTG9ncy5sZW5ndGggPiBNQVhfTE9HX0VOVFJJRVMpIHRoaXMubGFzdFJ1bkxvZ3Muc2hpZnQoKVxyXG4gICAgICBnZXRXaW4oKT8ud2ViQ29udGVudHMuc2VuZCgnc2NoZWR1bGU6bG9nJywgZXZlbnQpXHJcbiAgICB9XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgYXdhaXQgdGhpcy5ydW5DYWxsYmFjayhjb25maWcsIGxvZ0ZuKVxyXG4gICAgICB0aGlzLmxhc3RSdW4gPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcclxuICAgICAgdGhpcy5zZXRTdGF0ZSgnY29tcGxldGVkJylcclxuICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICB0aGlzLmxhc3RSdW4gPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcclxuICAgICAgdGhpcy5sYXN0RXJyb3IgPSBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycilcclxuICAgICAgdGhpcy5zZXRTdGF0ZSgnZXJyb3InKVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBzZXRTdGF0ZShzdGF0ZTogU2NoZWR1bGVTdGF0ZSk6IHZvaWQge1xyXG4gICAgdGhpcy5zdGF0ZSA9IHN0YXRlXHJcbiAgICBnZXRXaW4oKT8ud2ViQ29udGVudHMuc2VuZCgnc2NoZWR1bGU6c3RhdHVzLWNoYW5nZWQnLCB0aGlzLmdldFN0YXR1cygpKVxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0V2luKCk6IEJyb3dzZXJXaW5kb3cgfCBudWxsIHtcclxuICByZXR1cm4gQnJvd3NlcldpbmRvdy5nZXRBbGxXaW5kb3dzKClbMF0gPz8gbnVsbFxyXG59XHJcblxyXG4iLCAiaW1wb3J0IHsgYXV0b1VwZGF0ZXIgfSBmcm9tICdlbGVjdHJvbi11cGRhdGVyJ1xyXG5pbXBvcnQgeyBCcm93c2VyV2luZG93IH0gZnJvbSAnZWxlY3Ryb24nXHJcbmltcG9ydCB0eXBlIHsgVXBkYXRlU3RhdHVzIH0gZnJvbSAnLi4vLi4vc3JjL3R5cGVzL2luZGV4J1xyXG5cclxuY29uc3QgaXNEZXYgPSAhIXByb2Nlc3MuZW52WydWSVRFX0RFVl9TRVJWRVJfVVJMJ11cclxuXHJcbmZ1bmN0aW9uIGdldFdpbigpOiBCcm93c2VyV2luZG93IHwgbnVsbCB7XHJcbiAgcmV0dXJuIEJyb3dzZXJXaW5kb3cuZ2V0QWxsV2luZG93cygpWzBdID8/IG51bGxcclxufVxyXG5cclxuZnVuY3Rpb24gc2VuZChzdGF0dXM6IFVwZGF0ZVN0YXR1cyk6IHZvaWQge1xyXG4gIGdldFdpbigpPy53ZWJDb250ZW50cy5zZW5kKCd1cGRhdGU6c3RhdHVzJywgc3RhdHVzKVxyXG59XHJcblxyXG5pZiAoIWlzRGV2KSB7XHJcbiAgYXV0b1VwZGF0ZXIuYXV0b0Rvd25sb2FkID0gdHJ1ZVxyXG4gIGF1dG9VcGRhdGVyLmF1dG9JbnN0YWxsT25BcHBRdWl0ID0gdHJ1ZVxyXG5cclxuICBhdXRvVXBkYXRlci5vbignY2hlY2tpbmctZm9yLXVwZGF0ZScsICgpID0+IHtcclxuICAgIHNlbmQoeyBzdGF0ZTogJ2NoZWNraW5nJyB9KVxyXG4gIH0pXHJcblxyXG4gIGF1dG9VcGRhdGVyLm9uKCd1cGRhdGUtYXZhaWxhYmxlJywgKGluZm8pID0+IHtcclxuICAgIHNlbmQoeyBzdGF0ZTogJ2F2YWlsYWJsZScsIHZlcnNpb246IGluZm8udmVyc2lvbiB9KVxyXG4gIH0pXHJcblxyXG4gIGF1dG9VcGRhdGVyLm9uKCd1cGRhdGUtbm90LWF2YWlsYWJsZScsIChpbmZvKSA9PiB7XHJcbiAgICBzZW5kKHsgc3RhdGU6ICdub3QtYXZhaWxhYmxlJywgdmVyc2lvbjogaW5mby52ZXJzaW9uIH0pXHJcbiAgfSlcclxuXHJcbiAgYXV0b1VwZGF0ZXIub24oJ2Rvd25sb2FkLXByb2dyZXNzJywgKHByb2dyZXNzKSA9PiB7XHJcbiAgICBzZW5kKHsgc3RhdGU6ICdkb3dubG9hZGluZycsIHBlcmNlbnQ6IE1hdGgucm91bmQocHJvZ3Jlc3MucGVyY2VudCkgfSlcclxuICB9KVxyXG5cclxuICBhdXRvVXBkYXRlci5vbigndXBkYXRlLWRvd25sb2FkZWQnLCAoaW5mbykgPT4ge1xyXG4gICAgc2VuZCh7IHN0YXRlOiAnZG93bmxvYWRlZCcsIHZlcnNpb246IGluZm8udmVyc2lvbiB9KVxyXG4gIH0pXHJcblxyXG4gIGF1dG9VcGRhdGVyLm9uKCdlcnJvcicsIChlcnIpID0+IHtcclxuICAgIHNlbmQoeyBzdGF0ZTogJ2Vycm9yJywgZXJyb3I6IGVyci5tZXNzYWdlIH0pXHJcbiAgfSlcclxufVxyXG5cclxuZXhwb3J0IGNvbnN0IHVwZGF0ZXJTZXJ2aWNlID0ge1xyXG4gIGNoZWNrRm9yVXBkYXRlcygpOiB2b2lkIHtcclxuICAgIGlmIChpc0Rldikge1xyXG4gICAgICBzZW5kKHsgc3RhdGU6ICdlcnJvcicsIGVycm9yOiAnVXBkYXRlcyBub3QgYXZhaWxhYmxlIGluIGRldiBtb2RlLicgfSlcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcbiAgICBhdXRvVXBkYXRlci5jaGVja0ZvclVwZGF0ZXMoKS5jYXRjaCgoZXJyOiBFcnJvcikgPT4ge1xyXG4gICAgICBzZW5kKHsgc3RhdGU6ICdlcnJvcicsIGVycm9yOiBlcnIubWVzc2FnZSB9KVxyXG4gICAgfSlcclxuICB9LFxyXG5cclxuICBxdWl0QW5kSW5zdGFsbCgpOiB2b2lkIHtcclxuICAgIGlmICghaXNEZXYpIHtcclxuICAgICAgYXV0b1VwZGF0ZXIucXVpdEFuZEluc3RhbGwoKVxyXG4gICAgfVxyXG4gIH0sXHJcbn1cclxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsSUFBQUEsbUJBQTJEO0FBQzNELGtCQUFpQjtBQUNqQixzQkFBeUI7OztBQ0Z6QixJQUFBQyxtQkFBdUM7OztBQ0F2Qyx3QkFBdUI7QUFDdkIsc0JBQXVCO0FBVWhCLElBQU0sc0JBQU4sTUFBMEI7QUFBQSxFQUExQjtBQUNMLFNBQVEsT0FBMkQ7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNbkUsTUFBTSxhQUFhLG9CQUEyQztBQUM1RCxTQUFLLE9BQU8sSUFBSSx5QkFBTyxLQUFLLFdBQVc7QUFBQSxNQUNyQyxTQUFTO0FBQUEsTUFDVCxRQUFRLENBQUMsdURBQXVEO0FBQUEsSUFDbEUsQ0FBQztBQUVELFVBQU0sS0FBSyxLQUFLLFVBQVU7QUFBQSxFQUM1QjtBQUFBLEVBRUEsSUFBWSxTQUFTO0FBQ25CLFFBQUksQ0FBQyxLQUFLLEtBQU0sT0FBTSxJQUFJLE1BQU0sb0VBQW9FO0FBQ3BHLFdBQU8seUJBQU8sT0FBTyxFQUFFLFNBQVMsTUFBTSxNQUFNLEtBQUssS0FBSyxDQUFDO0FBQUEsRUFDekQ7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLE1BQU0sU0FBUyxTQUFpQixjQUEyQztBQUN6RSxVQUFNLE1BQU0sTUFBTSxLQUFLLE9BQU8sYUFBYSxJQUFJLEVBQUUsZUFBZSxRQUFRLENBQUM7QUFDekUsVUFBTSxTQUFTLElBQUksS0FBSyxVQUFVLENBQUM7QUFDbkMsV0FBTyxPQUNKLElBQUksQ0FBQyxNQUFNLEVBQUUsWUFBWSxTQUFTLEVBQUUsRUFDcEMsT0FBTyxDQUFDLFNBQVMsUUFBUSxDQUFDLGFBQWEsU0FBUyxLQUFLLEtBQUssQ0FBQyxDQUFDO0FBQUEsRUFDakU7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVFBLE1BQU0sU0FBUyxTQUFpQixTQUE0QztBQUMxRSxVQUFNLGVBQVcsd0JBQU8sb0JBQUksS0FBSyxHQUFHLFlBQVk7QUFJaEQsVUFBTSxNQUFNLE1BQU0sS0FBSyxPQUFPLGFBQWEsT0FBTyxTQUFTO0FBQUEsTUFDekQsZUFBZTtBQUFBLE1BQ2YsUUFBUTtBQUFBLFFBQ04sSUFBSSxPQUFPO0FBQUEsUUFDWCxJQUFJLE9BQU87QUFBQSxRQUNYLElBQUksT0FBTztBQUFBLFFBQ1gsSUFBSSxPQUFPO0FBQUEsUUFDWCxJQUFJLE9BQU87QUFBQSxNQUNiO0FBQUEsSUFDRixDQUFDO0FBRUQsVUFBTSxDQUFDLGdCQUFnQixZQUFZLFlBQVksZ0JBQWdCLGlCQUFpQixJQUM5RSxJQUFJLEtBQUssZUFBZSxDQUFDO0FBRzNCLFVBQU0sWUFBYSxnQkFBZ0IsU0FBUyxDQUFDLElBQUksQ0FBQyxLQUE0QjtBQUc5RSxVQUFNLGFBQXdCLG1CQUFtQixTQUFTLENBQUMsS0FBSyxDQUFDO0FBQ2pFLFVBQU0sYUFBYSxXQUNoQixJQUFJLENBQUMsT0FBTyxPQUFPLEVBQUUsRUFBRSxLQUFLLENBQUMsRUFDN0IsT0FBTyxPQUFPLEVBQ2QsSUFBSSxDQUFDLE9BQVEsR0FBRyxXQUFXLE1BQU0sSUFBSSxLQUFLLE9BQU8sRUFBRSxFQUFHO0FBRXpELFFBQUksV0FBVyxXQUFXLEVBQUcsUUFBTztBQUdwQyxVQUFNLFNBQW1CLFlBQVksVUFBVSxDQUFDLEdBQUcsSUFBSSxDQUFDLFFBQVEsT0FBTyxJQUFJLENBQUMsS0FBSyxFQUFFLEVBQUUsS0FBSyxDQUFDO0FBQzNGLFVBQU0sV0FBVyxNQUFNLFVBQVUsQ0FBQyxNQUFNLE1BQU0sUUFBUTtBQUN0RCxRQUFJLGFBQWEsR0FBSSxRQUFPO0FBRzVCLFVBQU0sZUFBZ0IsZ0JBQWdCLFNBQVMsUUFBUSxJQUFJLENBQUMsS0FBNEI7QUFDeEYsUUFBSSxDQUFDLGFBQWMsUUFBTztBQUkxQixVQUFNLFlBQVksY0FBYyxZQUFZO0FBQzVDLFFBQUksTUFBTSxTQUFTLEtBQUssYUFBYSxFQUFHLFFBQU87QUFHL0MsVUFBTSxXQUFZLFlBQVksU0FBUyxRQUFRLElBQUksQ0FBQyxLQUE0QjtBQUNoRixVQUFNLFFBQVEsY0FBYyxRQUFRO0FBSXBDLFVBQU0sZ0JBQTJCLG1CQUFtQixTQUFTLFFBQVEsS0FBSyxDQUFDO0FBQzNFLFVBQU0sa0JBQTBDLENBQUM7QUFDakQsYUFBUyxJQUFJLEdBQUcsSUFBSSxXQUFXLFFBQVEsS0FBSztBQUMxQyxZQUFNLFNBQVMsY0FBYyxDQUFDLEtBQUs7QUFDbkMsWUFBTSxZQUFZLGNBQWMsTUFBTTtBQUN0QyxzQkFBZ0IsV0FBVyxDQUFDLENBQUMsSUFBSSxNQUFNLFNBQVMsSUFBSSxJQUFJO0FBQUEsSUFDMUQ7QUFFQSxXQUFPLEVBQUUsU0FBUyxXQUFXLFlBQVksV0FBVyxPQUFPLE1BQU0sS0FBSyxJQUFJLElBQUksT0FBTyxpQkFBaUIsTUFBTSxTQUFTO0FBQUEsRUFDdkg7QUFDRjtBQUtBLFNBQVMsY0FBYyxLQUFxQjtBQUMxQyxRQUFNLFVBQVUsSUFBSSxRQUFRLFdBQVcsRUFBRTtBQUN6QyxNQUFJLDZCQUE2QixLQUFLLE9BQU8sR0FBRztBQUM5QyxXQUFPLFdBQVcsUUFBUSxRQUFRLE9BQU8sRUFBRSxFQUFFLFFBQVEsS0FBSyxHQUFHLENBQUM7QUFBQSxFQUNoRTtBQUNBLFNBQU8sV0FBVyxRQUFRLFFBQVEsTUFBTSxFQUFFLENBQUM7QUFDN0M7OztBQ3pIQSxtQkFBa0I7QUFFbEIsSUFBTSxpQkFBaUI7QUFDdkIsSUFBTSxjQUFjLDhCQUE4QixjQUFjO0FBRXpELElBQU0sa0JBQU4sTUFBc0I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBSzNCLE1BQU0sY0FBYyxPQUFnQztBQUNsRCxVQUFNLE1BQU0sTUFBTSxhQUFBQyxRQUFNLElBQXNCLEdBQUcsV0FBVyxPQUFPO0FBQUEsTUFDakUsUUFBUSxFQUFFLGNBQWMsT0FBTyxRQUFRLE9BQU87QUFBQSxNQUM5QyxTQUFTO0FBQUEsSUFDWCxDQUFDO0FBQ0QsV0FBTyxJQUFJLEtBQUs7QUFBQSxFQUNsQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBV0EsTUFBTSxpQkFDSixXQUNBLGdCQUNBLE9BQytDO0FBRS9DLFVBQU0sYUFBYSxVQUFVLFdBQVcsTUFBTSxJQUFJLFlBQVksT0FBTyxTQUFTO0FBRTlFLFVBQU0sV0FBVztBQUVqQixRQUFJO0FBQ0YsWUFBTSxhQUFBQSxRQUFNO0FBQUEsUUFDVixHQUFHLFdBQVcsSUFBSSxVQUFVO0FBQUEsUUFDNUI7QUFBQSxRQUNBO0FBQUEsVUFDRSxRQUFRO0FBQUEsWUFDTixjQUFjO0FBQUEsWUFDZCxXQUFXO0FBQUEsVUFDYjtBQUFBLFVBQ0EsU0FBUztBQUFBLFFBQ1g7QUFBQSxNQUNGO0FBQ0EsYUFBTyxFQUFFLFNBQVMsS0FBSztBQUFBLElBQ3pCLFNBQVMsS0FBYztBQUNyQixZQUFNLFVBQVUsZUFBZSxHQUFHO0FBQ2xDLGFBQU8sRUFBRSxTQUFTLE9BQU8sT0FBTyxRQUFRO0FBQUEsSUFDMUM7QUFBQSxFQUNGO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLE1BQU0sbUJBQ0osV0FDQSxPQUMrQztBQUMvQyxVQUFNLGFBQWEsVUFBVSxXQUFXLE1BQU0sSUFBSSxZQUFZLE9BQU8sU0FBUztBQUM5RSxRQUFJO0FBQ0YsWUFBTSxhQUFBQSxRQUFNLEtBQUssR0FBRyxXQUFXLElBQUksVUFBVSxJQUFJLE1BQU07QUFBQSxRQUNyRCxRQUFRLEVBQUUsY0FBYyxPQUFPLGtCQUFrQixTQUFTO0FBQUEsUUFDMUQsU0FBUztBQUFBLE1BQ1gsQ0FBQztBQUNELGFBQU8sRUFBRSxTQUFTLEtBQUs7QUFBQSxJQUN6QixTQUFTLEtBQWM7QUFDckIsYUFBTyxFQUFFLFNBQVMsT0FBTyxPQUFPLGVBQWUsR0FBRyxFQUFFO0FBQUEsSUFDdEQ7QUFBQSxFQUNGO0FBQ0Y7QUFFQSxTQUFTLGVBQWUsS0FBc0I7QUFDNUMsTUFBSSxhQUFBQSxRQUFNLGFBQWEsR0FBRyxHQUFHO0FBQzNCLFVBQU0sT0FBTyxJQUFJLFVBQVU7QUFDM0IsUUFBSSxNQUFNLE9BQU8sUUFBUyxRQUFPLFVBQVUsS0FBSyxNQUFNLFFBQVEsRUFBRSxLQUFLLEtBQUssTUFBTSxPQUFPO0FBQ3ZGLFFBQUksSUFBSSxTQUFTLGVBQWdCLFFBQU87QUFDeEMsV0FBTyxJQUFJO0FBQUEsRUFDYjtBQUNBLE1BQUksZUFBZSxNQUFPLFFBQU8sSUFBSTtBQUNyQyxTQUFPLE9BQU8sR0FBRztBQUNuQjs7O0FDckZBLHNCQUFvQjtBQUNwQixTQUFvQjtBQUNwQixXQUFzQjtBQUd0QixJQUFNLGlCQUFtQztBQUFBLEVBQ3ZDLGVBQWU7QUFBQSxFQUNmLG9CQUFvQjtBQUFBLEVBQ3BCLGtCQUFrQjtBQUFBLEVBQ2xCLGNBQ0U7QUFBQSxFQUNGLGlCQUFpQjtBQUFBLEVBQ2pCLHVCQUF1QjtBQUFBLEVBQ3ZCLHdCQUF3QixDQUFDO0FBQUEsRUFDekIsV0FBVztBQUFBLEVBQ1gsb0JBQW9CO0FBQ3RCO0FBRUEsU0FBUyxnQkFBd0I7QUFDL0IsU0FBWSxVQUFLLG9CQUFJLFFBQVEsVUFBVSxHQUFHLGFBQWE7QUFDekQ7QUFFTyxJQUFNLGdCQUFOLE1BQW9CO0FBQUEsRUFDekIsT0FBeUI7QUFDdkIsUUFBSTtBQUNGLFlBQU0sTUFBUyxnQkFBYSxjQUFjLEdBQUcsT0FBTztBQUNwRCxhQUFPLEVBQUUsR0FBRyxnQkFBZ0IsR0FBRyxLQUFLLE1BQU0sR0FBRyxFQUFFO0FBQUEsSUFDakQsUUFBUTtBQUNOLGFBQU8sRUFBRSxHQUFHLGVBQWU7QUFBQSxJQUM3QjtBQUFBLEVBQ0Y7QUFBQSxFQUVBLEtBQUssUUFBZ0M7QUFDbkMsVUFBTSxhQUFhLGNBQWM7QUFDakMsSUFBRyxhQUFlLGFBQVEsVUFBVSxHQUFHLEVBQUUsV0FBVyxLQUFLLENBQUM7QUFDMUQsSUFBRyxpQkFBYyxZQUFZLEtBQUssVUFBVSxRQUFRLE1BQU0sQ0FBQyxHQUFHLE9BQU87QUFBQSxFQUN2RTtBQUNGOzs7QUNyQ0EsSUFBQUMsbUJBQThCO0FBSTlCLElBQU0sa0JBQWtCO0FBUWpCLElBQU0sbUJBQU4sTUFBdUI7QUFBQSxFQUF2QjtBQUNMLFNBQVEsUUFBOEM7QUFDdEQsU0FBUSxRQUF1QjtBQUkvQixTQUFRLGNBQTBCLENBQUM7QUFDbkMsU0FBUSxjQUEwQztBQUNsRCxTQUFRLGdCQUFnQjtBQUFBO0FBQUEsRUFFeEIsZUFBZSxJQUErQjtBQUM1QyxTQUFLLGNBQWM7QUFBQSxFQUNyQjtBQUFBO0FBQUEsRUFJQSxNQUFNLFFBQWdDO0FBQ3BDLFNBQUssS0FBSztBQUNWLFFBQUksQ0FBQyxPQUFPLGlCQUFpQjtBQUMzQixXQUFLLFNBQVMsTUFBTTtBQUNwQjtBQUFBLElBQ0Y7QUFDQSxTQUFLLGdCQUFnQixPQUFPLHlCQUF5QjtBQUNyRCxTQUFLLGFBQWEsTUFBTTtBQUFBLEVBQzFCO0FBQUEsRUFFQSxPQUFhO0FBQ1gsUUFBSSxLQUFLLFVBQVUsTUFBTTtBQUN2QixtQkFBYSxLQUFLLEtBQUs7QUFDdkIsV0FBSyxRQUFRO0FBQUEsSUFDZjtBQUNBLFFBQUksS0FBSyxVQUFVLFdBQVc7QUFDNUIsV0FBSyxTQUFTLE1BQU07QUFBQSxJQUN0QjtBQUFBLEVBQ0Y7QUFBQTtBQUFBLEVBSUEsWUFBNEI7QUFDMUIsV0FBTztBQUFBLE1BQ0wsT0FBTyxLQUFLO0FBQUEsTUFDWixTQUFTLEtBQUs7QUFBQSxNQUNkLFNBQVMsS0FBSztBQUFBLE1BQ2QsT0FBTyxLQUFLO0FBQUEsTUFDWixlQUFlLEtBQUs7QUFBQSxJQUN0QjtBQUFBLEVBQ0Y7QUFBQSxFQUVBLGNBQTBCO0FBQ3hCLFdBQU8sQ0FBQyxHQUFHLEtBQUssV0FBVztBQUFBLEVBQzdCO0FBQUE7QUFBQSxFQUlRLGFBQWEsUUFBZ0M7QUFDbkQsVUFBTSxXQUFXLE9BQU8seUJBQXlCLEtBQUssS0FBSyxLQUFLO0FBQ2hFLFNBQUssVUFBVSxJQUFJLEtBQUssS0FBSyxJQUFJLElBQUksT0FBTyxFQUFFLFlBQVk7QUFDMUQsU0FBSyxTQUFTLFdBQVc7QUFFekIsU0FBSyxRQUFRLFdBQVcsWUFBWTtBQUNsQyxXQUFLLFFBQVE7QUFDYixZQUFNLEtBQUssUUFBUSxNQUFNO0FBRXpCLFdBQUssYUFBYSxNQUFNO0FBQUEsSUFDMUIsR0FBRyxPQUFPO0FBQUEsRUFDWjtBQUFBLEVBRUEsTUFBYyxRQUFRLFFBQXlDO0FBQzdELFFBQUksQ0FBQyxLQUFLLFlBQWE7QUFFdkIsU0FBSyxjQUFjLENBQUM7QUFDcEIsU0FBSyxTQUFTLFNBQVM7QUFDdkIsU0FBSyxZQUFZO0FBRWpCLFVBQU0sUUFBdUIsQ0FBQyxTQUFTLE9BQU8sV0FBVztBQUN2RCxZQUFNLFFBQWtCLEVBQUUsU0FBUyxLQUFLO0FBQ3hDLFdBQUssWUFBWSxLQUFLLEtBQUs7QUFDM0IsVUFBSSxLQUFLLFlBQVksU0FBUyxnQkFBaUIsTUFBSyxZQUFZLE1BQU07QUFDdEUsYUFBTyxHQUFHLFlBQVksS0FBSyxnQkFBZ0IsS0FBSztBQUFBLElBQ2xEO0FBRUEsUUFBSTtBQUNGLFlBQU0sS0FBSyxZQUFZLFFBQVEsS0FBSztBQUNwQyxXQUFLLFdBQVUsb0JBQUksS0FBSyxHQUFFLFlBQVk7QUFDdEMsV0FBSyxTQUFTLFdBQVc7QUFBQSxJQUMzQixTQUFTLEtBQUs7QUFDWixXQUFLLFdBQVUsb0JBQUksS0FBSyxHQUFFLFlBQVk7QUFDdEMsV0FBSyxZQUFZLGVBQWUsUUFBUSxJQUFJLFVBQVUsT0FBTyxHQUFHO0FBQ2hFLFdBQUssU0FBUyxPQUFPO0FBQUEsSUFDdkI7QUFBQSxFQUNGO0FBQUEsRUFFUSxTQUFTLE9BQTRCO0FBQzNDLFNBQUssUUFBUTtBQUNiLFdBQU8sR0FBRyxZQUFZLEtBQUssMkJBQTJCLEtBQUssVUFBVSxDQUFDO0FBQUEsRUFDeEU7QUFDRjtBQUVBLFNBQVMsU0FBK0I7QUFDdEMsU0FBTywrQkFBYyxjQUFjLEVBQUUsQ0FBQyxLQUFLO0FBQzdDOzs7QUNoSEEsOEJBQTRCO0FBQzVCLElBQUFDLG1CQUE4QjtBQUc5QixJQUFNLFFBQVE7QUFFZCxTQUFTQyxVQUErQjtBQUN0QyxTQUFPLCtCQUFjLGNBQWMsRUFBRSxDQUFDLEtBQUs7QUFDN0M7QUFFQSxTQUFTLEtBQUssUUFBNEI7QUFDeEMsRUFBQUEsUUFBTyxHQUFHLFlBQVksS0FBSyxpQkFBaUIsTUFBTTtBQUNwRDtBQUVBLElBQUksQ0FBQyxPQUFPO0FBQ1Ysc0NBQVksZUFBZTtBQUMzQixzQ0FBWSx1QkFBdUI7QUFFbkMsc0NBQVksR0FBRyx1QkFBdUIsTUFBTTtBQUMxQyxTQUFLLEVBQUUsT0FBTyxXQUFXLENBQUM7QUFBQSxFQUM1QixDQUFDO0FBRUQsc0NBQVksR0FBRyxvQkFBb0IsQ0FBQyxTQUFTO0FBQzNDLFNBQUssRUFBRSxPQUFPLGFBQWEsU0FBUyxLQUFLLFFBQVEsQ0FBQztBQUFBLEVBQ3BELENBQUM7QUFFRCxzQ0FBWSxHQUFHLHdCQUF3QixDQUFDLFNBQVM7QUFDL0MsU0FBSyxFQUFFLE9BQU8saUJBQWlCLFNBQVMsS0FBSyxRQUFRLENBQUM7QUFBQSxFQUN4RCxDQUFDO0FBRUQsc0NBQVksR0FBRyxxQkFBcUIsQ0FBQyxhQUFhO0FBQ2hELFNBQUssRUFBRSxPQUFPLGVBQWUsU0FBUyxLQUFLLE1BQU0sU0FBUyxPQUFPLEVBQUUsQ0FBQztBQUFBLEVBQ3RFLENBQUM7QUFFRCxzQ0FBWSxHQUFHLHFCQUFxQixDQUFDLFNBQVM7QUFDNUMsU0FBSyxFQUFFLE9BQU8sY0FBYyxTQUFTLEtBQUssUUFBUSxDQUFDO0FBQUEsRUFDckQsQ0FBQztBQUVELHNDQUFZLEdBQUcsU0FBUyxDQUFDLFFBQVE7QUFDL0IsU0FBSyxFQUFFLE9BQU8sU0FBUyxPQUFPLElBQUksUUFBUSxDQUFDO0FBQUEsRUFDN0MsQ0FBQztBQUNIO0FBRU8sSUFBTSxpQkFBaUI7QUFBQSxFQUM1QixrQkFBd0I7QUFDdEIsUUFBSSxPQUFPO0FBQ1QsV0FBSyxFQUFFLE9BQU8sU0FBUyxPQUFPLHFDQUFxQyxDQUFDO0FBQ3BFO0FBQUEsSUFDRjtBQUNBLHdDQUFZLGdCQUFnQixFQUFFLE1BQU0sQ0FBQyxRQUFlO0FBQ2xELFdBQUssRUFBRSxPQUFPLFNBQVMsT0FBTyxJQUFJLFFBQVEsQ0FBQztBQUFBLElBQzdDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxpQkFBdUI7QUFDckIsUUFBSSxDQUFDLE9BQU87QUFDViwwQ0FBWSxlQUFlO0FBQUEsSUFDN0I7QUFBQSxFQUNGO0FBQ0Y7OztBTG5EQSxJQUFNLGdCQUFnQixJQUFJLG9CQUFvQjtBQUM5QyxJQUFNLFlBQVksSUFBSSxnQkFBZ0I7QUFDdEMsSUFBTSxnQkFBZ0IsSUFBSSxjQUFjO0FBQ2pDLElBQU0sbUJBQW1CLElBQUksaUJBQWlCO0FBRXJELFNBQVNDLFVBQStCO0FBQ3RDLFNBQU8sK0JBQWMsY0FBYyxFQUFFLENBQUMsS0FBSztBQUM3QztBQUVBLFNBQVMsUUFBUSxPQUF1QjtBQUN0QyxFQUFBQSxRQUFPLEdBQUcsWUFBWSxLQUFLLGlCQUFpQixLQUFLO0FBQ25EO0FBRUEsU0FBUyxJQUFJLFNBQWlCLE9BQXlCLFFBQWM7QUFDbkUsVUFBUSxFQUFFLFNBQVMsS0FBSyxDQUFDO0FBQ3pCLFVBQVEsSUFBSSxJQUFJLEtBQUssWUFBWSxDQUFDLEtBQUssT0FBTyxFQUFFO0FBQ2xEO0FBV0EsZUFBc0IsaUJBQ3BCLFVBQ0EsUUFDQSxPQUNlO0FBQ2YsUUFBTSx1Q0FBdUM7QUFFN0MsTUFBSTtBQUNGLFVBQU0sV0FBVyxNQUFNLFVBQVUsY0FBYyxPQUFPLGdCQUFnQjtBQUN0RSxVQUFNLCtCQUErQixRQUFRLE1BQU0sU0FBUztBQUFBLEVBQzlELFFBQVE7QUFDTixVQUFNLGdFQUFnRSxPQUFPO0FBQzdFO0FBQUEsRUFDRjtBQUVBLE1BQUk7QUFDRixVQUFNLGNBQWMsYUFBYSxPQUFPLGtCQUFrQjtBQUMxRCxVQUFNLDRDQUE0QyxTQUFTO0FBQUEsRUFDN0QsU0FBUyxLQUFLO0FBQ1osVUFBTSxzREFBaUQsZUFBZSxRQUFRLElBQUksVUFBVSxPQUFPLEdBQUcsQ0FBQyxJQUFJLE9BQU87QUFDbEg7QUFBQSxFQUNGO0FBRUEsUUFBTSxFQUFFLFdBQVcsbUJBQW1CLElBQUk7QUFFMUMsUUFBTSwwQkFBMEIsU0FBUyxNQUFNLHlCQUF5QixTQUFTLGdCQUFnQixrQkFBa0IsTUFBTTtBQUV6SCxhQUFXLFdBQVcsVUFBVTtBQUM5QixVQUFNLHVCQUFhLE9BQU8sRUFBRTtBQUU1QixRQUFJO0FBQ0osUUFBSTtBQUNGLGtCQUFZLE1BQU0sY0FBYyxTQUFTLE9BQU8sZUFBZSxPQUFPO0FBQUEsSUFDeEUsU0FBUyxLQUFLO0FBQ1osWUFBTSx3QkFBd0IsT0FBTyxNQUFNLGVBQWUsUUFBUSxJQUFJLFVBQVUsT0FBTyxHQUFHLENBQUMsSUFBSSxPQUFPO0FBQ3RHO0FBQUEsSUFDRjtBQUVBLFFBQUksQ0FBQyxXQUFXO0FBQ2QsWUFBTSwwQkFBeUIsb0JBQUksS0FBSyxHQUFFLG1CQUFtQixPQUFPLENBQUMsU0FBUyxPQUFPLHNCQUFpQixTQUFTO0FBQy9HO0FBQUEsSUFDRjtBQUVBLFVBQU0sRUFBRSxXQUFXLFlBQVksV0FBVyxPQUFPLFlBQVksZ0JBQWdCLElBQUk7QUFDakYsVUFBTSxjQUFjO0FBQ3BCLFVBQU0sZUFBZTtBQUtyQixVQUFNLFdBQVcsQ0FBQyxPQUF1QjtBQUN2QyxVQUFJLG1CQUFtQixNQUFNLGdCQUFpQixRQUFPLGdCQUFnQixFQUFFO0FBQ3ZFLGFBQU8sY0FBYztBQUFBLElBQ3ZCO0FBRUEsVUFBTSxpQkFBaUIsWUFBWSxPQUFPLENBQUMsT0FBTyxTQUFTLEVBQUUsSUFBSSxJQUFJO0FBQ3JFLFVBQU0sbUJBQW1CLFlBQVksT0FBTyxDQUFDLE9BQU8sU0FBUyxFQUFFLEtBQUssSUFBSTtBQUd4RSxVQUFNLGVBQWUsZUFBZSxXQUFXO0FBQy9DLFVBQU0saUJBQWlCLGVBQWUsY0FBYztBQUNwRCxVQUFNLGtCQUFrQixlQUFlLENBQUMsSUFBSTtBQUU1QyxVQUFNLFFBQVEsZUFBZTtBQUM3QixRQUFJLFVBQVUsR0FBRztBQUNmLFlBQU0sMkNBQXNDLFNBQVM7QUFDckQ7QUFBQSxJQUNGO0FBSUEsVUFBTSxtQkFBbUIsZUFBZSxJQUFJLGVBQWUsT0FBTyxDQUFDLEdBQUcsT0FBTyxJQUFJLFNBQVMsRUFBRSxHQUFHLENBQUM7QUFDaEcsVUFBTSxxQkFBcUIsQ0FBQyxPQUF1QjtBQUNqRCxVQUFJLGdCQUFnQixxQkFBcUIsRUFBRyxRQUFPLEtBQUssSUFBSSxXQUFXLGVBQWUsS0FBSztBQUMzRixhQUFPLEtBQUssSUFBSSxXQUFZLFNBQVMsRUFBRSxJQUFJLG1CQUFvQixZQUFZO0FBQUEsSUFDN0U7QUFFQTtBQUFBLE1BQ0UsTUFBTSxTQUFTLEtBQUssWUFBWSxNQUFNLHVCQUF1QixjQUFjLEdBQUcsUUFBUSxDQUFDLENBQUMsaUJBQWlCLGFBQWEsUUFBUSxDQUFDLENBQUMsTUFDOUgsZUFBZSwwQkFBcUIsS0FBSyxhQUFhLHNCQUFpQixLQUFLLGtDQUFrQyxnQkFBZ0IsTUFBTSxXQUN0STtBQUFBLElBQ0Y7QUFHQSxlQUFXLGFBQWEsZ0JBQWdCO0FBQ3RDLFlBQU0sUUFBUSxtQkFBbUIsU0FBUztBQUMxQyxZQUFNLE1BQU0sTUFBTSxLQUFLLE9BQU8sSUFBSSxHQUFHO0FBQ3JDLFlBQU0sU0FBUyxNQUFNLFVBQVUsaUJBQWlCLFdBQVcsT0FBTyxPQUFPLGdCQUFnQjtBQUN6RixVQUFJLE9BQU8sU0FBUztBQUNsQixjQUFNLGFBQVEsU0FBUyx5QkFBb0IsTUFBTSxRQUFRLENBQUMsQ0FBQyxJQUFJLFNBQVM7QUFBQSxNQUMxRSxPQUFPO0FBQ0wsY0FBTSxhQUFRLFNBQVMsV0FBTSxPQUFPLFNBQVMsZUFBZSxJQUFJLE9BQU87QUFBQSxNQUN6RTtBQUFBLElBQ0Y7QUFHQSxRQUFJLENBQUMsZ0JBQWdCLHNCQUFzQixnQkFBZ0IsU0FBUyxHQUFHO0FBQ3JFLGlCQUFXLGFBQWEsaUJBQWlCO0FBQ3ZDLGNBQU0sTUFBTSxNQUFNLEtBQUssT0FBTyxJQUFJLEdBQUc7QUFDckMsY0FBTSxTQUFTLE1BQU0sVUFBVSxtQkFBbUIsV0FBVyxPQUFPLGdCQUFnQjtBQUNwRixZQUFJLE9BQU8sU0FBUztBQUNsQixnQkFBTSxhQUFRLFNBQVMsb0NBQStCLE1BQU07QUFBQSxRQUM5RCxPQUFPO0FBQ0wsZ0JBQU0sYUFBUSxTQUFTLHlCQUFvQixPQUFPLFNBQVMsZUFBZSxJQUFJLE9BQU87QUFBQSxRQUN2RjtBQUFBLE1BQ0Y7QUFBQSxJQUNGLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxzQkFBc0IsZ0JBQWdCLFNBQVMsR0FBRztBQUM3RSxZQUFNLGFBQVEsZ0JBQWdCLE1BQU0sZ0VBQTJELE1BQU07QUFBQSxJQUN2RztBQUVBLFVBQU0sdUJBQWEsU0FBUyxjQUFjO0FBQUEsRUFDNUM7QUFFQSxRQUFNLHVCQUF1QixTQUFTO0FBQ3hDO0FBRU8sU0FBUyxzQkFBNEI7QUFFMUMsbUJBQWlCLGVBQWUsT0FBTyxRQUFRLFVBQVU7QUFFdkQsVUFBTSxXQUFXLE9BQU8sYUFDckIsTUFBTSxHQUFHLEVBQ1QsSUFBSSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsRUFDbkIsT0FBTyxPQUFPO0FBQ2pCLFVBQU0sY0FBYyxhQUFhLE9BQU8sa0JBQWtCO0FBQzFELFVBQU0sVUFBVSxNQUFNLGNBQWMsU0FBUyxPQUFPLGVBQWUsUUFBUTtBQUMzRSxVQUFNLFdBQVcsT0FBTywwQkFBMEIsQ0FBQztBQUNuRCxVQUFNLFdBQVcsU0FBUyxTQUFTLElBQUksUUFBUSxPQUFPLENBQUMsTUFBTSxTQUFTLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQztBQUN0RixVQUFNLGtCQUFrQixTQUFTLE1BQU0seUJBQXlCLFNBQVMsTUFBTSxjQUFjLFFBQVEsU0FBUyxTQUFTLE1BQU0sWUFBWTtBQUN6SSxVQUFNLGlCQUFpQixVQUFVLFFBQVEsS0FBSztBQUFBLEVBQ2hELENBQUM7QUFHRCwyQkFBUSxPQUFPLGVBQWUsTUFBTSxjQUFjLEtBQUssQ0FBQztBQUV4RCwyQkFBUSxPQUFPLGVBQWUsQ0FBQyxRQUFpQixXQUFpRDtBQUMvRixrQkFBYyxLQUFLLE1BQU07QUFFekIscUJBQWlCLE1BQU0sTUFBTTtBQUFBLEVBQy9CLENBQUM7QUFHRCwyQkFBUTtBQUFBLElBQ047QUFBQSxJQUNBLE9BQU8sUUFBaUIsU0FBaUIsb0JBQTRCO0FBQ25FLFlBQU0sU0FBUyxjQUFjLEtBQUs7QUFDbEMsWUFBTSxjQUFjLGFBQWEsT0FBTyxrQkFBa0I7QUFDMUQsWUFBTSxXQUFXLGdCQUNkLE1BQU0sR0FBRyxFQUNULElBQUksQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLEVBQ25CLE9BQU8sT0FBTztBQUNqQixZQUFNLE9BQU8sTUFBTSxjQUFjLFNBQVMsU0FBUyxRQUFRO0FBQzNELFlBQU0sVUFBVSxNQUFNLFFBQVE7QUFBQSxRQUM1QixLQUFLLElBQUksQ0FBQyxRQUFRLGNBQWMsU0FBUyxTQUFTLEdBQUcsQ0FBQztBQUFBLE1BQ3hEO0FBQ0EsYUFBTyxLQUFLLElBQUksQ0FBQyxTQUFTLE1BQWlCO0FBQ3pDLGNBQU0sSUFBSSxRQUFRLENBQUM7QUFDbkIsWUFBSSxFQUFFLFdBQVcsZUFBZSxFQUFFLFVBQVUsS0FBTSxRQUFPLEVBQUU7QUFDM0QsZUFBTyxFQUFFLFNBQVMsV0FBVyxRQUFRO0FBQUEsTUFDdkMsQ0FBQztBQUFBLElBQ0g7QUFBQSxFQUNGO0FBR0EsMkJBQVEsT0FBTyxpQkFBaUIsT0FBTyxRQUFpQixXQUE0QjtBQUNsRixVQUFNLEVBQUUsZ0JBQWdCLE9BQU8sSUFBSTtBQUNuQyxVQUFNLGlCQUFpQixnQkFBZ0IsUUFBUSxDQUFDLEtBQUssU0FBUyxJQUFJLEtBQUssSUFBSSxDQUFDO0FBQUEsRUFDOUUsQ0FBQztBQUdELDJCQUFRLE9BQU8sbUJBQW1CLE1BQU0saUJBQWlCLFVBQVUsQ0FBQztBQUVwRSwyQkFBUSxPQUFPLGtCQUFrQixNQUFNO0FBQ3JDLFVBQU0sU0FBUyxjQUFjLEtBQUs7QUFDbEMscUJBQWlCLE1BQU0sTUFBTTtBQUM3QixXQUFPLGlCQUFpQixVQUFVO0FBQUEsRUFDcEMsQ0FBQztBQUVELDJCQUFRLE9BQU8saUJBQWlCLE1BQU07QUFDcEMscUJBQWlCLEtBQUs7QUFDdEIsV0FBTyxpQkFBaUIsVUFBVTtBQUFBLEVBQ3BDLENBQUM7QUFFRCwyQkFBUSxPQUFPLHFCQUFxQixNQUFNLGlCQUFpQixZQUFZLENBQUM7QUFHeEUsMkJBQVEsT0FBTyxnQkFBZ0IsTUFBTSxlQUFlLGdCQUFnQixDQUFDO0FBQ3JFLDJCQUFRLE9BQU8sa0JBQWtCLE1BQU0sZUFBZSxlQUFlLENBQUM7QUFDdEUsMkJBQVEsT0FBTyxxQkFBcUIsTUFBTTtBQUN4QyxVQUFNLEVBQUUsS0FBQUMsS0FBSSxJQUFJLFFBQVEsVUFBVTtBQUNsQyxXQUFPQSxLQUFJLFdBQVc7QUFBQSxFQUN4QixDQUFDO0FBQ0g7QUFFQSxTQUFTLE1BQU0sSUFBMkI7QUFDeEMsU0FBTyxJQUFJLFFBQVEsQ0FBQyxZQUFZLFdBQVcsU0FBUyxFQUFFLENBQUM7QUFDekQ7OztBRDlOQSxJQUFNLHNCQUFzQjtBQUU1QixJQUFNLGdCQUFnQixZQUFBQyxRQUFLLEtBQUssV0FBVyxNQUFNLE1BQU07QUFFdkQsSUFBSTtBQUVKLFNBQVMsZUFBZTtBQUN0QixRQUFNLElBQUksK0JBQWM7QUFBQSxJQUN0QixPQUFPO0FBQUEsSUFDUCxRQUFRO0FBQUEsSUFDUixVQUFVO0FBQUEsSUFDVixXQUFXO0FBQUEsSUFDWCxPQUFPO0FBQUEsSUFDUCxnQkFBZ0I7QUFBQSxNQUNkLFNBQVMsWUFBQUEsUUFBSyxLQUFLLFdBQVcsYUFBYTtBQUFBLE1BQzNDLGtCQUFrQjtBQUFBLE1BQ2xCLGlCQUFpQjtBQUFBLElBQ25CO0FBQUEsRUFDRixDQUFDO0FBRUQsTUFBSSxxQkFBcUI7QUFDdkIsUUFBSSxRQUFRLG1CQUFtQjtBQUMvQixRQUFJLFlBQVksYUFBYTtBQUFBLEVBQy9CLE9BQU87QUFDTCxRQUFJLFNBQVMsWUFBQUEsUUFBSyxLQUFLLGVBQWUsWUFBWSxDQUFDO0FBQUEsRUFDckQ7QUFDRjtBQUVBLHFCQUFJLEdBQUcscUJBQXFCLE1BQU07QUFDaEMsTUFBSSxRQUFRLGFBQWEsVUFBVTtBQUNqQyx5QkFBSSxLQUFLO0FBQ1QsVUFBTTtBQUFBLEVBQ1I7QUFDRixDQUFDO0FBRUQscUJBQUksR0FBRyxZQUFZLE1BQU07QUFDdkIsTUFBSSwrQkFBYyxjQUFjLEVBQUUsV0FBVyxFQUFHLGNBQWE7QUFDL0QsQ0FBQztBQUdELHlCQUFRLE9BQU8sbUJBQW1CLFlBQVk7QUFDNUMsTUFBSSxDQUFDLElBQUssUUFBTztBQUNqQixRQUFNLFNBQVMsTUFBTSx3QkFBTyxlQUFlLEtBQUs7QUFBQSxJQUM5QyxPQUFPO0FBQUEsSUFDUCxTQUFTLENBQUMsRUFBRSxNQUFNLGNBQWMsWUFBWSxDQUFDLE1BQU0sRUFBRSxDQUFDO0FBQUEsSUFDdEQsWUFBWSxDQUFDLFVBQVU7QUFBQSxFQUN6QixDQUFDO0FBQ0QsU0FBTyxPQUFPLFdBQVcsT0FBTyxPQUFPLFVBQVUsQ0FBQztBQUNwRCxDQUFDO0FBR0QseUJBQVEsT0FBTyxlQUFlLE9BQU8sUUFBaUIsYUFBcUI7QUFDekUsTUFBSSxDQUFDLFNBQVMsU0FBUyxPQUFPLEVBQUcsT0FBTSxJQUFJLE1BQU0sOEJBQThCO0FBQy9FLGFBQU8sMEJBQVMsVUFBVSxPQUFPO0FBQ25DLENBQUM7QUFHRCx5QkFBUSxPQUFPLHNCQUFzQixDQUFDLFFBQWlCLFFBQWdCO0FBQ3JFLE1BQUksZUFBZSxLQUFLLEdBQUcsRUFBRyx3QkFBTSxhQUFhLEdBQUc7QUFDdEQsQ0FBQztBQUVELHFCQUFJLFVBQVUsRUFBRSxLQUFLLE1BQU07QUFDekIsc0JBQW9CO0FBQ3BCLGVBQWE7QUFFYixRQUFNLGNBQWMsSUFBSSxjQUFjLEVBQUUsS0FBSztBQUM3QyxNQUFJLFlBQVksaUJBQWlCO0FBQy9CLHFCQUFpQixNQUFNLFdBQVc7QUFBQSxFQUNwQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbImltcG9ydF9lbGVjdHJvbiIsICJpbXBvcnRfZWxlY3Ryb24iLCAiYXhpb3MiLCAiaW1wb3J0X2VsZWN0cm9uIiwgImltcG9ydF9lbGVjdHJvbiIsICJnZXRXaW4iLCAiZ2V0V2luIiwgImFwcCIsICJwYXRoIl0KfQo=
