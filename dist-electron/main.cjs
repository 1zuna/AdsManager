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
        `'${tabName}'!G3:G300`,
        `'${tabName}'!H3:ZZ3`
      ]
    });
    const [groupNameRange, datesRange, remainingRange, accountIdsRange] = res.data.valueRanges ?? [];
    const groupName = groupNameRange?.values?.[0]?.[0] ?? tabName;
    const accountRow = accountIdsRange?.values?.[0] ?? [];
    const accountIds = accountRow.map((id) => String(id).trim()).filter(Boolean).map((id) => id.startsWith("act_") ? id : `act_${id}`);
    if (accountIds.length === 0) return null;
    const dates = (datesRange?.values ?? []).map((row) => String(row[0] ?? "").trim());
    const rowIndex = dates.findIndex((d) => d === todayStr);
    if (rowIndex === -1) return null;
    const remainingRaw = remainingRange?.values?.[rowIndex]?.[0] ?? "";
    if (!remainingRaw) return null;
    const cleaned = remainingRaw.replace(/[\s$€]/g, "");
    let remaining;
    if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(cleaned)) {
      remaining = parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
    } else {
      remaining = parseFloat(cleaned.replace(/,/g, ""));
    }
    if (isNaN(remaining) || remaining <= 0) return null;
    return { tabName, groupName, accountIds, remaining, date: todayStr };
  }
};

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
  scheduleTime: "08:00",
  scheduleExcludedGroups: []
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
      error: this.lastError
    };
  }
  getLastLogs() {
    return [...this.lastRunLogs];
  }
  // ── Internal ──────────────────────────────────────────────────────────────
  scheduleNext(config) {
    const msUntil = msUntilTime(config.scheduleTime);
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
function msUntilTime(hhmm) {
  const [hh, mm] = hhmm.split(":").map(Number);
  const now = /* @__PURE__ */ new Date();
  const target = new Date(now);
  target.setHours(hh, mm, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime() - now.getTime();
}
function getWin() {
  return import_electron2.BrowserWindow.getAllWindows()[0] ?? null;
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
  logFn(`Starting execution for ${tabNames.length} group(s)...`);
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
    const { groupName, accountIds, remaining } = groupData;
    const perAccount = remaining / accountIds.length;
    logFn(
      `   ${groupName}: ${accountIds.length} accounts, Remaining=$${remaining.toFixed(2)}, Per-account=$${perAccount.toFixed(2)}`
    );
    for (const accountId of accountIds) {
      await sleep(150 + Math.random() * 250);
      const result = await fbService.setSpendingLimit(accountId, perAccount, config.facebookApiToken);
      if (result.success) {
        logFn(`   \u2713 ${accountId} \u2192 limit set to $${perAccount.toFixed(2)}`, "success");
      } else {
        logFn(`   \u2717 ${accountId} \u2192 ${result.error ?? "unknown error"} (skipping)`, "error");
      }
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
    const tabNames = allTabs.filter((t) => !config.scheduleExcludedGroups.includes(t));
    logFn(`Scheduled job: ${tabNames.length} group(s) to process (${config.scheduleExcludedGroups.length} excluded).`);
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
