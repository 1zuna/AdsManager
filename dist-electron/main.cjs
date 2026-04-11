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
   * Wraps an API call with retry + exponential backoff to handle quota errors (429).
   * Mirrors reconciliation.py's execute_with_retry(): waits 2s, 4s, 8s before giving up.
   */
  async callWithRetry(fn, retries = 3) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        const e = err;
        const status = e?.response?.status;
        const message = String(e?.message ?? "");
        const isQuota = status === 429 || message.includes("Quota exceeded") || message.includes("RESOURCE_EXHAUSTED");
        if (isQuota && attempt < retries) {
          const waitMs = 2e3 * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, waitMs));
          lastErr = err;
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }
  /**
   * Returns all tab names from the spreadsheet, excluding system tabs.
   */
  async listTabs(sheetId, excludedTabs) {
    const res = await this.callWithRetry(() => this.sheets.spreadsheets.get({ spreadsheetId: sheetId }));
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
    const res = await this.callWithRetry(
      () => this.sheets.spreadsheets.values.batchGet({
        spreadsheetId: sheetId,
        ranges: [
          `'${tabName}'!B2`,
          `'${tabName}'!C3:C300`,
          `'${tabName}'!F3:F300`,
          `'${tabName}'!G3:G300`,
          `'${tabName}'!H3:ZZ300`
        ]
      })
    );
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
  scheduleExcludedGroups: [],
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
var fs2 = __toESM(require("fs"), 1);
var path2 = __toESM(require("path"), 1);
var MAX_LOG_ENTRIES = 5e3;
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
    const runStart = /* @__PURE__ */ new Date();
    const logFile = getLogFilePath(runStart);
    const runHeader = `
========== Run started: ${runStart.toISOString()} ==========`;
    appendToLogFile(logFile, [runHeader]);
    const typeLabel = {
      info: "[INFO]",
      success: "[ OK ]",
      error: "[ ERR]",
      warning: "[WARN]"
    };
    const logFn = (message, type = "info") => {
      const event = { message, type };
      this.lastRunLogs.push(event);
      if (this.lastRunLogs.length > MAX_LOG_ENTRIES) this.lastRunLogs.shift();
      getWin()?.webContents.send("schedule:log", event);
      const ts = (/* @__PURE__ */ new Date()).toTimeString().slice(0, 8);
      appendToLogFile(logFile, [`${ts} ${typeLabel[type]} ${message}`]);
    };
    try {
      await this.runCallback(config, logFn);
      this.lastRun = (/* @__PURE__ */ new Date()).toISOString();
      this.setState("completed");
    } catch (err) {
      this.lastRun = (/* @__PURE__ */ new Date()).toISOString();
      this.lastError = err instanceof Error ? err.message : String(err);
      this.setState("error");
    } finally {
      const runEnd = /* @__PURE__ */ new Date();
      appendToLogFile(logFile, [`========== Run ended:   ${runEnd.toISOString()} ==========
`]);
      pruneOldLogs();
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
function getLogsDir() {
  return path2.join(import_electron2.app.getPath("userData"), "logs");
}
function getLogFilePath(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return path2.join(getLogsDir(), `${yyyy}-${mm}-${dd}.log`);
}
function appendToLogFile(filePath, lines) {
  try {
    fs2.mkdirSync(path2.dirname(filePath), { recursive: true });
    fs2.appendFileSync(filePath, lines.join("\n") + "\n", "utf8");
  } catch {
  }
}
function pruneOldLogs() {
  try {
    const logsDir = getLogsDir();
    if (!fs2.existsSync(logsDir)) return;
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1e3;
    for (const file of fs2.readdirSync(logsDir)) {
      if (!file.endsWith(".log")) continue;
      const filePath = path2.join(logsDir, file);
      const stat = fs2.statSync(filePath);
      if (stat.mtimeMs < cutoff) fs2.unlinkSync(filePath);
    }
  } catch {
  }
}

// electron/services/updaterService.ts
var import_electron_updater = require("electron-updater");
var import_electron3 = require("electron");
var isDev = !!process.env["VITE_DEV_SERVER_URL"];
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
    await sleep(1200);
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
    logFn(`\u2500\u2500 Group "${tabName}" completed.`);
  }
  logFn("Execution finished.", "success");
}
function registerIpcHandlers() {
  schedulerService.setRunCallback(async (config, logFn) => {
    const excluded = config.excludedTabs.split(",").map((t) => t.trim()).filter(Boolean);
    await sheetsService.authenticate(config.serviceAccountPath);
    const allTabs = await sheetsService.listTabs(config.googleSheetId, excluded);
    const excludedFromSchedule = config.scheduleExcludedGroups ?? [];
    const tabNames = allTabs.filter((t) => !excludedFromSchedule.includes(t));
    logFn(`Scheduled job: ${tabNames.length} group(s) to process (${excludedFromSchedule.length} excluded).`);
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
    const { app: app4 } = require("electron");
    return app4.getVersion();
  });
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// electron/main.ts
var VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
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
