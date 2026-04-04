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
var import_electron3 = require("electron");
var import_path = __toESM(require("path"), 1);
var import_promises = require("fs/promises");

// electron/ipcHandlers.ts
var import_electron2 = require("electron");

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
    const spendCap = Math.round(dailyBudgetUSD * 100);
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
  excludedTabs: "Configuration, RAW Data Aggregated, Dashboard Summary, Dashboard Summary (VN\u0110), Ads Rules Status, Update Money, Update Money 1, CustomMessage, B\u1EA3ng T\u1ED5ng H\u1EE3p, USD m\u1EABu"
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

// electron/ipcHandlers.ts
var sheetsService = new GoogleSheetsService();
var fbService = new FacebookService();
var configService = new ConfigService();
function getWin() {
  return import_electron2.BrowserWindow.getAllWindows()[0] ?? null;
}
function sendLog(event) {
  getWin()?.webContents.send("execution:log", event);
}
function log(message, type = "info") {
  sendLog({ message, type });
  console.log(`[${type.toUpperCase()}] ${message}`);
}
function registerIpcHandlers() {
  import_electron2.ipcMain.handle("config:load", () => {
    return configService.load();
  });
  import_electron2.ipcMain.handle("config:save", (_event, config) => {
    configService.save(config);
  });
  import_electron2.ipcMain.handle(
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
  import_electron2.ipcMain.handle("execution:run", async (_event, params) => {
    const { selectedGroups, config } = params;
    log("Pre-flight: validating credentials...");
    try {
      const userName = await fbService.validateToken(config.facebookApiToken);
      log(`Pre-flight: FB token valid (${userName}).`, "success");
    } catch {
      log("Pre-flight failed: Facebook API token is invalid or expired.", "error");
      return;
    }
    try {
      await sheetsService.authenticate(config.serviceAccountPath);
      log("Pre-flight: Google Sheets authenticated.", "success");
    } catch (err) {
      log(`Pre-flight failed: Google Sheets auth error \u2014 ${err instanceof Error ? err.message : String(err)}`, "error");
      return;
    }
    log(`Starting execution for ${selectedGroups.length} group(s)...`);
    for (const tabName of selectedGroups) {
      log(`\u2500\u2500 Group: ${tabName}`);
      let groupData;
      try {
        groupData = await sheetsService.parseTab(config.googleSheetId, tabName);
      } catch (err) {
        log(`   Sheets error for "${tabName}": ${err instanceof Error ? err.message : String(err)}`, "error");
        continue;
      }
      if (!groupData) {
        log(`   No data for today (${(/* @__PURE__ */ new Date()).toLocaleDateString("en-GB")}) in "${tabName}" \u2014 skipping.`, "warning");
        continue;
      }
      const { groupName, accountIds, remaining } = groupData;
      const perAccount = remaining / accountIds.length;
      log(
        `   ${groupName}: ${accountIds.length} accounts, Remaining=$${remaining.toFixed(2)}, Per-account=$${perAccount.toFixed(2)}`
      );
      for (const accountId of accountIds) {
        await sleep(150 + Math.random() * 250);
        const result = await fbService.setSpendingLimit(accountId, perAccount, config.facebookApiToken);
        if (result.success) {
          log(`   \u2713 ${accountId} \u2192 limit set to $${perAccount.toFixed(2)}`, "success");
        } else {
          log(`   \u2717 ${accountId} \u2192 ${result.error ?? "unknown error"} (skipping)`, "error");
        }
      }
      log(`\u2500\u2500 Group "${groupName}" completed.`);
    }
    log("Execution finished.", "success");
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
  win = new import_electron3.BrowserWindow({
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
import_electron3.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    import_electron3.app.quit();
    win = null;
  }
});
import_electron3.app.on("activate", () => {
  if (import_electron3.BrowserWindow.getAllWindows().length === 0) createWindow();
});
import_electron3.ipcMain.handle("dialog:openFile", async () => {
  if (!win) return null;
  const result = await import_electron3.dialog.showOpenDialog(win, {
    title: "Select Google Service Account JSON",
    filters: [{ name: "JSON Files", extensions: ["json"] }],
    properties: ["openFile"]
  });
  return result.canceled ? null : result.filePaths[0];
});
import_electron3.ipcMain.handle("fs:readFile", async (_event, filePath) => {
  if (!filePath.endsWith(".json")) throw new Error("Only .json files are allowed");
  return (0, import_promises.readFile)(filePath, "utf-8");
});
import_electron3.ipcMain.handle("shell:openExternal", (_event, url) => {
  if (/^https:\/\//i.test(url)) import_electron3.shell.openExternal(url);
});
import_electron3.app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vZWxlY3Ryb24vbWFpbi50cyIsICIuLi9lbGVjdHJvbi9pcGNIYW5kbGVycy50cyIsICIuLi9lbGVjdHJvbi9zZXJ2aWNlcy9nb29nbGVTaGVldHNTZXJ2aWNlLnRzIiwgIi4uL2VsZWN0cm9uL3NlcnZpY2VzL2ZhY2Vib29rU2VydmljZS50cyIsICIuLi9lbGVjdHJvbi9zZXJ2aWNlcy9jb25maWdTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyBhcHAsIEJyb3dzZXJXaW5kb3csIGlwY01haW4sIGRpYWxvZywgc2hlbGwgfSBmcm9tICdlbGVjdHJvbidcclxuaW1wb3J0IHBhdGggZnJvbSAncGF0aCdcclxuaW1wb3J0IHsgcmVhZEZpbGUgfSBmcm9tICdmcy9wcm9taXNlcydcclxuaW1wb3J0IHsgcmVnaXN0ZXJJcGNIYW5kbGVycyB9IGZyb20gJy4vaXBjSGFuZGxlcnMnXHJcblxyXG4vLyBJbmplY3RlZCBieSByb2xsdXAgd2hlbiBjb21waWxlZCB0byBDSlNcclxuZGVjbGFyZSBjb25zdCBfX2Rpcm5hbWU6IHN0cmluZ1xyXG5cclxuY29uc3QgVklURV9ERVZfU0VSVkVSX1VSTCA9IHByb2Nlc3MuZW52WydWSVRFX0RFVl9TRVJWRVJfVVJMJ11cclxuLy8gZGlzdC1lbGVjdHJvbi9tYWluLmNqcyBsaXZlcyBpbnNpZGUgZGlzdC1lbGVjdHJvbi87IGRpc3QvIGlzIGEgc2libGluZ1xyXG5jb25zdCBSRU5ERVJFUl9ESVNUID0gcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uJywgJ2Rpc3QnKVxyXG5cclxubGV0IHdpbjogQnJvd3NlcldpbmRvdyB8IG51bGxcclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZVdpbmRvdygpIHtcclxuICB3aW4gPSBuZXcgQnJvd3NlcldpbmRvdyh7XHJcbiAgICB3aWR0aDogOTYwLFxyXG4gICAgaGVpZ2h0OiA3MjAsXHJcbiAgICBtaW5XaWR0aDogNzYwLFxyXG4gICAgbWluSGVpZ2h0OiA1NjAsXHJcbiAgICB0aXRsZTogJ0ZCIEFkcyBMaW1pdCBDb250cm9sbGVyJyxcclxuICAgIHdlYlByZWZlcmVuY2VzOiB7XHJcbiAgICAgIHByZWxvYWQ6IHBhdGguam9pbihfX2Rpcm5hbWUsICdwcmVsb2FkLmNqcycpLFxyXG4gICAgICBjb250ZXh0SXNvbGF0aW9uOiB0cnVlLFxyXG4gICAgICBub2RlSW50ZWdyYXRpb246IGZhbHNlLFxyXG4gICAgfSxcclxuICB9KVxyXG5cclxuICBpZiAoVklURV9ERVZfU0VSVkVSX1VSTCkge1xyXG4gICAgd2luLmxvYWRVUkwoVklURV9ERVZfU0VSVkVSX1VSTClcclxuICAgIHdpbi53ZWJDb250ZW50cy5vcGVuRGV2VG9vbHMoKVxyXG4gIH0gZWxzZSB7XHJcbiAgICB3aW4ubG9hZEZpbGUocGF0aC5qb2luKFJFTkRFUkVSX0RJU1QsICdpbmRleC5odG1sJykpXHJcbiAgfVxyXG59XHJcblxyXG5hcHAub24oJ3dpbmRvdy1hbGwtY2xvc2VkJywgKCkgPT4ge1xyXG4gIGlmIChwcm9jZXNzLnBsYXRmb3JtICE9PSAnZGFyd2luJykge1xyXG4gICAgYXBwLnF1aXQoKVxyXG4gICAgd2luID0gbnVsbFxyXG4gIH1cclxufSlcclxuXHJcbmFwcC5vbignYWN0aXZhdGUnLCAoKSA9PiB7XHJcbiAgaWYgKEJyb3dzZXJXaW5kb3cuZ2V0QWxsV2luZG93cygpLmxlbmd0aCA9PT0gMCkgY3JlYXRlV2luZG93KClcclxufSlcclxuXHJcbi8vIElQQzogbmF0aXZlIGZpbGUgcGlja2VyIFx1MjAxNCByZXN0cmljdGVkIHRvIEpTT04gZmlsZXNcclxuaXBjTWFpbi5oYW5kbGUoJ2RpYWxvZzpvcGVuRmlsZScsIGFzeW5jICgpID0+IHtcclxuICBpZiAoIXdpbikgcmV0dXJuIG51bGxcclxuICBjb25zdCByZXN1bHQgPSBhd2FpdCBkaWFsb2cuc2hvd09wZW5EaWFsb2cod2luLCB7XHJcbiAgICB0aXRsZTogJ1NlbGVjdCBHb29nbGUgU2VydmljZSBBY2NvdW50IEpTT04nLFxyXG4gICAgZmlsdGVyczogW3sgbmFtZTogJ0pTT04gRmlsZXMnLCBleHRlbnNpb25zOiBbJ2pzb24nXSB9XSxcclxuICAgIHByb3BlcnRpZXM6IFsnb3BlbkZpbGUnXSxcclxuICB9KVxyXG4gIHJldHVybiByZXN1bHQuY2FuY2VsZWQgPyBudWxsIDogcmVzdWx0LmZpbGVQYXRoc1swXVxyXG59KVxyXG5cclxuLy8gSVBDOiByZWFkIGZpbGUgZnJvbSBkaXNrIFx1MjAxNCBvbmx5IC5qc29uIGFsbG93ZWRcclxuaXBjTWFpbi5oYW5kbGUoJ2ZzOnJlYWRGaWxlJywgYXN5bmMgKF9ldmVudDogdW5rbm93biwgZmlsZVBhdGg6IHN0cmluZykgPT4ge1xyXG4gIGlmICghZmlsZVBhdGguZW5kc1dpdGgoJy5qc29uJykpIHRocm93IG5ldyBFcnJvcignT25seSAuanNvbiBmaWxlcyBhcmUgYWxsb3dlZCcpXHJcbiAgcmV0dXJuIHJlYWRGaWxlKGZpbGVQYXRoLCAndXRmLTgnKVxyXG59KVxyXG5cclxuLy8gSVBDOiBvcGVuIGV4dGVybmFsIEhUVFBTIFVSTCBpbiBzeXN0ZW0gYnJvd3NlclxyXG5pcGNNYWluLmhhbmRsZSgnc2hlbGw6b3BlbkV4dGVybmFsJywgKF9ldmVudDogdW5rbm93biwgdXJsOiBzdHJpbmcpID0+IHtcclxuICBpZiAoL15odHRwczpcXC9cXC8vaS50ZXN0KHVybCkpIHNoZWxsLm9wZW5FeHRlcm5hbCh1cmwpXHJcbn0pXHJcblxyXG5hcHAud2hlblJlYWR5KCkudGhlbigoKSA9PiB7XHJcbiAgcmVnaXN0ZXJJcGNIYW5kbGVycygpXHJcbiAgY3JlYXRlV2luZG93KClcclxufSlcclxuIiwgImltcG9ydCB7IGlwY01haW4sIEJyb3dzZXJXaW5kb3cgfSBmcm9tICdlbGVjdHJvbidcclxuaW1wb3J0IHsgR29vZ2xlU2hlZXRzU2VydmljZSB9IGZyb20gJy4vc2VydmljZXMvZ29vZ2xlU2hlZXRzU2VydmljZSdcclxuaW1wb3J0IHsgRmFjZWJvb2tTZXJ2aWNlIH0gZnJvbSAnLi9zZXJ2aWNlcy9mYWNlYm9va1NlcnZpY2UnXHJcbmltcG9ydCB7IENvbmZpZ1NlcnZpY2UgfSBmcm9tICcuL3NlcnZpY2VzL2NvbmZpZ1NlcnZpY2UnXHJcbmltcG9ydCB0eXBlIHsgRXhlY3V0aW9uUGFyYW1zLCBMb2dFdmVudCwgR3JvdXBEYXRhIH0gZnJvbSAnLi4vc3JjL3R5cGVzL2luZGV4J1xyXG5cclxuY29uc3Qgc2hlZXRzU2VydmljZSA9IG5ldyBHb29nbGVTaGVldHNTZXJ2aWNlKClcclxuY29uc3QgZmJTZXJ2aWNlID0gbmV3IEZhY2Vib29rU2VydmljZSgpXHJcbmNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBuZXcgQ29uZmlnU2VydmljZSgpXHJcblxyXG5mdW5jdGlvbiBnZXRXaW4oKTogQnJvd3NlcldpbmRvdyB8IG51bGwge1xyXG4gIHJldHVybiBCcm93c2VyV2luZG93LmdldEFsbFdpbmRvd3MoKVswXSA/PyBudWxsXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNlbmRMb2coZXZlbnQ6IExvZ0V2ZW50KTogdm9pZCB7XHJcbiAgZ2V0V2luKCk/LndlYkNvbnRlbnRzLnNlbmQoJ2V4ZWN1dGlvbjpsb2cnLCBldmVudClcclxufVxyXG5cclxuZnVuY3Rpb24gbG9nKG1lc3NhZ2U6IHN0cmluZywgdHlwZTogTG9nRXZlbnRbJ3R5cGUnXSA9ICdpbmZvJyk6IHZvaWQge1xyXG4gIHNlbmRMb2coeyBtZXNzYWdlLCB0eXBlIH0pXHJcbiAgY29uc29sZS5sb2coYFske3R5cGUudG9VcHBlckNhc2UoKX1dICR7bWVzc2FnZX1gKVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJJcGNIYW5kbGVycygpOiB2b2lkIHtcclxuICAvLyBcdTI1MDBcdTI1MDAgQ29uZmlnIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxyXG4gIGlwY01haW4uaGFuZGxlKCdjb25maWc6bG9hZCcsICgpID0+IHtcclxuICAgIHJldHVybiBjb25maWdTZXJ2aWNlLmxvYWQoKVxyXG4gIH0pXHJcblxyXG4gIGlwY01haW4uaGFuZGxlKCdjb25maWc6c2F2ZScsIChfZXZlbnQ6IHVua25vd24sIGNvbmZpZzogUGFyYW1ldGVyczxDb25maWdTZXJ2aWNlWydzYXZlJ10+WzBdKSA9PiB7XHJcbiAgICBjb25maWdTZXJ2aWNlLnNhdmUoY29uZmlnKVxyXG4gIH0pXHJcblxyXG4gIC8vIFx1MjUwMFx1MjUwMCBTaGVldHMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHJcbiAgaXBjTWFpbi5oYW5kbGUoXHJcbiAgICAnc2hlZXRzOmZldGNoJyxcclxuICAgIGFzeW5jIChfZXZlbnQ6IHVua25vd24sIHNoZWV0SWQ6IHN0cmluZywgZXhjbHVkZWRUYWJzU3RyOiBzdHJpbmcpID0+IHtcclxuICAgICAgY29uc3QgY29uZmlnID0gY29uZmlnU2VydmljZS5sb2FkKClcclxuICAgICAgYXdhaXQgc2hlZXRzU2VydmljZS5hdXRoZW50aWNhdGUoY29uZmlnLnNlcnZpY2VBY2NvdW50UGF0aClcclxuICAgICAgY29uc3QgZXhjbHVkZWQgPSBleGNsdWRlZFRhYnNTdHJcclxuICAgICAgICAuc3BsaXQoJywnKVxyXG4gICAgICAgIC5tYXAoKHQpID0+IHQudHJpbSgpKVxyXG4gICAgICAgIC5maWx0ZXIoQm9vbGVhbilcclxuICAgICAgY29uc3QgdGFicyA9IGF3YWl0IHNoZWV0c1NlcnZpY2UubGlzdFRhYnMoc2hlZXRJZCwgZXhjbHVkZWQpXHJcbiAgICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoXHJcbiAgICAgICAgdGFicy5tYXAoKHRhYikgPT4gc2hlZXRzU2VydmljZS5wYXJzZVRhYihzaGVldElkLCB0YWIpKSxcclxuICAgICAgKVxyXG4gICAgICAvLyBSZXR1cm4gQUxMIHRhYnMgXHUyMDE0IGdyb3VwcyB3aXRob3V0IHRvZGF5J3MgZGF0YSBhcHBlYXIgd2l0aG91dCByZW1haW5pbmcvYWNjb3VudElkc1xyXG4gICAgICByZXR1cm4gdGFicy5tYXAoKHRhYk5hbWUsIGkpOiBHcm91cERhdGEgPT4ge1xyXG4gICAgICAgIGNvbnN0IHIgPSByZXN1bHRzW2ldXHJcbiAgICAgICAgaWYgKHIuc3RhdHVzID09PSAnZnVsZmlsbGVkJyAmJiByLnZhbHVlICE9PSBudWxsKSByZXR1cm4gci52YWx1ZVxyXG4gICAgICAgIHJldHVybiB7IHRhYk5hbWUsIGdyb3VwTmFtZTogdGFiTmFtZSB9XHJcbiAgICAgIH0pXHJcbiAgICB9LFxyXG4gIClcclxuXHJcbiAgLy8gXHUyNTAwXHUyNTAwIEV4ZWN1dGlvbiBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcclxuICBpcGNNYWluLmhhbmRsZSgnZXhlY3V0aW9uOnJ1bicsIGFzeW5jIChfZXZlbnQ6IHVua25vd24sIHBhcmFtczogRXhlY3V0aW9uUGFyYW1zKSA9PiB7XHJcbiAgICBjb25zdCB7IHNlbGVjdGVkR3JvdXBzLCBjb25maWcgfSA9IHBhcmFtc1xyXG5cclxuICAgIGxvZygnUHJlLWZsaWdodDogdmFsaWRhdGluZyBjcmVkZW50aWFscy4uLicpXHJcblxyXG4gICAgLy8gVmFsaWRhdGUgdG9rZW4gYmVmb3JlIHN0YXJ0aW5nXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCB1c2VyTmFtZSA9IGF3YWl0IGZiU2VydmljZS52YWxpZGF0ZVRva2VuKGNvbmZpZy5mYWNlYm9va0FwaVRva2VuKVxyXG4gICAgICBsb2coYFByZS1mbGlnaHQ6IEZCIHRva2VuIHZhbGlkICgke3VzZXJOYW1lfSkuYCwgJ3N1Y2Nlc3MnKVxyXG4gICAgfSBjYXRjaCB7XHJcbiAgICAgIGxvZygnUHJlLWZsaWdodCBmYWlsZWQ6IEZhY2Vib29rIEFQSSB0b2tlbiBpcyBpbnZhbGlkIG9yIGV4cGlyZWQuJywgJ2Vycm9yJylcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcblxyXG4gICAgLy8gQXV0aGVudGljYXRlIFNoZWV0c1xyXG4gICAgdHJ5IHtcclxuICAgICAgYXdhaXQgc2hlZXRzU2VydmljZS5hdXRoZW50aWNhdGUoY29uZmlnLnNlcnZpY2VBY2NvdW50UGF0aClcclxuICAgICAgbG9nKCdQcmUtZmxpZ2h0OiBHb29nbGUgU2hlZXRzIGF1dGhlbnRpY2F0ZWQuJywgJ3N1Y2Nlc3MnKVxyXG4gICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgIGxvZyhgUHJlLWZsaWdodCBmYWlsZWQ6IEdvb2dsZSBTaGVldHMgYXV0aCBlcnJvciBcdTIwMTQgJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCwgJ2Vycm9yJylcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcblxyXG4gICAgbG9nKGBTdGFydGluZyBleGVjdXRpb24gZm9yICR7c2VsZWN0ZWRHcm91cHMubGVuZ3RofSBncm91cChzKS4uLmApXHJcblxyXG4gICAgZm9yIChjb25zdCB0YWJOYW1lIG9mIHNlbGVjdGVkR3JvdXBzKSB7XHJcbiAgICAgIGxvZyhgXHUyNTAwXHUyNTAwIEdyb3VwOiAke3RhYk5hbWV9YClcclxuXHJcbiAgICAgIC8vIFBhcnNlIHRvZGF5J3MgZGF0YSBmcm9tIHRoaXMgdGFiXHJcbiAgICAgIGxldCBncm91cERhdGFcclxuICAgICAgdHJ5IHtcclxuICAgICAgICBncm91cERhdGEgPSBhd2FpdCBzaGVldHNTZXJ2aWNlLnBhcnNlVGFiKGNvbmZpZy5nb29nbGVTaGVldElkLCB0YWJOYW1lKVxyXG4gICAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgICBsb2coYCAgIFNoZWV0cyBlcnJvciBmb3IgXCIke3RhYk5hbWV9XCI6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWAsICdlcnJvcicpXHJcbiAgICAgICAgY29udGludWVcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKCFncm91cERhdGEpIHtcclxuICAgICAgICBsb2coYCAgIE5vIGRhdGEgZm9yIHRvZGF5ICgke25ldyBEYXRlKCkudG9Mb2NhbGVEYXRlU3RyaW5nKCdlbi1HQicpfSkgaW4gXCIke3RhYk5hbWV9XCIgXHUyMDE0IHNraXBwaW5nLmAsICd3YXJuaW5nJylcclxuICAgICAgICBjb250aW51ZVxyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCB7IGdyb3VwTmFtZSwgYWNjb3VudElkcywgcmVtYWluaW5nIH0gPSBncm91cERhdGFcclxuICAgICAgY29uc3QgcGVyQWNjb3VudCA9IHJlbWFpbmluZyAvIGFjY291bnRJZHMubGVuZ3RoXHJcbiAgICAgIGxvZyhcclxuICAgICAgICBgICAgJHtncm91cE5hbWV9OiAke2FjY291bnRJZHMubGVuZ3RofSBhY2NvdW50cywgUmVtYWluaW5nPSQke3JlbWFpbmluZy50b0ZpeGVkKDIpfSwgUGVyLWFjY291bnQ9JCR7cGVyQWNjb3VudC50b0ZpeGVkKDIpfWAsXHJcbiAgICAgIClcclxuXHJcbiAgICAgIGZvciAoY29uc3QgYWNjb3VudElkIG9mIGFjY291bnRJZHMpIHtcclxuICAgICAgICAvLyBSYXRlIGxpbWl0IG1pdGlnYXRpb246IDE1MFx1MjAxMzQwMG1zIGJldHdlZW4gY2FsbHNcclxuICAgICAgICBhd2FpdCBzbGVlcCgxNTAgKyBNYXRoLnJhbmRvbSgpICogMjUwKVxyXG5cclxuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBmYlNlcnZpY2Uuc2V0U3BlbmRpbmdMaW1pdChhY2NvdW50SWQsIHBlckFjY291bnQsIGNvbmZpZy5mYWNlYm9va0FwaVRva2VuKVxyXG5cclxuICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcclxuICAgICAgICAgIGxvZyhgICAgXHUyNzEzICR7YWNjb3VudElkfSBcdTIxOTIgbGltaXQgc2V0IHRvICQke3BlckFjY291bnQudG9GaXhlZCgyKX1gLCAnc3VjY2VzcycpXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGxvZyhgICAgXHUyNzE3ICR7YWNjb3VudElkfSBcdTIxOTIgJHtyZXN1bHQuZXJyb3IgPz8gJ3Vua25vd24gZXJyb3InfSAoc2tpcHBpbmcpYCwgJ2Vycm9yJylcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGxvZyhgXHUyNTAwXHUyNTAwIEdyb3VwIFwiJHtncm91cE5hbWV9XCIgY29tcGxldGVkLmApXHJcbiAgICB9XHJcblxyXG4gICAgbG9nKCdFeGVjdXRpb24gZmluaXNoZWQuJywgJ3N1Y2Nlc3MnKVxyXG4gIH0pXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNsZWVwKG1zOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcclxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgbXMpKVxyXG59XHJcbiIsICJpbXBvcnQgeyBnb29nbGUgfSBmcm9tICdnb29nbGVhcGlzJ1xyXG5pbXBvcnQgeyBmb3JtYXQgfSBmcm9tICdkYXRlLWZucydcclxuaW1wb3J0IHR5cGUgeyBHcm91cERhdGEgfSBmcm9tICcuLi8uLi9zcmMvdHlwZXMvaW5kZXgnXHJcblxyXG4vLyBDb2x1bW4gbWFwcGluZyBmb3IgQWRzTWFuYWdlciBzaGVldCB0YWJzIChjb25maXJtZWQgYWdhaW5zdCBtb25vcmVwbyBjb252ZW50aW9uKTpcclxuLy8gICBCMiAgICAgICAgPSBncm91cCBuYW1lXHJcbi8vICAgQzMrICAgICAgID0gZGF0ZXMgKGRkL01NL3l5eXkpIFx1MjAxNCBkYXRlcyBjb2x1bW5cclxuLy8gICBHMysgICAgICAgPSByZW1haW5pbmcgYmFsYW5jZSAobnVtZXJpYy9jdXJyZW5jeSlcclxuLy8gICBIMywgSTNcdTIwMjYgPSBhZCBhY2NvdW50IElEcyAoaG9yaXpvbnRhbCwgdW50aWwgZW1wdHkgY2VsbClcclxuLy9cclxuLy8gTm90ZTogVGhlIHByb2plY3QgYnJpZWYgc3RhdGVkIFwic2VhcmNoIENvbHVtbiBHIGZvciB0b2RheSdzIGRhdGVcIiBidXQgY3Jvc3MtcmVmZXJlbmNpbmdcclxuLy8gR09PR0xFX1NIRUVUU19TVFJVQ1RVUkUubWQgYW5kIGZiX2F1dG9fcmVwb3J0IGNvbnZlbnRpb25zIGNvbmZpcm1zIENvbHVtbiBDIGhvbGRzIGRhdGVzXHJcbi8vIGFuZCBDb2x1bW4gRyBob2xkcyByZW1haW5pbmcgYmFsYW5jZS4gU2VlIGRvYy9pbXBsZW1lbnRhdGlvbi1wbGFuLm1kIGZvciBmdWxsIHJhdGlvbmFsZS5cclxuXHJcbmV4cG9ydCBjbGFzcyBHb29nbGVTaGVldHNTZXJ2aWNlIHtcclxuICBwcml2YXRlIGF1dGg6IEluc3RhbmNlVHlwZTx0eXBlb2YgZ29vZ2xlLmF1dGguR29vZ2xlQXV0aD4gfCBudWxsID0gbnVsbFxyXG5cclxuICAvKipcclxuICAgKiBJbml0aWFsaXNlIGF1dGhlbnRpY2F0aW9uIGZyb20gYSBzZXJ2aWNlIGFjY291bnQgSlNPTiBmaWxlIHBhdGguXHJcbiAgICogQ2FsbGVkIG9uY2Ugd2hlbiBjcmVkZW50aWFscyBhcmUgY29uZmlndXJlZCBvciBjaGFuZ2VkLlxyXG4gICAqL1xyXG4gIGFzeW5jIGF1dGhlbnRpY2F0ZShzZXJ2aWNlQWNjb3VudFBhdGg6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgdGhpcy5hdXRoID0gbmV3IGdvb2dsZS5hdXRoLkdvb2dsZUF1dGgoe1xyXG4gICAgICBrZXlGaWxlOiBzZXJ2aWNlQWNjb3VudFBhdGgsXHJcbiAgICAgIHNjb3BlczogWydodHRwczovL3d3dy5nb29nbGVhcGlzLmNvbS9hdXRoL3NwcmVhZHNoZWV0cy5yZWFkb25seSddLFxyXG4gICAgfSlcclxuICAgIC8vIEVhZ2VybHkgdmVyaWZ5IGNyZWRlbnRpYWxzIGFyZSB2YWxpZFxyXG4gICAgYXdhaXQgdGhpcy5hdXRoLmdldENsaWVudCgpXHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGdldCBzaGVldHMoKSB7XHJcbiAgICBpZiAoIXRoaXMuYXV0aCkgdGhyb3cgbmV3IEVycm9yKCdHb29nbGVTaGVldHNTZXJ2aWNlOiBub3QgYXV0aGVudGljYXRlZC4gQ2FsbCBhdXRoZW50aWNhdGUoKSBmaXJzdC4nKVxyXG4gICAgcmV0dXJuIGdvb2dsZS5zaGVldHMoeyB2ZXJzaW9uOiAndjQnLCBhdXRoOiB0aGlzLmF1dGggfSlcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFJldHVybnMgYWxsIHRhYiBuYW1lcyBmcm9tIHRoZSBzcHJlYWRzaGVldCwgZXhjbHVkaW5nIHN5c3RlbSB0YWJzLlxyXG4gICAqL1xyXG4gIGFzeW5jIGxpc3RUYWJzKHNoZWV0SWQ6IHN0cmluZywgZXhjbHVkZWRUYWJzOiBzdHJpbmdbXSk6IFByb21pc2U8c3RyaW5nW10+IHtcclxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMuc2hlZXRzLnNwcmVhZHNoZWV0cy5nZXQoeyBzcHJlYWRzaGVldElkOiBzaGVldElkIH0pXHJcbiAgICBjb25zdCBzaGVldHMgPSByZXMuZGF0YS5zaGVldHMgPz8gW11cclxuICAgIHJldHVybiBzaGVldHNcclxuICAgICAgLm1hcCgocykgPT4gcy5wcm9wZXJ0aWVzPy50aXRsZSA/PyAnJylcclxuICAgICAgLmZpbHRlcigobmFtZSkgPT4gbmFtZSAmJiAhZXhjbHVkZWRUYWJzLmluY2x1ZGVzKG5hbWUudHJpbSgpKSlcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFBhcnNlcyBhIHNpbmdsZSBjdXN0b21lciB0YWIgYW5kIHJldHVybnMgdG9kYXkncyBHcm91cERhdGEsIG9yIG51bGwgaWY6XHJcbiAgICogLSB0b2RheSdzIGRhdGUgaXMgbm90IGZvdW5kIGluIENvbHVtbiBDXHJcbiAgICogLSBubyBhY2NvdW50IElEcyBhcmUgcHJlc2VudCBpbiByb3cgMyAoSDMrKVxyXG4gICAqIC0gcmVtYWluaW5nIGJhbGFuY2UgaXMgbWlzc2luZyBvciB6ZXJvXHJcbiAgICovXHJcbiAgYXN5bmMgcGFyc2VUYWIoc2hlZXRJZDogc3RyaW5nLCB0YWJOYW1lOiBzdHJpbmcpOiBQcm9taXNlPEdyb3VwRGF0YSB8IG51bGw+IHtcclxuICAgIGNvbnN0IHRvZGF5U3RyID0gZm9ybWF0KG5ldyBEYXRlKCksICdkZC9NTS95eXl5JylcclxuXHJcbiAgICAvLyBCYXRjaCByZWFkOiBCMiAoZ3JvdXAgbmFtZSksIEMzOkMzMDAgKGRhdGVzKSwgRzM6RzMwMCAocmVtYWluaW5nKSwgSDM6WlozIChhY2NvdW50IElEcylcclxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMuc2hlZXRzLnNwcmVhZHNoZWV0cy52YWx1ZXMuYmF0Y2hHZXQoe1xyXG4gICAgICBzcHJlYWRzaGVldElkOiBzaGVldElkLFxyXG4gICAgICByYW5nZXM6IFtcclxuICAgICAgICBgJyR7dGFiTmFtZX0nIUIyYCxcclxuICAgICAgICBgJyR7dGFiTmFtZX0nIUMzOkMzMDBgLFxyXG4gICAgICAgIGAnJHt0YWJOYW1lfSchRzM6RzMwMGAsXHJcbiAgICAgICAgYCcke3RhYk5hbWV9JyFIMzpaWjNgLFxyXG4gICAgICBdLFxyXG4gICAgfSlcclxuXHJcbiAgICBjb25zdCBbZ3JvdXBOYW1lUmFuZ2UsIGRhdGVzUmFuZ2UsIHJlbWFpbmluZ1JhbmdlLCBhY2NvdW50SWRzUmFuZ2VdID1cclxuICAgICAgcmVzLmRhdGEudmFsdWVSYW5nZXMgPz8gW11cclxuXHJcbiAgICAvLyBHcm91cCBuYW1lIGZyb20gQjJcclxuICAgIGNvbnN0IGdyb3VwTmFtZSA9IChncm91cE5hbWVSYW5nZT8udmFsdWVzPy5bMF0/LlswXSBhcyBzdHJpbmcgfCB1bmRlZmluZWQpID8/IHRhYk5hbWVcclxuXHJcbiAgICAvLyBBY2NvdW50IElEcyBmcm9tIHJvdyAzLCBIIG9ud2FyZHMgXHUyMDE0IGZpbHRlciBlbXB0eSBjZWxscywgbm9ybWFsaXNlIGFjdF8gcHJlZml4XHJcbiAgICBjb25zdCBhY2NvdW50Um93OiBzdHJpbmdbXSA9IChhY2NvdW50SWRzUmFuZ2U/LnZhbHVlcz8uWzBdID8/IFtdKSBhcyBzdHJpbmdbXVxyXG4gICAgY29uc3QgYWNjb3VudElkcyA9IGFjY291bnRSb3dcclxuICAgICAgLm1hcCgoaWQpID0+IFN0cmluZyhpZCkudHJpbSgpKVxyXG4gICAgICAuZmlsdGVyKEJvb2xlYW4pXHJcbiAgICAgIC5tYXAoKGlkKSA9PiAoaWQuc3RhcnRzV2l0aCgnYWN0XycpID8gaWQgOiBgYWN0XyR7aWR9YCkpXHJcblxyXG4gICAgaWYgKGFjY291bnRJZHMubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbFxyXG5cclxuICAgIC8vIEZpbmQgcm93IGluZGV4IHdoZXJlIENvbHVtbiBDIG1hdGNoZXMgdG9kYXkncyBkYXRlXHJcbiAgICBjb25zdCBkYXRlczogc3RyaW5nW10gPSAoZGF0ZXNSYW5nZT8udmFsdWVzID8/IFtdKS5tYXAoKHJvdykgPT4gU3RyaW5nKHJvd1swXSA/PyAnJykudHJpbSgpKVxyXG4gICAgY29uc3Qgcm93SW5kZXggPSBkYXRlcy5maW5kSW5kZXgoKGQpID0+IGQgPT09IHRvZGF5U3RyKVxyXG4gICAgaWYgKHJvd0luZGV4ID09PSAtMSkgcmV0dXJuIG51bGxcclxuXHJcbiAgICAvLyBSZWFkIENvbHVtbiBHIGF0IHRoZSBzYW1lIHJvdyBpbmRleFxyXG4gICAgY29uc3QgcmVtYWluaW5nUmF3ID0gKHJlbWFpbmluZ1JhbmdlPy52YWx1ZXM/Lltyb3dJbmRleF0/LlswXSBhcyBzdHJpbmcgfCB1bmRlZmluZWQpID8/ICcnXHJcbiAgICBpZiAoIXJlbWFpbmluZ1JhdykgcmV0dXJuIG51bGxcclxuXHJcbiAgICAvLyBQYXJzZSBFdXJvcGVhbiBjdXJyZW5jeSBmb3JtYXQgXHUyMDE0IHN0cmlwICQgYW5kIHdoaXRlc3BhY2UsIGNvbnZlcnQgY29tbWEvcGVyaW9kXHJcbiAgICAvLyBlLmcuIFwiJDUuOTQyLDQzXCIgXHUyMTkyIDU5NDIuNDMgIHwgIFwiJDEwNCw0MFwiIFx1MjE5MiAxMDQuNDBcclxuICAgIGNvbnN0IGNsZWFuZWQgPSByZW1haW5pbmdSYXcucmVwbGFjZSgvW1xccyRcdTIwQUNdL2csICcnKVxyXG4gICAgbGV0IHJlbWFpbmluZzogbnVtYmVyXHJcbiAgICBpZiAoL15cXGR7MSwzfShcXC5cXGR7M30pKigsXFxkKyk/JC8udGVzdChjbGVhbmVkKSkge1xyXG4gICAgICAvLyBFdXJvcGVhbiBmb3JtYXQ6IHBlcmlvZCA9IHRob3VzYW5kcywgY29tbWEgPSBkZWNpbWFsXHJcbiAgICAgIHJlbWFpbmluZyA9IHBhcnNlRmxvYXQoY2xlYW5lZC5yZXBsYWNlKC9cXC4vZywgJycpLnJlcGxhY2UoJywnLCAnLicpKVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgcmVtYWluaW5nID0gcGFyc2VGbG9hdChjbGVhbmVkLnJlcGxhY2UoLywvZywgJycpKVxyXG4gICAgfVxyXG5cclxuICAgIGlmIChpc05hTihyZW1haW5pbmcpIHx8IHJlbWFpbmluZyA8PSAwKSByZXR1cm4gbnVsbFxyXG5cclxuICAgIHJldHVybiB7IHRhYk5hbWUsIGdyb3VwTmFtZSwgYWNjb3VudElkcywgcmVtYWluaW5nLCBkYXRlOiB0b2RheVN0ciB9XHJcbiAgfVxyXG59XHJcbiIsICJpbXBvcnQgYXhpb3MgZnJvbSAnYXhpb3MnXHJcblxyXG5jb25zdCBGQl9BUElfVkVSU0lPTiA9ICd2MjQuMCdcclxuY29uc3QgRkJfQVBJX0JBU0UgPSBgaHR0cHM6Ly9ncmFwaC5mYWNlYm9vay5jb20vJHtGQl9BUElfVkVSU0lPTn1gXHJcblxyXG5leHBvcnQgY2xhc3MgRmFjZWJvb2tTZXJ2aWNlIHtcclxuICAvKipcclxuICAgKiBWZXJpZmllcyBhIHRva2VuIGlzIHZhbGlkIGJ5IGNhbGxpbmcgL21lLlxyXG4gICAqIFJldHVybnMgdGhlIGFwcCB1c2VyIG5hbWUgb24gc3VjY2VzcywgdGhyb3dzIG9uIGZhaWx1cmUuXHJcbiAgICovXHJcbiAgYXN5bmMgdmFsaWRhdGVUb2tlbih0b2tlbjogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcclxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IGF4aW9zLmdldDx7IG5hbWU6IHN0cmluZyB9PihgJHtGQl9BUElfQkFTRX0vbWVgLCB7XHJcbiAgICAgIHBhcmFtczogeyBhY2Nlc3NfdG9rZW46IHRva2VuLCBmaWVsZHM6ICduYW1lJyB9LFxyXG4gICAgICB0aW1lb3V0OiAxMF8wMDAsXHJcbiAgICB9KVxyXG4gICAgcmV0dXJuIHJlcy5kYXRhLm5hbWVcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFNldHMgdGhlIHNwZW5kIGNhcCBmb3IgYSBzaW5nbGUgYWQgYWNjb3VudC5cclxuICAgKiBQT1NUIGh0dHBzOi8vZ3JhcGguZmFjZWJvb2suY29tL3YyNC4wL2FjdF97aWR9P3NwZW5kX2NhcD17Y2VudHN9JmFjY2Vzc190b2tlbj17dG9rZW59XHJcbiAgICogRmFjZWJvb2sgQVBJIGV4cGVjdHMgdGhlIGFtb3VudCBpbiBjZW50cyAoVVNEICogMTAwKS5cclxuICAgKlxyXG4gICAqIEBwYXJhbSBhY2NvdW50SWQgLSB3aXRoIG9yIHdpdGhvdXQgXCJhY3RfXCIgcHJlZml4OyB3aWxsIG5vcm1hbGlzZVxyXG4gICAqIEBwYXJhbSBkYWlseUJ1ZGdldFVTRCAtIGRvbGxhciBhbW91bnQgKGUuZy4gMTUwLjUwKVxyXG4gICAqIEBwYXJhbSB0b2tlbiAtIEZhY2Vib29rIE1hcmtldGluZyBBUEkgYWNjZXNzIHRva2VuXHJcbiAgICovXHJcbiAgYXN5bmMgc2V0U3BlbmRpbmdMaW1pdChcclxuICAgIGFjY291bnRJZDogc3RyaW5nLFxyXG4gICAgZGFpbHlCdWRnZXRVU0Q6IG51bWJlcixcclxuICAgIHRva2VuOiBzdHJpbmcsXHJcbiAgKTogUHJvbWlzZTx7IHN1Y2Nlc3M6IGJvb2xlYW47IGVycm9yPzogc3RyaW5nIH0+IHtcclxuICAgIC8vIE5vcm1hbGlzZSBhY2NvdW50IElEXHJcbiAgICBjb25zdCBub3JtYWxpc2VkID0gYWNjb3VudElkLnN0YXJ0c1dpdGgoJ2FjdF8nKSA/IGFjY291bnRJZCA6IGBhY3RfJHthY2NvdW50SWR9YFxyXG4gICAgLy8gRkIgQVBJIHVzZXMgd2hvbGUgY2VudHNcclxuICAgIGNvbnN0IHNwZW5kQ2FwID0gTWF0aC5yb3VuZChkYWlseUJ1ZGdldFVTRCAqIDEwMClcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBhd2FpdCBheGlvcy5wb3N0KFxyXG4gICAgICAgIGAke0ZCX0FQSV9CQVNFfS8ke25vcm1hbGlzZWR9YCxcclxuICAgICAgICBudWxsLFxyXG4gICAgICAgIHtcclxuICAgICAgICAgIHBhcmFtczoge1xyXG4gICAgICAgICAgICBhY2Nlc3NfdG9rZW46IHRva2VuLFxyXG4gICAgICAgICAgICBzcGVuZF9jYXA6IHNwZW5kQ2FwLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIHRpbWVvdXQ6IDE1XzAwMCxcclxuICAgICAgICB9LFxyXG4gICAgICApXHJcbiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUgfVxyXG4gICAgfSBjYXRjaCAoZXJyOiB1bmtub3duKSB7XHJcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBleHRyYWN0RmJFcnJvcihlcnIpXHJcbiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogbWVzc2FnZSB9XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBleHRyYWN0RmJFcnJvcihlcnI6IHVua25vd24pOiBzdHJpbmcge1xyXG4gIGlmIChheGlvcy5pc0F4aW9zRXJyb3IoZXJyKSkge1xyXG4gICAgY29uc3QgZGF0YSA9IGVyci5yZXNwb25zZT8uZGF0YSBhcyB7IGVycm9yPzogeyBtZXNzYWdlPzogc3RyaW5nOyBjb2RlPzogbnVtYmVyIH0gfSB8IHVuZGVmaW5lZFxyXG4gICAgaWYgKGRhdGE/LmVycm9yPy5tZXNzYWdlKSByZXR1cm4gYEZCIEFQSSAke2RhdGEuZXJyb3IuY29kZSA/PyAnJ306ICR7ZGF0YS5lcnJvci5tZXNzYWdlfWBcclxuICAgIGlmIChlcnIuY29kZSA9PT0gJ0VDT05OQUJPUlRFRCcpIHJldHVybiAnUmVxdWVzdCB0aW1lZCBvdXQnXHJcbiAgICByZXR1cm4gZXJyLm1lc3NhZ2VcclxuICB9XHJcbiAgaWYgKGVyciBpbnN0YW5jZW9mIEVycm9yKSByZXR1cm4gZXJyLm1lc3NhZ2VcclxuICByZXR1cm4gU3RyaW5nKGVycilcclxufVxyXG4iLCAiaW1wb3J0IHsgYXBwIH0gZnJvbSAnZWxlY3Ryb24nXHJcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJ1xyXG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnXHJcbmltcG9ydCB0eXBlIHsgQXBwQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uL3NyYy90eXBlcy9pbmRleCdcclxuXHJcbmNvbnN0IERFRkFVTFRfQ09ORklHOiBBcHBDb25maWd1cmF0aW9uID0ge1xyXG4gIGdvb2dsZVNoZWV0SWQ6ICcnLFxyXG4gIHNlcnZpY2VBY2NvdW50UGF0aDogJycsXHJcbiAgZmFjZWJvb2tBcGlUb2tlbjogJycsXHJcbiAgZXhjbHVkZWRUYWJzOlxyXG4gICAgJ0NvbmZpZ3VyYXRpb24sIFJBVyBEYXRhIEFnZ3JlZ2F0ZWQsIERhc2hib2FyZCBTdW1tYXJ5LCBEYXNoYm9hcmQgU3VtbWFyeSAoVk5cdTAxMTApLCBBZHMgUnVsZXMgU3RhdHVzLCBVcGRhdGUgTW9uZXksIFVwZGF0ZSBNb25leSAxLCBDdXN0b21NZXNzYWdlLCBCXHUxRUEzbmcgVFx1MUVENW5nIEhcdTFFRTNwLCBVU0QgbVx1MUVBQnUnLFxyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRDb25maWdQYXRoKCk6IHN0cmluZyB7XHJcbiAgcmV0dXJuIHBhdGguam9pbihhcHAuZ2V0UGF0aCgndXNlckRhdGEnKSwgJ2NvbmZpZy5qc29uJylcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIENvbmZpZ1NlcnZpY2Uge1xyXG4gIGxvYWQoKTogQXBwQ29uZmlndXJhdGlvbiB7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCByYXcgPSBmcy5yZWFkRmlsZVN5bmMoZ2V0Q29uZmlnUGF0aCgpLCAndXRmLTgnKVxyXG4gICAgICByZXR1cm4geyAuLi5ERUZBVUxUX0NPTkZJRywgLi4uSlNPTi5wYXJzZShyYXcpIH1cclxuICAgIH0gY2F0Y2gge1xyXG4gICAgICByZXR1cm4geyAuLi5ERUZBVUxUX0NPTkZJRyB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBzYXZlKGNvbmZpZzogQXBwQ29uZmlndXJhdGlvbik6IHZvaWQge1xyXG4gICAgY29uc3QgY29uZmlnUGF0aCA9IGdldENvbmZpZ1BhdGgoKVxyXG4gICAgZnMubWtkaXJTeW5jKHBhdGguZGlybmFtZShjb25maWdQYXRoKSwgeyByZWN1cnNpdmU6IHRydWUgfSlcclxuICAgIGZzLndyaXRlRmlsZVN5bmMoY29uZmlnUGF0aCwgSlNPTi5zdHJpbmdpZnkoY29uZmlnLCBudWxsLCAyKSwgJ3V0Zi04JylcclxuICB9XHJcbn1cclxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsSUFBQUEsbUJBQTJEO0FBQzNELGtCQUFpQjtBQUNqQixzQkFBeUI7OztBQ0Z6QixJQUFBQyxtQkFBdUM7OztBQ0F2Qyx3QkFBdUI7QUFDdkIsc0JBQXVCO0FBYWhCLElBQU0sc0JBQU4sTUFBMEI7QUFBQSxFQUExQjtBQUNMLFNBQVEsT0FBMkQ7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNbkUsTUFBTSxhQUFhLG9CQUEyQztBQUM1RCxTQUFLLE9BQU8sSUFBSSx5QkFBTyxLQUFLLFdBQVc7QUFBQSxNQUNyQyxTQUFTO0FBQUEsTUFDVCxRQUFRLENBQUMsdURBQXVEO0FBQUEsSUFDbEUsQ0FBQztBQUVELFVBQU0sS0FBSyxLQUFLLFVBQVU7QUFBQSxFQUM1QjtBQUFBLEVBRUEsSUFBWSxTQUFTO0FBQ25CLFFBQUksQ0FBQyxLQUFLLEtBQU0sT0FBTSxJQUFJLE1BQU0sb0VBQW9FO0FBQ3BHLFdBQU8seUJBQU8sT0FBTyxFQUFFLFNBQVMsTUFBTSxNQUFNLEtBQUssS0FBSyxDQUFDO0FBQUEsRUFDekQ7QUFBQTtB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LElBQU0sc0JBQXNCO0FBRTVCLElBQU0sZ0JBQWdCLFlBQUFDLFFBQUssS0FBSyxXQUFXLE1BQU0sTUFBTTtBQUV2RCxJQUFJO0FBRUosU0FBUyxlQUFlO0FBQ3RCLFFBQU0sSUFBSSwrQkFBYztBQUFBLElBQ3RCLE9BQU87QUFBQSxJQUNQLFFBQVE7QUFBQSxJQUNSLFVBQVU7QUFBQSxJQUNWLFdBQVc7QUFBQSxJQUNYLE9BQU87QUFBQSxJQUNQLGdCQUFnQjtBQUFBLE1BQ2QsU0FBUyxZQUFBQSxRQUFLLEtBQUssV0FBVyxhQUFhO0FBQUEsTUFDM0Msa0JBQWtCO0FBQUEsTUFDbEIsaUJBQWlCO0FBQUEsSUFDbkI7QUFBQSxFQUNGLENBQUM7QUFFRCxNQUFJLHFCQUFxQjtBQUN2QixRQUFJLFFBQVEsbUJBQW1CO0FBQy9CLFFBQUksWUFBWSxhQUFhO0FBQUEsRUFDL0IsT0FBTztBQUNMLFFBQUksU0FBUyxZQUFBQSxRQUFLLEtBQUssZUFBZSxZQUFZLENBQUM7QUFBQSxFQUNyRDtBQUNGO0FBRUEscUJBQUksR0FBRyxxQkFBcUIsTUFBTTtBQUNoQyxNQUFJLFFBQVEsYUFBYSxVQUFVO0FBQ2pDLHlCQUFJLEtBQUs7QUFDVCxVQUFNO0FBQUEsRUFDUjtBQUNGLENBQUM7QUFFRCxxQkFBSSxHQUFHLFlBQVksTUFBTTtBQUN2QixNQUFJLCtCQUFjLGNBQWMsRUFBRSxXQUFXLEVBQUcsY0FBYTtBQUMvRCxDQUFDO0FBR0QseUJBQVEsT0FBTyxtQkFBbUIsWUFBWTtBQUM1QyxNQUFJLENBQUMsSUFBSyxRQUFPO0FBQ2pCLFFBQU0sU0FBUyxNQUFNLHdCQUFPLGVBQWUsS0FBSztBQUFBLElBQzlDLE9BQU87QUFBQSxJQUNQLFNBQVMsQ0FBQyxFQUFFLE1BQU0sY0FBYyxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUM7QUFBQSxJQUN0RCxZQUFZLENBQUMsVUFBVTtBQUFBLEVBQ3pCLENBQUM7QUFDRCxTQUFPLE9BQU8sV0FBVyxPQUFPLE9BQU8sVUFBVSxDQUFDO0FBQ3BELENBQUM7QUFHRCx5QkFBUSxPQUFPLGVBQWUsT0FBTyxRQUFpQixhQUFxQjtBQUN6RSxNQUFJLENBQUMsU0FBUyxTQUFTLE9BQU8sRUFBRyxPQUFNLElBQUksTUFBTSw4QkFBOEI7QUFDL0UsYUFBTywwQkFBUyxVQUFVLE9BQU87QUFDbkMsQ0FBQztBQUdELHlCQUFRLE9BQU8sc0JBQXNCLENBQUMsUUFBaUIsUUFBZ0I7QUFDckUsTUFBSSxlQUFlLEtBQUssR0FBRyxFQUFHLHdCQUFNLGFBQWEsR0FBRztBQUN0RCxDQUFDO0FBRUQscUJBQUksVUFBVSxFQUFFLEtBQUssTUFBTTtBQUN6QixzQkFBb0I7QUFDcEIsZUFBYTtBQUNmLENBQUM7IiwKICAibmFtZXMiOiBbImltcG9ydF9lbGVjdHJvbiIsICJpbXBvcnRfZWxlY3Ryb24iLCAiYXhpb3MiLCAicGF0aCJdCn0K
