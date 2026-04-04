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
var import_electron4 = require("electron");
var import_path = __toESM(require("path"), 1);
var import_promises = require("fs/promises");

// electron/ipcHandlers.ts
var import_electron3 = require("electron");

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

// electron/ipcHandlers.ts
var sheetsService = new GoogleSheetsService();
var fbService = new FacebookService();
var configService = new ConfigService();
var schedulerService = new SchedulerService();
function getWin2() {
  return import_electron3.BrowserWindow.getAllWindows()[0] ?? null;
}
function sendLog(event) {
  getWin2()?.webContents.send("execution:log", event);
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
  import_electron3.ipcMain.handle("config:load", () => configService.load());
  import_electron3.ipcMain.handle("config:save", (_event, config) => {
    configService.save(config);
    schedulerService.start(config);
  });
  import_electron3.ipcMain.handle(
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
  import_electron3.ipcMain.handle("execution:run", async (_event, params) => {
    const { selectedGroups, config } = params;
    await executeForGroups(selectedGroups, config, (msg, type) => log(msg, type));
  });
  import_electron3.ipcMain.handle("schedule:status", () => schedulerService.getStatus());
  import_electron3.ipcMain.handle("schedule:start", () => {
    const config = configService.load();
    schedulerService.start(config);
    return schedulerService.getStatus();
  });
  import_electron3.ipcMain.handle("schedule:stop", () => {
    schedulerService.stop();
    return schedulerService.getStatus();
  });
  import_electron3.ipcMain.handle("schedule:lastLogs", () => schedulerService.getLastLogs());
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// electron/main.ts
var VITE_DEV_SERVER_URL = "http://localhost:8080/";
var RENDERER_DIST = import_path.default.join(__dirname, "..", "dist");
var win;
function createWindow() {
  win = new import_electron4.BrowserWindow({
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
import_electron4.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    import_electron4.app.quit();
    win = null;
  }
});
import_electron4.app.on("activate", () => {
  if (import_electron4.BrowserWindow.getAllWindows().length === 0) createWindow();
});
import_electron4.ipcMain.handle("dialog:openFile", async () => {
  if (!win) return null;
  const result = await import_electron4.dialog.showOpenDialog(win, {
    title: "Select Google Service Account JSON",
    filters: [{ name: "JSON Files", extensions: ["json"] }],
    properties: ["openFile"]
  });
  return result.canceled ? null : result.filePaths[0];
});
import_electron4.ipcMain.handle("fs:readFile", async (_event, filePath) => {
  if (!filePath.endsWith(".json")) throw new Error("Only .json files are allowed");
  return (0, import_promises.readFile)(filePath, "utf-8");
});
import_electron4.ipcMain.handle("shell:openExternal", (_event, url) => {
  if (/^https:\/\//i.test(url)) import_electron4.shell.openExternal(url);
});
import_electron4.app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  const savedConfig = new ConfigService().load();
  if (savedConfig.scheduleEnabled) {
    schedulerService.start(savedConfig);
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vZWxlY3Ryb24vbWFpbi50cyIsICIuLi9lbGVjdHJvbi9pcGNIYW5kbGVycy50cyIsICIuLi9lbGVjdHJvbi9zZXJ2aWNlcy9nb29nbGVTaGVldHNTZXJ2aWNlLnRzIiwgIi4uL2VsZWN0cm9uL3NlcnZpY2VzL2ZhY2Vib29rU2VydmljZS50cyIsICIuLi9lbGVjdHJvbi9zZXJ2aWNlcy9jb25maWdTZXJ2aWNlLnRzIiwgIi4uL2VsZWN0cm9uL3NlcnZpY2VzL3NjaGVkdWxlclNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IGFwcCwgQnJvd3NlcldpbmRvdywgaXBjTWFpbiwgZGlhbG9nLCBzaGVsbCB9IGZyb20gJ2VsZWN0cm9uJ1xyXG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJ1xyXG5pbXBvcnQgeyByZWFkRmlsZSB9IGZyb20gJ2ZzL3Byb21pc2VzJ1xyXG5pbXBvcnQgeyByZWdpc3RlcklwY0hhbmRsZXJzLCBzY2hlZHVsZXJTZXJ2aWNlIH0gZnJvbSAnLi9pcGNIYW5kbGVycydcclxuaW1wb3J0IHsgQ29uZmlnU2VydmljZSB9IGZyb20gJy4vc2VydmljZXMvY29uZmlnU2VydmljZSdcclxuXHJcbi8vIEluamVjdGVkIGJ5IHJvbGx1cCB3aGVuIGNvbXBpbGVkIHRvIENKU1xyXG5kZWNsYXJlIGNvbnN0IF9fZGlybmFtZTogc3RyaW5nXHJcblxyXG5jb25zdCBWSVRFX0RFVl9TRVJWRVJfVVJMID0gcHJvY2Vzcy5lbnZbJ1ZJVEVfREVWX1NFUlZFUl9VUkwnXVxyXG4vLyBkaXN0LWVsZWN0cm9uL21haW4uY2pzIGxpdmVzIGluc2lkZSBkaXN0LWVsZWN0cm9uLzsgZGlzdC8gaXMgYSBzaWJsaW5nXHJcbmNvbnN0IFJFTkRFUkVSX0RJU1QgPSBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4nLCAnZGlzdCcpXHJcblxyXG5sZXQgd2luOiBCcm93c2VyV2luZG93IHwgbnVsbFxyXG5cclxuZnVuY3Rpb24gY3JlYXRlV2luZG93KCkge1xyXG4gIHdpbiA9IG5ldyBCcm93c2VyV2luZG93KHtcclxuICAgIHdpZHRoOiA5NjAsXHJcbiAgICBoZWlnaHQ6IDcyMCxcclxuICAgIG1pbldpZHRoOiA3NjAsXHJcbiAgICBtaW5IZWlnaHQ6IDU2MCxcclxuICAgIHRpdGxlOiAnRkIgQWRzIExpbWl0IENvbnRyb2xsZXInLFxyXG4gICAgd2ViUHJlZmVyZW5jZXM6IHtcclxuICAgICAgcHJlbG9hZDogcGF0aC5qb2luKF9fZGlybmFtZSwgJ3ByZWxvYWQuY2pzJyksXHJcbiAgICAgIGNvbnRleHRJc29sYXRpb246IHRydWUsXHJcbiAgICAgIG5vZGVJbnRlZ3JhdGlvbjogZmFsc2UsXHJcbiAgICB9LFxyXG4gIH0pXHJcblxyXG4gIGlmIChWSVRFX0RFVl9TRVJWRVJfVVJMKSB7XHJcbiAgICB3aW4ubG9hZFVSTChWSVRFX0RFVl9TRVJWRVJfVVJMKVxyXG4gICAgd2luLndlYkNvbnRlbnRzLm9wZW5EZXZUb29scygpXHJcbiAgfSBlbHNlIHtcclxuICAgIHdpbi5sb2FkRmlsZShwYXRoLmpvaW4oUkVOREVSRVJfRElTVCwgJ2luZGV4Lmh0bWwnKSlcclxuICB9XHJcbn1cclxuXHJcbmFwcC5vbignd2luZG93LWFsbC1jbG9zZWQnLCAoKSA9PiB7XHJcbiAgaWYgKHByb2Nlc3MucGxhdGZvcm0gIT09ICdkYXJ3aW4nKSB7XHJcbiAgICBhcHAucXVpdCgpXHJcbiAgICB3aW4gPSBudWxsXHJcbiAgfVxyXG59KVxyXG5cclxuYXBwLm9uKCdhY3RpdmF0ZScsICgpID0+IHtcclxuICBpZiAoQnJvd3NlcldpbmRvdy5nZXRBbGxXaW5kb3dzKCkubGVuZ3RoID09PSAwKSBjcmVhdGVXaW5kb3coKVxyXG59KVxyXG5cclxuLy8gSVBDOiBuYXRpdmUgZmlsZSBwaWNrZXIgXHUyMDE0IHJlc3RyaWN0ZWQgdG8gSlNPTiBmaWxlc1xyXG5pcGNNYWluLmhhbmRsZSgnZGlhbG9nOm9wZW5GaWxlJywgYXN5bmMgKCkgPT4ge1xyXG4gIGlmICghd2luKSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRpYWxvZy5zaG93T3BlbkRpYWxvZyh3aW4sIHtcclxuICAgIHRpdGxlOiAnU2VsZWN0IEdvb2dsZSBTZXJ2aWNlIEFjY291bnQgSlNPTicsXHJcbiAgICBmaWx0ZXJzOiBbeyBuYW1lOiAnSlNPTiBGaWxlcycsIGV4dGVuc2lvbnM6IFsnanNvbiddIH1dLFxyXG4gICAgcHJvcGVydGllczogWydvcGVuRmlsZSddLFxyXG4gIH0pXHJcbiAgcmV0dXJuIHJlc3VsdC5jYW5jZWxlZCA/IG51bGwgOiByZXN1bHQuZmlsZVBhdGhzWzBdXHJcbn0pXHJcblxyXG4vLyBJUEM6IHJlYWQgZmlsZSBmcm9tIGRpc2sgXHUyMDE0IG9ubHkgLmpzb24gYWxsb3dlZFxyXG5pcGNNYWluLmhhbmRsZSgnZnM6cmVhZEZpbGUnLCBhc3luYyAoX2V2ZW50OiB1bmtub3duLCBmaWxlUGF0aDogc3RyaW5nKSA9PiB7XHJcbiAgaWYgKCFmaWxlUGF0aC5lbmRzV2l0aCgnLmpzb24nKSkgdGhyb3cgbmV3IEVycm9yKCdPbmx5IC5qc29uIGZpbGVzIGFyZSBhbGxvd2VkJylcclxuICByZXR1cm4gcmVhZEZpbGUoZmlsZVBhdGgsICd1dGYtOCcpXHJcbn0pXHJcblxyXG4vLyBJUEM6IG9wZW4gZXh0ZXJuYWwgSFRUUFMgVVJMIGluIHN5c3RlbSBicm93c2VyXHJcbmlwY01haW4uaGFuZGxlKCdzaGVsbDpvcGVuRXh0ZXJuYWwnLCAoX2V2ZW50OiB1bmtub3duLCB1cmw6IHN0cmluZykgPT4ge1xyXG4gIGlmICgvXmh0dHBzOlxcL1xcLy9pLnRlc3QodXJsKSkgc2hlbGwub3BlbkV4dGVybmFsKHVybClcclxufSlcclxuXHJcbmFwcC53aGVuUmVhZHkoKS50aGVuKCgpID0+IHtcclxuICByZWdpc3RlcklwY0hhbmRsZXJzKClcclxuICBjcmVhdGVXaW5kb3coKVxyXG4gIC8vIEF1dG8tc3RhcnQgdGhlIHNjaGVkdWxlciBpZiBpdCB3YXMgZW5hYmxlZCB3aGVuIHRoZSBhcHAgd2FzIGxhc3QgY2xvc2VkXHJcbiAgY29uc3Qgc2F2ZWRDb25maWcgPSBuZXcgQ29uZmlnU2VydmljZSgpLmxvYWQoKVxyXG4gIGlmIChzYXZlZENvbmZpZy5zY2hlZHVsZUVuYWJsZWQpIHtcclxuICAgIHNjaGVkdWxlclNlcnZpY2Uuc3RhcnQoc2F2ZWRDb25maWcpXHJcbiAgfVxyXG59KVxyXG4iLCAiaW1wb3J0IHsgaXBjTWFpbiwgQnJvd3NlcldpbmRvdyB9IGZyb20gJ2VsZWN0cm9uJ1xyXG5pbXBvcnQgeyBHb29nbGVTaGVldHNTZXJ2aWNlIH0gZnJvbSAnLi9zZXJ2aWNlcy9nb29nbGVTaGVldHNTZXJ2aWNlJ1xyXG5pbXBvcnQgeyBGYWNlYm9va1NlcnZpY2UgfSBmcm9tICcuL3NlcnZpY2VzL2ZhY2Vib29rU2VydmljZSdcclxuaW1wb3J0IHsgQ29uZmlnU2VydmljZSB9IGZyb20gJy4vc2VydmljZXMvY29uZmlnU2VydmljZSdcclxuaW1wb3J0IHsgU2NoZWR1bGVyU2VydmljZSB9IGZyb20gJy4vc2VydmljZXMvc2NoZWR1bGVyU2VydmljZSdcclxuaW1wb3J0IHR5cGUgeyBBcHBDb25maWd1cmF0aW9uLCBFeGVjdXRpb25QYXJhbXMsIExvZ0V2ZW50LCBHcm91cERhdGEgfSBmcm9tICcuLi9zcmMvdHlwZXMvaW5kZXgnXHJcblxyXG5jb25zdCBzaGVldHNTZXJ2aWNlID0gbmV3IEdvb2dsZVNoZWV0c1NlcnZpY2UoKVxyXG5jb25zdCBmYlNlcnZpY2UgPSBuZXcgRmFjZWJvb2tTZXJ2aWNlKClcclxuY29uc3QgY29uZmlnU2VydmljZSA9IG5ldyBDb25maWdTZXJ2aWNlKClcclxuZXhwb3J0IGNvbnN0IHNjaGVkdWxlclNlcnZpY2UgPSBuZXcgU2NoZWR1bGVyU2VydmljZSgpXHJcblxyXG5mdW5jdGlvbiBnZXRXaW4oKTogQnJvd3NlcldpbmRvdyB8IG51bGwge1xyXG4gIHJldHVybiBCcm93c2VyV2luZG93LmdldEFsbFdpbmRvd3MoKVswXSA/PyBudWxsXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNlbmRMb2coZXZlbnQ6IExvZ0V2ZW50KTogdm9pZCB7XHJcbiAgZ2V0V2luKCk/LndlYkNvbnRlbnRzLnNlbmQoJ2V4ZWN1dGlvbjpsb2cnLCBldmVudClcclxufVxyXG5cclxuZnVuY3Rpb24gbG9nKG1lc3NhZ2U6IHN0cmluZywgdHlwZTogTG9nRXZlbnRbJ3R5cGUnXSA9ICdpbmZvJyk6IHZvaWQge1xyXG4gIHNlbmRMb2coeyBtZXNzYWdlLCB0eXBlIH0pXHJcbiAgY29uc29sZS5sb2coYFske3R5cGUudG9VcHBlckNhc2UoKX1dICR7bWVzc2FnZX1gKVxyXG59XHJcblxyXG4vLyBcdTI1MDBcdTI1MDAgU2hhcmVkIGV4ZWN1dGlvbiBsb29wIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxyXG4vLyBVc2VkIGJ5IGJvdGggdGhlIG1hbnVhbCBJUEMgaGFuZGxlciBhbmQgdGhlIHNjaGVkdWxlZCBqb2IuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBleGVjdXRlRm9yR3JvdXBzKFxyXG4gIHRhYk5hbWVzOiBzdHJpbmdbXSxcclxuICBjb25maWc6IEFwcENvbmZpZ3VyYXRpb24sXHJcbiAgbG9nRm46IChtZXNzYWdlOiBzdHJpbmcsIHR5cGU/OiBMb2dFdmVudFsndHlwZSddKSA9PiB2b2lkLFxyXG4pOiBQcm9taXNlPHZvaWQ+IHtcclxuICBsb2dGbignUHJlLWZsaWdodDogdmFsaWRhdGluZyBjcmVkZW50aWFscy4uLicpXHJcblxyXG4gIHRyeSB7XHJcbiAgICBjb25zdCB1c2VyTmFtZSA9IGF3YWl0IGZiU2VydmljZS52YWxpZGF0ZVRva2VuKGNvbmZpZy5mYWNlYm9va0FwaVRva2VuKVxyXG4gICAgbG9nRm4oYFByZS1mbGlnaHQ6IEZCIHRva2VuIHZhbGlkICgke3VzZXJOYW1lfSkuYCwgJ3N1Y2Nlc3MnKVxyXG4gIH0gY2F0Y2gge1xyXG4gICAgbG9nRm4oJ1ByZS1mbGlnaHQgZmFpbGVkOiBGYWNlYm9vayBBUEkgdG9rZW4gaXMgaW52YWxpZCBvciBleHBpcmVkLicsICdlcnJvcicpXHJcbiAgICByZXR1cm5cclxuICB9XHJcblxyXG4gIHRyeSB7XHJcbiAgICBhd2FpdCBzaGVldHNTZXJ2aWNlLmF1dGhlbnRpY2F0ZShjb25maWcuc2VydmljZUFjY291bnRQYXRoKVxyXG4gICAgbG9nRm4oJ1ByZS1mbGlnaHQ6IEdvb2dsZSBTaGVldHMgYXV0aGVudGljYXRlZC4nLCAnc3VjY2VzcycpXHJcbiAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICBsb2dGbihgUHJlLWZsaWdodCBmYWlsZWQ6IEdvb2dsZSBTaGVldHMgYXV0aCBlcnJvciBcdTIwMTQgJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCwgJ2Vycm9yJylcclxuICAgIHJldHVyblxyXG4gIH1cclxuXHJcbiAgbG9nRm4oYFN0YXJ0aW5nIGV4ZWN1dGlvbiBmb3IgJHt0YWJOYW1lcy5sZW5ndGh9IGdyb3VwKHMpLi4uYClcclxuXHJcbiAgZm9yIChjb25zdCB0YWJOYW1lIG9mIHRhYk5hbWVzKSB7XHJcbiAgICBsb2dGbihgXHUyNTAwXHUyNTAwIEdyb3VwOiAke3RhYk5hbWV9YClcclxuXHJcbiAgICBsZXQgZ3JvdXBEYXRhXHJcbiAgICB0cnkge1xyXG4gICAgICBncm91cERhdGEgPSBhd2FpdCBzaGVldHNTZXJ2aWNlLnBhcnNlVGFiKGNvbmZpZy5nb29nbGVTaGVldElkLCB0YWJOYW1lKVxyXG4gICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgIGxvZ0ZuKGAgICBTaGVldHMgZXJyb3IgZm9yIFwiJHt0YWJOYW1lfVwiOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gLCAnZXJyb3InKVxyXG4gICAgICBjb250aW51ZVxyXG4gICAgfVxyXG5cclxuICAgIGlmICghZ3JvdXBEYXRhKSB7XHJcbiAgICAgIGxvZ0ZuKGAgICBObyBkYXRhIGZvciB0b2RheSAoJHtuZXcgRGF0ZSgpLnRvTG9jYWxlRGF0ZVN0cmluZygnZW4tR0InKX0pIGluIFwiJHt0YWJOYW1lfVwiIFx1MjAxNCBza2lwcGluZy5gLCAnd2FybmluZycpXHJcbiAgICAgIGNvbnRpbnVlXHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgeyBncm91cE5hbWUsIGFjY291bnRJZHMsIHJlbWFpbmluZyB9ID0gZ3JvdXBEYXRhXHJcbiAgICBjb25zdCBwZXJBY2NvdW50ID0gcmVtYWluaW5nISAvIGFjY291bnRJZHMhLmxlbmd0aFxyXG4gICAgbG9nRm4oXHJcbiAgICAgIGAgICAke2dyb3VwTmFtZX06ICR7YWNjb3VudElkcyEubGVuZ3RofSBhY2NvdW50cywgUmVtYWluaW5nPSQke3JlbWFpbmluZyEudG9GaXhlZCgyKX0sIFBlci1hY2NvdW50PSQke3BlckFjY291bnQudG9GaXhlZCgyKX1gLFxyXG4gICAgKVxyXG5cclxuICAgIGZvciAoY29uc3QgYWNjb3VudElkIG9mIGFjY291bnRJZHMhKSB7XHJcbiAgICAgIGF3YWl0IHNsZWVwKDE1MCArIE1hdGgucmFuZG9tKCkgKiAyNTApXHJcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZiU2VydmljZS5zZXRTcGVuZGluZ0xpbWl0KGFjY291bnRJZCwgcGVyQWNjb3VudCwgY29uZmlnLmZhY2Vib29rQXBpVG9rZW4pXHJcbiAgICAgIGlmIChyZXN1bHQuc3VjY2Vzcykge1xyXG4gICAgICAgIGxvZ0ZuKGAgICBcdTI3MTMgJHthY2NvdW50SWR9IFx1MjE5MiBsaW1pdCBzZXQgdG8gJCR7cGVyQWNjb3VudC50b0ZpeGVkKDIpfWAsICdzdWNjZXNzJylcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBsb2dGbihgICAgXHUyNzE3ICR7YWNjb3VudElkfSBcdTIxOTIgJHtyZXN1bHQuZXJyb3IgPz8gJ3Vua25vd24gZXJyb3InfSAoc2tpcHBpbmcpYCwgJ2Vycm9yJylcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGxvZ0ZuKGBcdTI1MDBcdTI1MDAgR3JvdXAgXCIke2dyb3VwTmFtZX1cIiBjb21wbGV0ZWQuYClcclxuICB9XHJcblxyXG4gIGxvZ0ZuKCdFeGVjdXRpb24gZmluaXNoZWQuJywgJ3N1Y2Nlc3MnKVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJJcGNIYW5kbGVycygpOiB2b2lkIHtcclxuICAvLyBXaXJlIHRoZSBzY2hlZHVsZXIncyBydW4gY2FsbGJhY2sgKHVzZXMgdGhlIHNoYXJlZCBleGVjdXRpb24gbG9vcClcclxuICBzY2hlZHVsZXJTZXJ2aWNlLnNldFJ1bkNhbGxiYWNrKGFzeW5jIChjb25maWcsIGxvZ0ZuKSA9PiB7XHJcbiAgICAvLyBGZXRjaCBhbGwgdGFicywgdGhlbiBmaWx0ZXIgb3V0IHNjaGVkdWxlLWV4Y2x1ZGVkIGdyb3Vwc1xyXG4gICAgY29uc3QgZXhjbHVkZWQgPSBjb25maWcuZXhjbHVkZWRUYWJzXHJcbiAgICAgIC5zcGxpdCgnLCcpXHJcbiAgICAgIC5tYXAoKHQpID0+IHQudHJpbSgpKVxyXG4gICAgICAuZmlsdGVyKEJvb2xlYW4pXHJcbiAgICBhd2FpdCBzaGVldHNTZXJ2aWNlLmF1dGhlbnRpY2F0ZShjb25maWcuc2VydmljZUFjY291bnRQYXRoKVxyXG4gICAgY29uc3QgYWxsVGFicyA9IGF3YWl0IHNoZWV0c1NlcnZpY2UubGlzdFRhYnMoY29uZmlnLmdvb2dsZVNoZWV0SWQsIGV4Y2x1ZGVkKVxyXG4gICAgY29uc3QgdGFiTmFtZXMgPSBhbGxUYWJzLmZpbHRlcigodCkgPT4gIWNvbmZpZy5zY2hlZHVsZUV4Y2x1ZGVkR3JvdXBzLmluY2x1ZGVzKHQpKVxyXG4gICAgbG9nRm4oYFNjaGVkdWxlZCBqb2I6ICR7dGFiTmFtZXMubGVuZ3RofSBncm91cChzKSB0byBwcm9jZXNzICgke2NvbmZpZy5zY2hlZHVsZUV4Y2x1ZGVkR3JvdXBzLmxlbmd0aH0gZXhjbHVkZWQpLmApXHJcbiAgICBhd2FpdCBleGVjdXRlRm9yR3JvdXBzKHRhYk5hbWVzLCBjb25maWcsIGxvZ0ZuKVxyXG4gIH0pXHJcblxyXG4gIC8vIFx1MjUwMFx1MjUwMCBDb25maWcgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHJcbiAgaXBjTWFpbi5oYW5kbGUoJ2NvbmZpZzpsb2FkJywgKCkgPT4gY29uZmlnU2VydmljZS5sb2FkKCkpXHJcblxyXG4gIGlwY01haW4uaGFuZGxlKCdjb25maWc6c2F2ZScsIChfZXZlbnQ6IHVua25vd24sIGNvbmZpZzogUGFyYW1ldGVyczxDb25maWdTZXJ2aWNlWydzYXZlJ10+WzBdKSA9PiB7XHJcbiAgICBjb25maWdTZXJ2aWNlLnNhdmUoY29uZmlnKVxyXG4gICAgLy8gUmVzdGFydCBzY2hlZHVsZXIgd2hlbmV2ZXIgY29uZmlnIGNoYW5nZXMgKGluIGNhc2UgdGltZSAvIGVuYWJsZWQgY2hhbmdlZClcclxuICAgIHNjaGVkdWxlclNlcnZpY2Uuc3RhcnQoY29uZmlnKVxyXG4gIH0pXHJcblxyXG4gIC8vIFx1MjUwMFx1MjUwMCBTaGVldHMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHJcbiAgaXBjTWFpbi5oYW5kbGUoXHJcbiAgICAnc2hlZXRzOmZldGNoJyxcclxuICAgIGFzeW5jIChfZXZlbnQ6IHVua25vd24sIHNoZWV0SWQ6IHN0cmluZywgZXhjbHVkZWRUYWJzU3RyOiBzdHJpbmcpID0+IHtcclxuICAgICAgY29uc3QgY29uZmlnID0gY29uZmlnU2VydmljZS5sb2FkKClcclxuICAgICAgYXdhaXQgc2hlZXRzU2VydmljZS5hdXRoZW50aWNhdGUoY29uZmlnLnNlcnZpY2VBY2NvdW50UGF0aClcclxuICAgICAgY29uc3QgZXhjbHVkZWQgPSBleGNsdWRlZFRhYnNTdHJcclxuICAgICAgICAuc3BsaXQoJywnKVxyXG4gICAgICAgIC5tYXAoKHQpID0+IHQudHJpbSgpKVxyXG4gICAgICAgIC5maWx0ZXIoQm9vbGVhbilcclxuICAgICAgY29uc3QgdGFicyA9IGF3YWl0IHNoZWV0c1NlcnZpY2UubGlzdFRhYnMoc2hlZXRJZCwgZXhjbHVkZWQpXHJcbiAgICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoXHJcbiAgICAgICAgdGFicy5tYXAoKHRhYikgPT4gc2hlZXRzU2VydmljZS5wYXJzZVRhYihzaGVldElkLCB0YWIpKSxcclxuICAgICAgKVxyXG4gICAgICByZXR1cm4gdGFicy5tYXAoKHRhYk5hbWUsIGkpOiBHcm91cERhdGEgPT4ge1xyXG4gICAgICAgIGNvbnN0IHIgPSByZXN1bHRzW2ldXHJcbiAgICAgICAgaWYgKHIuc3RhdHVzID09PSAnZnVsZmlsbGVkJyAmJiByLnZhbHVlICE9PSBudWxsKSByZXR1cm4gci52YWx1ZVxyXG4gICAgICAgIHJldHVybiB7IHRhYk5hbWUsIGdyb3VwTmFtZTogdGFiTmFtZSB9XHJcbiAgICAgIH0pXHJcbiAgICB9LFxyXG4gIClcclxuXHJcbiAgLy8gXHUyNTAwXHUyNTAwIE1hbnVhbCBFeGVjdXRpb24gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHJcbiAgaXBjTWFpbi5oYW5kbGUoJ2V4ZWN1dGlvbjpydW4nLCBhc3luYyAoX2V2ZW50OiB1bmtub3duLCBwYXJhbXM6IEV4ZWN1dGlvblBhcmFtcykgPT4ge1xyXG4gICAgY29uc3QgeyBzZWxlY3RlZEdyb3VwcywgY29uZmlnIH0gPSBwYXJhbXNcclxuICAgIGF3YWl0IGV4ZWN1dGVGb3JHcm91cHMoc2VsZWN0ZWRHcm91cHMsIGNvbmZpZywgKG1zZywgdHlwZSkgPT4gbG9nKG1zZywgdHlwZSkpXHJcbiAgfSlcclxuXHJcbiAgLy8gXHUyNTAwXHUyNTAwIFNjaGVkdWxlIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxyXG4gIGlwY01haW4uaGFuZGxlKCdzY2hlZHVsZTpzdGF0dXMnLCAoKSA9PiBzY2hlZHVsZXJTZXJ2aWNlLmdldFN0YXR1cygpKVxyXG5cclxuICBpcGNNYWluLmhhbmRsZSgnc2NoZWR1bGU6c3RhcnQnLCAoKSA9PiB7XHJcbiAgICBjb25zdCBjb25maWcgPSBjb25maWdTZXJ2aWNlLmxvYWQoKVxyXG4gICAgc2NoZWR1bGVyU2VydmljZS5zdGFydChjb25maWcpXHJcbiAgICByZXR1cm4gc2NoZWR1bGVyU2VydmljZS5nZXRTdGF0dXMoKVxyXG4gIH0pXHJcblxyXG4gIGlwY01haW4uaGFuZGxlKCdzY2hlZHVsZTpzdG9wJywgKCkgPT4ge1xyXG4gICAgc2NoZWR1bGVyU2VydmljZS5zdG9wKClcclxuICAgIHJldHVybiBzY2hlZHVsZXJTZXJ2aWNlLmdldFN0YXR1cygpXHJcbiAgfSlcclxuXHJcbiAgaXBjTWFpbi5oYW5kbGUoJ3NjaGVkdWxlOmxhc3RMb2dzJywgKCkgPT4gc2NoZWR1bGVyU2VydmljZS5nZXRMYXN0TG9ncygpKVxyXG59XHJcblxyXG5mdW5jdGlvbiBzbGVlcChtczogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIG1zKSlcclxufVxyXG5cclxuIiwgImltcG9ydCB7IGdvb2dsZSB9IGZyb20gJ2dvb2dsZWFwaXMnXHJcbmltcG9ydCB7IGZvcm1hdCB9IGZyb20gJ2RhdGUtZm5zJ1xyXG5pbXBvcnQgdHlwZSB7IEdyb3VwRGF0YSB9IGZyb20gJy4uLy4uL3NyYy90eXBlcy9pbmRleCdcclxuXHJcbi8vIENvbHVtbiBtYXBwaW5nIGZvciBBZHNNYW5hZ2VyIHNoZWV0IHRhYnMgKGNvbmZpcm1lZCBhZ2FpbnN0IG1vbm9yZXBvIGNvbnZlbnRpb24pOlxyXG4vLyAgIEIyICAgICAgICA9IGdyb3VwIG5hbWVcclxuLy8gICBDMysgICAgICAgPSBkYXRlcyAoZGQvTU0veXl5eSkgXHUyMDE0IGRhdGVzIGNvbHVtblxyXG4vLyAgIEczKyAgICAgICA9IHJlbWFpbmluZyBiYWxhbmNlIChudW1lcmljL2N1cnJlbmN5KVxyXG4vLyAgIEgzLCBJM1x1MjAyNiA9IGFkIGFjY291bnQgSURzIChob3Jpem9udGFsLCB1bnRpbCBlbXB0eSBjZWxsKVxyXG4vL1xyXG4vLyBOb3RlOiBUaGUgcHJvamVjdCBicmllZiBzdGF0ZWQgXCJzZWFyY2ggQ29sdW1uIEcgZm9yIHRvZGF5J3MgZGF0ZVwiIGJ1dCBjcm9zcy1yZWZlcmVuY2luZ1xyXG4vLyBHT09HTEVfU0hFRVRTX1NUUlVDVFVSRS5tZCBhbmQgZmJfYXV0b19yZXBvcnQgY29udmVudGlvbnMgY29uZmlybXMgQ29sdW1uIEMgaG9sZHMgZGF0ZXNcclxuLy8gYW5kIENvbHVtbiBHIGhvbGRzIHJlbWFpbmluZyBiYWxhbmNlLiBTZWUgZG9jL2ltcGxlbWVudGF0aW9uLXBsYW4ubWQgZm9yIGZ1bGwgcmF0aW9uYWxlLlxyXG5cclxuZXhwb3J0IGNsYXNzIEdvb2dsZVNoZWV0c1NlcnZpY2Uge1xyXG4gIHByaXZhdGUgYXV0aDogSW5zdGFuY2VUeXBlPHR5cGVvZiBnb29nbGUuYXV0aC5Hb29nbGVBdXRoPiB8IG51bGwgPSBudWxsXHJcblxyXG4gIC8qKlxyXG4gICAqIEluaXRpYWxpc2UgYXV0aGVudGljYXRpb24gZnJvbSBhIHNlcnZpY2UgYWNjb3VudCBKU09OIGZpbGUgcGF0aC5cclxuICAgKiBDYWxsZWQgb25jZSB3aGVuIGNyZWRlbnRpYWxzIGFyZSBjb25maWd1cmVkIG9yIGNoYW5nZWQuXHJcbiAgICovXHJcbiAgYXN5bmMgYXV0aGVudGljYXRlKHNlcnZpY2VBY2NvdW50UGF0aDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICB0aGlzLmF1dGggPSBuZXcgZ29vZ2xlLmF1dGguR29vZ2xlQXV0aCh7XHJcbiAgICAgIGtleUZpbGU6IHNlcnZpY2VBY2NvdW50UGF0aCxcclxuICAgICAgc2NvcGVzOiBbJ2h0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL2F1dGgvc3ByZWFkc2hlZXRzLnJlYWRvbmx5J10sXHJcbiAgICB9KVxyXG4gICAgLy8gRWFnZXJseSB2ZXJpZnkgY3JlZGVudGlhbHMgYXJlIHZhbGlkXHJcbiAgICBhd2FpdCB0aGlzLmF1dGguZ2V0Q2xpZW50KClcclxuICB9XHJcblxyXG4gIHByaXZhdGUgZ2V0IHNoZWV0cygpIHtcclxuICAgIGlmICghdGhpcy5hdXRoKSB0aHJvdyBuZXcgRXJyb3IoJ0dvb2dsZVNoZWV0c1NlcnZpY2U6IG5vdCBhdXRoZW50aWNhdGVkLiBDYWxsIGF1dGhlbnRpY2F0ZSgpIGZpcnN0LicpXHJcbiAgICByZXR1cm4gZ29vZ2xlLnNoZWV0cyh7IHZlcnNpb246ICd2NCcsIGF1dGg6IHRoaXMuYXV0aCB9KVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUmV0dXJucyBhbGwgdGFiIG5hbWVzIGZyb20gdGhlIHNwcmVhZHNoZWV0LCBleGNsdWRpbmcgc3lzdGVtIHRhYnMuXHJcbiAgICovXHJcbiAgYXN5bmMgbGlzdFRhYnMoc2hlZXRJZDogc3RyaW5nLCBleGNsdWRlZFRhYnM6IHN0cmluZ1tdKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xyXG4gICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5zaGVldHMuc3ByZWFkc2hlZXRzLmdldCh7IHNwcmVhZHNoZWV0SWQ6IHNoZWV0SWQgfSlcclxuICAgIGNvbnN0IHNoZWV0cyA9IHJlcy5kYXRhLnNoZWV0cyA/PyBbXVxyXG4gICAgcmV0dXJuIHNoZWV0c1xyXG4gICAgICAubWFwKChzKSA9PiBzLnByb3BlcnRpZXM/LnRpdGxlID8/ICcnKVxyXG4gICAgICAuZmlsdGVyKChuYW1lKSA9PiBuYW1lICYmICFleGNsdWRlZFRhYnMuaW5jbHVkZXMobmFtZS50cmltKCkpKVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUGFyc2VzIGEgc2luZ2xlIGN1c3RvbWVyIHRhYiBhbmQgcmV0dXJucyB0b2RheSdzIEdyb3VwRGF0YSwgb3IgbnVsbCBpZjpcclxuICAgKiAtIHRvZGF5J3MgZGF0ZSBpcyBub3QgZm91bmQgaW4gQ29sdW1uIENcclxuICAgKiAtIG5vIGFjY291bnQgSURzIGFyZSBwcmVzZW50IGluIHJvdyAzIChIMyspXHJcbiAgICogLSByZW1haW5pbmcgYmFsYW5jZSBpcyBtaXNzaW5nIG9yIHplcm9cclxuICAgKi9cclxuICBhc3luYyBwYXJzZVRhYihzaGVldElkOiBzdHJpbmcsIHRhYk5hbWU6IHN0cmluZyk6IFByb21pc2U8R3JvdXBEYXRhIHwgbnVsbD4ge1xyXG4gICAgY29uc3QgdG9kYXlTdHIgPSBmb3JtYXQobmV3IERhdGUoKSwgJ2RkL01NL3l5eXknKVxyXG5cclxuICAgIC8vIEJhdGNoIHJlYWQ6IEIyIChncm91cCBuYW1lKSwgQzM6QzMwMCAoZGF0ZXMpLCBHMzpHMzAwIChyZW1haW5pbmcpLCBIMzpaWjMgKGFjY291bnQgSURzKVxyXG4gICAgY29uc3QgcmVzID0gYXdhaXQgdGhpcy5zaGVldHMuc3ByZWFkc2hlZXRzLnZhbHVlcy5iYXRjaEdldCh7XHJcbiAgICAgIHNwcmVhZHNoZWV0SWQ6IHNoZWV0SWQsXHJcbiAgICAgIHJhbmdlczogW1xyXG4gICAgICAgIGAnJHt0YWJOYW1lfSchQjJgLFxyXG4gICAgICAgIGAnJHt0YWJOYW1lfSchQzM6QzMwMGAsXHJcbiAgICAgICAgYCcke3RhYk5hbWV9JyFHMzpHMzAwYCxcclxuICAgICAgICBgJyR7dGFiTmFtZX0nIUgzOlpaM2AsXHJcbiAgICAgIF0sXHJcbiAgICB9KVxyXG5cclxuICAgIGNvbnN0IFtncm91cE5hbWVSYW5nZSwgZGF0ZXNSYW5nZSwgcmVtYWluaW5nUmFuZ2UsIGFjY291bnRJZHNSYW5nZV0gPVxyXG4gICAgICByZXMuZGF0YS52YWx1ZVJhbmdlcyA/PyBbXVxyXG5cclxuICAgIC8vIEdyb3VwIG5hbWUgZnJvbSBCMlxyXG4gICAgY29uc3QgZ3JvdXBOYW1lID0gKGdyb3VwTmFtZVJhbmdlPy52YWx1ZXM/LlswXT8uWzBdIGFzIHN0cmluZyB8IHVuZGVmaW5lZCkgPz8gdGFiTmFtZVxyXG5cclxuICAgIC8vIEFjY291bnQgSURzIGZyb20gcm93IDMsIEggb253YXJkcyBcdTIwMTQgZmlsdGVyIGVtcHR5IGNlbGxzLCBub3JtYWxpc2UgYWN0XyBwcmVmaXhcclxuICAgIGNvbnN0IGFjY291bnRSb3c6IHN0cmluZ1tdID0gKGFjY291bnRJZHNSYW5nZT8udmFsdWVzPy5bMF0gPz8gW10pIGFzIHN0cmluZ1tdXHJcbiAgICBjb25zdCBhY2NvdW50SWRzID0gYWNjb3VudFJvd1xyXG4gICAgICAubWFwKChpZCkgPT4gU3RyaW5nKGlkKS50cmltKCkpXHJcbiAgICAgIC5maWx0ZXIoQm9vbGVhbilcclxuICAgICAgLm1hcCgoaWQpID0+IChpZC5zdGFydHNXaXRoKCdhY3RfJykgPyBpZCA6IGBhY3RfJHtpZH1gKSlcclxuXHJcbiAgICBpZiAoYWNjb3VudElkcy5sZW5ndGggPT09IDApIHJldHVybiBudWxsXHJcblxyXG4gICAgLy8gRmluZCByb3cgaW5kZXggd2hlcmUgQ29sdW1uIEMgbWF0Y2hlcyB0b2RheSdzIGRhdGVcclxuICAgIGNvbnN0IGRhdGVzOiBzdHJpbmdbXSA9IChkYXRlc1JhbmdlPy52YWx1ZXMgPz8gW10pLm1hcCgocm93KSA9PiBTdHJpbmcocm93WzBdID8/ICcnKS50cmltKCkpXHJcbiAgICBjb25zdCByb3dJbmRleCA9IGRhdGVzLmZpbmRJbmRleCgoZCkgPT4gZCA9PT0gdG9kYXlTdHIpXHJcbiAgICBpZiAocm93SW5kZXggPT09IC0xKSByZXR1cm4gbnVsbFxyXG5cclxuICAgIC8vIFJlYWQgQ29sdW1uIEcgYXQgdGhlIHNhbWUgcm93IGluZGV4XHJcbiAgICBjb25zdCByZW1haW5pbmdSYXcgPSAocmVtYWluaW5nUmFuZ2U/LnZhbHVlcz8uW3Jvd0luZGV4XT8uWzBdIGFzIHN0cmluZyB8IHVuZGVmaW5lZCkgPz8gJydcclxuICAgIGlmICghcmVtYWluaW5nUmF3KSByZXR1cm4gbnVsbFxyXG5cclxuICAgIC8vIFBhcnNlIEV1cm9wZWFuIGN1cnJlbmN5IGZvcm1hdCBcdTIwMTQgc3RyaXAgJCBhbmQgd2hpdGVzcGFjZSwgY29udmVydCBjb21tYS9wZXJpb2RcclxuICAgIC8vIGUuZy4gXCIkNS45NDIsNDNcIiBcdTIxOTIgNTk0Mi40MyAgfCAgXCIkMTA0LDQwXCIgXHUyMTkyIDEwNC40MFxyXG4gICAgY29uc3QgY2xlYW5lZCA9IHJlbWFpbmluZ1Jhdy5yZXBsYWNlKC9bXFxzJFx1MjBBQ10vZywgJycpXHJcbiAgICBsZXQgcmVtYWluaW5nOiBudW1iZXJcclxuICAgIGlmICgvXlxcZHsxLDN9KFxcLlxcZHszfSkqKCxcXGQrKT8kLy50ZXN0KGNsZWFuZWQpKSB7XHJcbiAgICAgIC8vIEV1cm9wZWFuIGZvcm1hdDogcGVyaW9kID0gdGhvdXNhbmRzLCBjb21tYSA9IGRlY2ltYWxcclxuICAgICAgcmVtYWluaW5nID0gcGFyc2VGbG9hdChjbGVhbmVkLnJlcGxhY2UoL1xcLi9nLCAnJykucmVwbGFjZSgnLCcsICcuJykpXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICByZW1haW5pbmcgPSBwYXJzZUZsb2F0KGNsZWFuZWQucmVwbGFjZSgvLC9nLCAnJykpXHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGlzTmFOKHJlbWFpbmluZykgfHwgcmVtYWluaW5nIDw9IDApIHJldHVybiBudWxsXHJcblxyXG4gICAgcmV0dXJuIHsgdGFiTmFtZSwgZ3JvdXBOYW1lLCBhY2NvdW50SWRzLCByZW1haW5pbmcsIGRhdGU6IHRvZGF5U3RyIH1cclxuICB9XHJcbn1cclxuIiwgImltcG9ydCBheGlvcyBmcm9tICdheGlvcydcclxuXHJcbmNvbnN0IEZCX0FQSV9WRVJTSU9OID0gJ3YyNC4wJ1xyXG5jb25zdCBGQl9BUElfQkFTRSA9IGBodHRwczovL2dyYXBoLmZhY2Vib29rLmNvbS8ke0ZCX0FQSV9WRVJTSU9OfWBcclxuXHJcbmV4cG9ydCBjbGFzcyBGYWNlYm9va1NlcnZpY2Uge1xyXG4gIC8qKlxyXG4gICAqIFZlcmlmaWVzIGEgdG9rZW4gaXMgdmFsaWQgYnkgY2FsbGluZyAvbWUuXHJcbiAgICogUmV0dXJucyB0aGUgYXBwIHVzZXIgbmFtZSBvbiBzdWNjZXNzLCB0aHJvd3Mgb24gZmFpbHVyZS5cclxuICAgKi9cclxuICBhc3luYyB2YWxpZGF0ZVRva2VuKHRva2VuOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xyXG4gICAgY29uc3QgcmVzID0gYXdhaXQgYXhpb3MuZ2V0PHsgbmFtZTogc3RyaW5nIH0+KGAke0ZCX0FQSV9CQVNFfS9tZWAsIHtcclxuICAgICAgcGFyYW1zOiB7IGFjY2Vzc190b2tlbjogdG9rZW4sIGZpZWxkczogJ25hbWUnIH0sXHJcbiAgICAgIHRpbWVvdXQ6IDEwXzAwMCxcclxuICAgIH0pXHJcbiAgICByZXR1cm4gcmVzLmRhdGEubmFtZVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogU2V0cyB0aGUgc3BlbmQgY2FwIGZvciBhIHNpbmdsZSBhZCBhY2NvdW50LlxyXG4gICAqIFBPU1QgaHR0cHM6Ly9ncmFwaC5mYWNlYm9vay5jb20vdjI0LjAvYWN0X3tpZH0/c3BlbmRfY2FwPXtjZW50c30mYWNjZXNzX3Rva2VuPXt0b2tlbn1cclxuICAgKiBGYWNlYm9vayBBUEkgZXhwZWN0cyB0aGUgYW1vdW50IGluIGNlbnRzIChVU0QgKiAxMDApLlxyXG4gICAqXHJcbiAgICogQHBhcmFtIGFjY291bnRJZCAtIHdpdGggb3Igd2l0aG91dCBcImFjdF9cIiBwcmVmaXg7IHdpbGwgbm9ybWFsaXNlXHJcbiAgICogQHBhcmFtIGRhaWx5QnVkZ2V0VVNEIC0gZG9sbGFyIGFtb3VudCAoZS5nLiAxNTAuNTApXHJcbiAgICogQHBhcmFtIHRva2VuIC0gRmFjZWJvb2sgTWFya2V0aW5nIEFQSSBhY2Nlc3MgdG9rZW5cclxuICAgKi9cclxuICBhc3luYyBzZXRTcGVuZGluZ0xpbWl0KFxyXG4gICAgYWNjb3VudElkOiBzdHJpbmcsXHJcbiAgICBkYWlseUJ1ZGdldFVTRDogbnVtYmVyLFxyXG4gICAgdG9rZW46IHN0cmluZyxcclxuICApOiBQcm9taXNlPHsgc3VjY2VzczogYm9vbGVhbjsgZXJyb3I/OiBzdHJpbmcgfT4ge1xyXG4gICAgLy8gTm9ybWFsaXNlIGFjY291bnQgSURcclxuICAgIGNvbnN0IG5vcm1hbGlzZWQgPSBhY2NvdW50SWQuc3RhcnRzV2l0aCgnYWN0XycpID8gYWNjb3VudElkIDogYGFjdF8ke2FjY291bnRJZH1gXHJcbiAgICAvLyBGQiBBUEkgc3BlbmRfY2FwIGFjY2VwdHMgdGhlIGV4YWN0IGRvbGxhciBhbW91bnQgYXMgYSBmbG9hdCAoZS5nLiA2MjcuNDcpXHJcbiAgICBjb25zdCBzcGVuZENhcCA9IGRhaWx5QnVkZ2V0VVNEXHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgYXdhaXQgYXhpb3MucG9zdChcclxuICAgICAgICBgJHtGQl9BUElfQkFTRX0vJHtub3JtYWxpc2VkfWAsXHJcbiAgICAgICAgbnVsbCxcclxuICAgICAgICB7XHJcbiAgICAgICAgICBwYXJhbXM6IHtcclxuICAgICAgICAgICAgYWNjZXNzX3Rva2VuOiB0b2tlbixcclxuICAgICAgICAgICAgc3BlbmRfY2FwOiBzcGVuZENhcCxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgICB0aW1lb3V0OiAxNV8wMDAsXHJcbiAgICAgICAgfSxcclxuICAgICAgKVxyXG4gICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlIH1cclxuICAgIH0gY2F0Y2ggKGVycjogdW5rbm93bikge1xyXG4gICAgICBjb25zdCBtZXNzYWdlID0gZXh0cmFjdEZiRXJyb3IoZXJyKVxyXG4gICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IG1lc3NhZ2UgfVxyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZXh0cmFjdEZiRXJyb3IoZXJyOiB1bmtub3duKTogc3RyaW5nIHtcclxuICBpZiAoYXhpb3MuaXNBeGlvc0Vycm9yKGVycikpIHtcclxuICAgIGNvbnN0IGRhdGEgPSBlcnIucmVzcG9uc2U/LmRhdGEgYXMgeyBlcnJvcj86IHsgbWVzc2FnZT86IHN0cmluZzsgY29kZT86IG51bWJlciB9IH0gfCB1bmRlZmluZWRcclxuICAgIGlmIChkYXRhPy5lcnJvcj8ubWVzc2FnZSkgcmV0dXJuIGBGQiBBUEkgJHtkYXRhLmVycm9yLmNvZGUgPz8gJyd9OiAke2RhdGEuZXJyb3IubWVzc2FnZX1gXHJcbiAgICBpZiAoZXJyLmNvZGUgPT09ICdFQ09OTkFCT1JURUQnKSByZXR1cm4gJ1JlcXVlc3QgdGltZWQgb3V0J1xyXG4gICAgcmV0dXJuIGVyci5tZXNzYWdlXHJcbiAgfVxyXG4gIGlmIChlcnIgaW5zdGFuY2VvZiBFcnJvcikgcmV0dXJuIGVyci5tZXNzYWdlXHJcbiAgcmV0dXJuIFN0cmluZyhlcnIpXHJcbn1cclxuIiwgImltcG9ydCB7IGFwcCB9IGZyb20gJ2VsZWN0cm9uJ1xyXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcydcclxuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJ1xyXG5pbXBvcnQgdHlwZSB7IEFwcENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi9zcmMvdHlwZXMvaW5kZXgnXHJcblxyXG5jb25zdCBERUZBVUxUX0NPTkZJRzogQXBwQ29uZmlndXJhdGlvbiA9IHtcclxuICBnb29nbGVTaGVldElkOiAnJyxcclxuICBzZXJ2aWNlQWNjb3VudFBhdGg6ICcnLFxyXG4gIGZhY2Vib29rQXBpVG9rZW46ICcnLFxyXG4gIGV4Y2x1ZGVkVGFiczpcclxuICAgICdDb25maWd1cmF0aW9uLCBSQVcgRGF0YSBBZ2dyZWdhdGVkLCBEYXNoYm9hcmQgU3VtbWFyeSwgRGFzaGJvYXJkIFN1bW1hcnkgKFZOXHUwMTEwKSwgQWRzIFJ1bGVzIFN0YXR1cywgVXBkYXRlIE1vbmV5LCBVcGRhdGUgTW9uZXkgMSwgQ3VzdG9tTWVzc2FnZSwgQlx1MUVBM25nIFRcdTFFRDVuZyBIXHUxRUUzcCwgVVNEIG1cdTFFQUJ1JyxcclxuICBzY2hlZHVsZUVuYWJsZWQ6IGZhbHNlLFxyXG4gIHNjaGVkdWxlVGltZTogJzA4OjAwJyxcclxuICBzY2hlZHVsZUV4Y2x1ZGVkR3JvdXBzOiBbXSxcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0Q29uZmlnUGF0aCgpOiBzdHJpbmcge1xyXG4gIHJldHVybiBwYXRoLmpvaW4oYXBwLmdldFBhdGgoJ3VzZXJEYXRhJyksICdjb25maWcuanNvbicpXHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBDb25maWdTZXJ2aWNlIHtcclxuICBsb2FkKCk6IEFwcENvbmZpZ3VyYXRpb24ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgcmF3ID0gZnMucmVhZEZpbGVTeW5jKGdldENvbmZpZ1BhdGgoKSwgJ3V0Zi04JylcclxuICAgICAgcmV0dXJuIHsgLi4uREVGQVVMVF9DT05GSUcsIC4uLkpTT04ucGFyc2UocmF3KSB9XHJcbiAgICB9IGNhdGNoIHtcclxuICAgICAgcmV0dXJuIHsgLi4uREVGQVVMVF9DT05GSUcgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgc2F2ZShjb25maWc6IEFwcENvbmZpZ3VyYXRpb24pOiB2b2lkIHtcclxuICAgIGNvbnN0IGNvbmZpZ1BhdGggPSBnZXRDb25maWdQYXRoKClcclxuICAgIGZzLm1rZGlyU3luYyhwYXRoLmRpcm5hbWUoY29uZmlnUGF0aCksIHsgcmVjdXJzaXZlOiB0cnVlIH0pXHJcbiAgICBmcy53cml0ZUZpbGVTeW5jKGNvbmZpZ1BhdGgsIEpTT04uc3RyaW5naWZ5KGNvbmZpZywgbnVsbCwgMiksICd1dGYtOCcpXHJcbiAgfVxyXG59XHJcbiIsICJpbXBvcnQgeyBCcm93c2VyV2luZG93IH0gZnJvbSAnZWxlY3Ryb24nXHJcbmltcG9ydCB0eXBlIHsgQXBwQ29uZmlndXJhdGlvbiwgTG9nRXZlbnQsIFNjaGVkdWxlU3RhdHVzLCBTY2hlZHVsZVN0YXRlIH0gZnJvbSAnLi4vLi4vc3JjL3R5cGVzL2luZGV4J1xyXG5cclxuLyoqIExhc3QtcnVuIGxvZyByaW5nIGJ1ZmZlciBjYXAgKi9cclxuY29uc3QgTUFYX0xPR19FTlRSSUVTID0gNTAwXHJcblxyXG4vKiogVGhlIGxvZ0ZuIHNpZ25hdHVyZSBtYXRjaGVzIGV4ZWN1dGVGb3JHcm91cHM6IChtZXNzYWdlLCB0eXBlPykgKi9cclxuZXhwb3J0IHR5cGUgU2NoZWR1bGVMb2dGbiA9IChtZXNzYWdlOiBzdHJpbmcsIHR5cGU/OiBMb2dFdmVudFsndHlwZSddKSA9PiB2b2lkXHJcblxyXG4vKiogQ2FsbGJhY2sgaW5qZWN0ZWQgYnkgaXBjSGFuZGxlcnMgdG8gYXZvaWQgY2lyY3VsYXIgaW1wb3J0cyAqL1xyXG5leHBvcnQgdHlwZSBTY2hlZHVsZVJ1bkNhbGxiYWNrID0gKGNvbmZpZzogQXBwQ29uZmlndXJhdGlvbiwgbG9nRm46IFNjaGVkdWxlTG9nRm4pID0+IFByb21pc2U8dm9pZD5cclxuXHJcbmV4cG9ydCBjbGFzcyBTY2hlZHVsZXJTZXJ2aWNlIHtcclxuICBwcml2YXRlIHRpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsXHJcbiAgcHJpdmF0ZSBzdGF0ZTogU2NoZWR1bGVTdGF0ZSA9ICdpZGxlJ1xyXG4gIHByaXZhdGUgbmV4dFJ1bjogc3RyaW5nIHwgdW5kZWZpbmVkXHJcbiAgcHJpdmF0ZSBsYXN0UnVuOiBzdHJpbmcgfCB1bmRlZmluZWRcclxuICBwcml2YXRlIGxhc3RFcnJvcjogc3RyaW5nIHwgdW5kZWZpbmVkXHJcbiAgcHJpdmF0ZSBsYXN0UnVuTG9nczogTG9nRXZlbnRbXSA9IFtdXHJcbiAgcHJpdmF0ZSBydW5DYWxsYmFjazogU2NoZWR1bGVSdW5DYWxsYmFjayB8IG51bGwgPSBudWxsXHJcblxyXG4gIHNldFJ1bkNhbGxiYWNrKGNiOiBTY2hlZHVsZVJ1bkNhbGxiYWNrKTogdm9pZCB7XHJcbiAgICB0aGlzLnJ1bkNhbGxiYWNrID0gY2JcclxuICB9XHJcblxyXG4gIC8vIFx1MjUwMFx1MjUwMCBTdGFydCAvIFN0b3AgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHJcblxyXG4gIHN0YXJ0KGNvbmZpZzogQXBwQ29uZmlndXJhdGlvbik6IHZvaWQge1xyXG4gICAgdGhpcy5zdG9wKClcclxuICAgIGlmICghY29uZmlnLnNjaGVkdWxlRW5hYmxlZCkge1xyXG4gICAgICB0aGlzLnNldFN0YXRlKCdpZGxlJylcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcbiAgICB0aGlzLnNjaGVkdWxlTmV4dChjb25maWcpXHJcbiAgfVxyXG5cclxuICBzdG9wKCk6IHZvaWQge1xyXG4gICAgaWYgKHRoaXMudGltZXIgIT09IG51bGwpIHtcclxuICAgICAgY2xlYXJUaW1lb3V0KHRoaXMudGltZXIpXHJcbiAgICAgIHRoaXMudGltZXIgPSBudWxsXHJcbiAgICB9XHJcbiAgICBpZiAodGhpcy5zdGF0ZSAhPT0gJ3J1bm5pbmcnKSB7XHJcbiAgICAgIHRoaXMuc2V0U3RhdGUoJ2lkbGUnKVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLy8gXHUyNTAwXHUyNTAwIFN0YXR1cyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcclxuXHJcbiAgZ2V0U3RhdHVzKCk6IFNjaGVkdWxlU3RhdHVzIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHN0YXRlOiB0aGlzLnN0YXRlLFxyXG4gICAgICBuZXh0UnVuOiB0aGlzLm5leHRSdW4sXHJcbiAgICAgIGxhc3RSdW46IHRoaXMubGFzdFJ1bixcclxuICAgICAgZXJyb3I6IHRoaXMubGFzdEVycm9yLFxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZ2V0TGFzdExvZ3MoKTogTG9nRXZlbnRbXSB7XHJcbiAgICByZXR1cm4gWy4uLnRoaXMubGFzdFJ1bkxvZ3NdXHJcbiAgfVxyXG5cclxuICAvLyBcdTI1MDBcdTI1MDAgSW50ZXJuYWwgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHJcblxyXG4gIHByaXZhdGUgc2NoZWR1bGVOZXh0KGNvbmZpZzogQXBwQ29uZmlndXJhdGlvbik6IHZvaWQge1xyXG4gICAgY29uc3QgbXNVbnRpbCA9IG1zVW50aWxUaW1lKGNvbmZpZy5zY2hlZHVsZVRpbWUpXHJcbiAgICB0aGlzLm5leHRSdW4gPSBuZXcgRGF0ZShEYXRlLm5vdygpICsgbXNVbnRpbCkudG9JU09TdHJpbmcoKVxyXG4gICAgdGhpcy5zZXRTdGF0ZSgnc2NoZWR1bGVkJylcclxuXHJcbiAgICB0aGlzLnRpbWVyID0gc2V0VGltZW91dChhc3luYyAoKSA9PiB7XHJcbiAgICAgIHRoaXMudGltZXIgPSBudWxsXHJcbiAgICAgIGF3YWl0IHRoaXMudHJpZ2dlcihjb25maWcpXHJcbiAgICAgIC8vIFJlLXNjaGVkdWxlIGZvciB0aGUgbmV4dCBkYXlcclxuICAgICAgdGhpcy5zY2hlZHVsZU5leHQoY29uZmlnKVxyXG4gICAgfSwgbXNVbnRpbClcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXN5bmMgdHJpZ2dlcihjb25maWc6IEFwcENvbmZpZ3VyYXRpb24pOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGlmICghdGhpcy5ydW5DYWxsYmFjaykgcmV0dXJuXHJcblxyXG4gICAgdGhpcy5sYXN0UnVuTG9ncyA9IFtdXHJcbiAgICB0aGlzLnNldFN0YXRlKCdydW5uaW5nJylcclxuICAgIHRoaXMubGFzdEVycm9yID0gdW5kZWZpbmVkXHJcblxyXG4gICAgY29uc3QgbG9nRm46IFNjaGVkdWxlTG9nRm4gPSAobWVzc2FnZSwgdHlwZSA9ICdpbmZvJykgPT4ge1xyXG4gICAgICBjb25zdCBldmVudDogTG9nRXZlbnQgPSB7IG1lc3NhZ2UsIHR5cGUgfVxyXG4gICAgICB0aGlzLmxhc3RSdW5Mb2dzLnB1c2goZXZlbnQpXHJcbiAgICAgIGlmICh0aGlzLmxhc3RSdW5Mb2dzLmxlbmd0aCA+IE1BWF9MT0dfRU5UUklFUykgdGhpcy5sYXN0UnVuTG9ncy5zaGlmdCgpXHJcbiAgICAgIGdldFdpbigpPy53ZWJDb250ZW50cy5zZW5kKCdzY2hlZHVsZTpsb2cnLCBldmVudClcclxuICAgIH1cclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBhd2FpdCB0aGlzLnJ1bkNhbGxiYWNrKGNvbmZpZywgbG9nRm4pXHJcbiAgICAgIHRoaXMubGFzdFJ1biA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxyXG4gICAgICB0aGlzLnNldFN0YXRlKCdjb21wbGV0ZWQnKVxyXG4gICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgIHRoaXMubGFzdFJ1biA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxyXG4gICAgICB0aGlzLmxhc3RFcnJvciA9IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKVxyXG4gICAgICB0aGlzLnNldFN0YXRlKCdlcnJvcicpXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHNldFN0YXRlKHN0YXRlOiBTY2hlZHVsZVN0YXRlKTogdm9pZCB7XHJcbiAgICB0aGlzLnN0YXRlID0gc3RhdGVcclxuICAgIGdldFdpbigpPy53ZWJDb250ZW50cy5zZW5kKCdzY2hlZHVsZTpzdGF0dXMtY2hhbmdlZCcsIHRoaXMuZ2V0U3RhdHVzKCkpXHJcbiAgfVxyXG59XHJcblxyXG4vKiogQ29tcHV0ZSBtaWxsaXNlY29uZHMgdW50aWwgdGhlIG5leHQgb2NjdXJyZW5jZSBvZiBISDptbSAobG9jYWwgdGltZSkgKi9cclxuZnVuY3Rpb24gbXNVbnRpbFRpbWUoaGhtbTogc3RyaW5nKTogbnVtYmVyIHtcclxuICBjb25zdCBbaGgsIG1tXSA9IGhobW0uc3BsaXQoJzonKS5tYXAoTnVtYmVyKVxyXG4gIGNvbnN0IG5vdyA9IG5ldyBEYXRlKClcclxuICBjb25zdCB0YXJnZXQgPSBuZXcgRGF0ZShub3cpXHJcbiAgdGFyZ2V0LnNldEhvdXJzKGhoLCBtbSwgMCwgMClcclxuXHJcbiAgaWYgKHRhcmdldC5nZXRUaW1lKCkgPD0gbm93LmdldFRpbWUoKSkge1xyXG4gICAgdGFyZ2V0LnNldERhdGUodGFyZ2V0LmdldERhdGUoKSArIDEpXHJcbiAgfVxyXG5cclxuICByZXR1cm4gdGFyZ2V0LmdldFRpbWUoKSAtIG5vdy5nZXRUaW1lKClcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0V2luKCk6IEJyb3dzZXJXaW5kb3cgfCBudWxsIHtcclxuICByZXR1cm4gQnJvd3NlcldpbmRvdy5nZXRBbGxXaW5kb3dzKClbMF0gPz8gbnVsbFxyXG59XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLElBQUFBLG1CQUEyRDtBQUMzRCxrQkFBaUI7QUFDakIsc0JBQXlCOzs7QUNGekIsSUFBQUMsbUJBQXVDOzs7QUNBdkMsd0JB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
