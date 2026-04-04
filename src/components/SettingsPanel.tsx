import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronUp, FolderOpen, Save, X } from "lucide-react";
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
}

const SettingsPanel = ({ config, onConfigChange, availableGroups = [] }: SettingsPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [excludedOpen, setExcludedOpen] = useState(false);
  const excludedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!excludedOpen) return;
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

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              Daily Run Time (24h)
            </Label>
            <Input
              type="time"
              value={config.scheduleTime ?? '08:00'}
              onChange={(e) => onConfigChange({ ...config, scheduleTime: e.target.value })}
              className="bg-secondary/50 border-border font-mono text-sm w-32"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              Groups Excluded From Schedule
            </Label>
            <div className="relative" ref={excludedRef}>
              <button
                type="button"
                onClick={() => setExcludedOpen((v) => !v)}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-muted-foreground hover:bg-secondary transition-colors"
              >
                {(config.scheduleExcludedGroups ?? []).length === 0
                  ? 'None excluded'
                  : `${config.scheduleExcludedGroups.length} group(s) excluded`}
                <ChevronDown className="h-4 w-4" />
              </button>
              {excludedOpen && (
                <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-card shadow-xl max-h-48 overflow-y-auto">
                  {availableGroups.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-muted-foreground text-center">
                      Load groups first (click Refresh above).
                    </div>
                  ) : (
                    availableGroups.map((g) => {
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
