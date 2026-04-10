import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronUp, FolderOpen, Save, X, Search, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { AppConfiguration } from "@/types/index";
import type { GroupData } from "@/types/index";

const DEFAULT_EXCLUDED = `Configuration, RAW Data Aggregated, Dashboard Summary, Dashboard Summary (VNĐ), Ads Rules Status, Update Money, Update Money 1, CustomMessage, Bảng Tổng Hợp, USD mẫu`;

interface SettingsPanelProps {
  config: AppConfiguration;
  onConfigChange: (config: AppConfiguration) => void;
  /** Available groups for the schedule-excluded picker */
  availableGroups?: GroupData[];
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const SettingsPanel = ({ config, onConfigChange, availableGroups = [], onRefresh, isRefreshing = false }: SettingsPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [excludedOpen, setExcludedOpen] = useState(false);
  const [intervalInput, setIntervalInput] = useState(String(config.scheduleIntervalHours ?? 2));
  const [excludedSearch, setExcludedSearch] = useState("");
  const excludedRef = useRef<HTMLDivElement>(null);
  const excludedSearchRef = useRef<HTMLInputElement>(null);

  // Sync local interval string when config loads from disk
  useEffect(() => {
    setIntervalInput(String(config.scheduleIntervalHours ?? 2));
  }, [config.scheduleIntervalHours]);

  useEffect(() => {
    if (!excludedOpen) {
      setExcludedSearch("");
      return;
    }
    setTimeout(() => excludedSearchRef.current?.focus(), 50);
    const handler = (e: MouseEvent) => {
      if (excludedRef.current && !excludedRef.current.contains(e.target as Node)) {
        setExcludedOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [excludedOpen]);

  const toggleScheduleExcluded = (tabName: string) => {
    const current = config.scheduleExcludedGroups ?? [];
    const next = current.includes(tabName)
      ? current.filter((g) => g !== tabName)
      : [...current, tabName];
    onConfigChange({ ...config, scheduleExcludedGroups: next });
  };

  const removeExcluded = (tabName: string) => {
    onConfigChange({
      ...config,
      scheduleExcludedGroups: (config.scheduleExcludedGroups ?? []).filter((g) => g !== tabName),
    });
  };

  const handleBrowse = async () => {
    const filePath = await window.electronAPI?.openFile();
    if (filePath) onConfigChange({ ...config, serviceAccountPath: filePath });
  };

  const handleSave = () => {
    onConfigChange(config);
    toast.success("Settings saved successfully");
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-card-foreground hover:bg-secondary/50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary" />
          Settings & Credentials
        </span>
        {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {isOpen && (
        <div className="border-t border-border px-4 py-4 space-y-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              Google Sheet ID
            </Label>
            <Input
              value={config.googleSheetId}
              onChange={(e) =>
                onConfigChange({ ...config, googleSheetId: e.target.value })
              }
              placeholder="1eXCO_wBqAp1oyYLSJ3uASPlH4UpKd-zma7t8YNPQNAk"
              className="bg-secondary/50 border-border font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              Google Service Account JSON Path
            </Label>
            <div className="flex gap-2">
              <Input
                value={config.serviceAccountPath}
                onChange={(e) =>
                  onConfigChange({ ...config, serviceAccountPath: e.target.value })
                }
                placeholder="/path/to/service-account.json"
                className="bg-secondary/50 border-border font-mono text-sm"
              />
              <Button variant="outline" size="icon" title="Browse" onClick={handleBrowse} disabled={!window.electronAPI}>
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              Facebook API Token
            </Label>
            <Input
              type="password"
              value={config.facebookApiToken}
              onChange={(e) =>
                onConfigChange({ ...config, facebookApiToken: e.target.value })
              }
              placeholder="Enter your Facebook Marketing API token"
              className="bg-secondary/50 border-border font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              Excluded Tabs (comma-separated)
            </Label>
            <Input
              value={config.excludedTabs}
              onChange={(e) =>
                onConfigChange({ ...config, excludedTabs: e.target.value })
              }
              placeholder={DEFAULT_EXCLUDED}
              className="bg-secondary/50 border-border text-sm"
            />
          </div>

          {/* ── Scheduled job settings ──────────────────────────────────── */}
          <div className="pt-2 border-t border-border">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              Scheduled Job Settings
            </Label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                Run Interval (hours)
              </Label>
              <Input
                type="number"
                min={0.01}
                step="any"
                value={intervalInput}
                onChange={(e) => {
                  setIntervalInput(e.target.value);
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val) && val > 0) onConfigChange({ ...config, scheduleIntervalHours: val });
                }}
                onBlur={() => {
                  const val = parseFloat(intervalInput);
                  if (isNaN(val) || val <= 0) setIntervalInput(String(config.scheduleIntervalHours ?? 2));
                }}
                className="bg-secondary/50 border-border font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                Max Limit / Account ($)
              </Label>
              <Input
                type="number"
                min={0}
                step={10}
                value={config.maxBuffer ?? 100}
                onChange={(e) => onConfigChange({ ...config, maxBuffer: Number(e.target.value) })}
                className="bg-secondary/50 border-border font-mono text-sm"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-foreground">Auto-revoke inactive accounts</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Clear limit for accounts with $0 spent while others are active (Case B)
              </p>
            </div>
            <button
              type="button"
              onClick={() => onConfigChange({ ...config, autoRevokeInactive: !(config.autoRevokeInactive ?? true) })}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${
                (config.autoRevokeInactive ?? true) ? 'bg-primary' : 'bg-secondary'
              }`}
              role="switch"
              aria-checked={config.autoRevokeInactive ?? true}
            >
              <span
                className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg transition-transform ${
                  (config.autoRevokeInactive ?? true) ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                Groups Excluded From Schedule
              </Label>
              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={isRefreshing}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground -mt-1">
              Excluded groups are skipped by the schedule. Empty = all groups run.
            </p>
            <div className="relative" ref={excludedRef}>
              <button
                type="button"
                onClick={() => setExcludedOpen((v) => !v)}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-muted-foreground hover:bg-secondary transition-colors"
              >
                {(config.scheduleExcludedGroups ?? []).length === 0
                  ? 'None excluded (all groups run)'
                  : `${config.scheduleExcludedGroups.length} group(s) excluded`}
                <ChevronDown className="h-4 w-4" />
              </button>
              {excludedOpen && (
                <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-card shadow-xl">
                  {/* Search box */}
                  <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                    <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <input
                      ref={excludedSearchRef}
                      value={excludedSearch}
                      onChange={(e) => setExcludedSearch(e.target.value)}
                      placeholder="Search groups..."
                      className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                    />
                    {excludedSearch && (
                      <button onClick={() => setExcludedSearch("")} className="text-muted-foreground hover:text-foreground">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                  {availableGroups.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-muted-foreground text-center">
                      Load groups first (click Refresh above).
                    </div>
                  ) : (
                    availableGroups
                      .filter((g) =>
                        !excludedSearch.trim() ||
                        g.tabName.toLowerCase().includes(excludedSearch.toLowerCase())
                      )
                      .map((g) => {
                      const isExcluded = (config.scheduleExcludedGroups ?? []).includes(g.tabName);
                      return (
                        <button
                          key={g.tabName}
                          type="button"
                          onClick={() => toggleScheduleExcluded(g.tabName)}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-secondary/80 transition-colors ${
                            isExcluded ? 'text-warning' : 'text-foreground'
                          }`}
                        >
                          <span
                            className={`h-3.5 w-3.5 shrink-0 rounded border flex items-center justify-center text-[10px] ${
                              isExcluded
                                ? 'bg-warning/20 border-warning text-warning'
                                : 'border-muted-foreground'
                            }`}
                          >
                            {isExcluded && '✓'}
                          </span>
                          {g.tabName}
                        </button>
                      );
                    })
                  )}
                  </div>
                </div>
              )}
            </div>
            {(config.scheduleExcludedGroups ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {config.scheduleExcludedGroups.map((tabName) => (
                  <span
                    key={tabName}
                    className="inline-flex items-center gap-1 rounded-md bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning"
                  >
                    {tabName}
                    <button onClick={() => removeExcluded(tabName)} className="hover:opacity-70">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <Button onClick={handleSave} variant="secondary" className="w-full">
            <Save className="h-4 w-4 mr-2" />
            Save Settings
          </Button>
        </div>
      )}
    </div>
  );
};

export default SettingsPanel;
