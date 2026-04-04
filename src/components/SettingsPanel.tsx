import { useState } from "react";
import { ChevronDown, ChevronUp, FolderOpen, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { AppConfiguration } from "@/types/index";

const DEFAULT_EXCLUDED = `Configuration, RAW Data Aggregated, Dashboard Summary, Dashboard Summary (VNĐ), Ads Rules Status, Update Money, Update Money 1, CustomMessage, Bảng Tổng Hợp, USD mẫu`;

interface SettingsPanelProps {
  config: AppConfiguration;
  onConfigChange: (config: AppConfiguration) => void;
}

const SettingsPanel = ({ config, onConfigChange }: SettingsPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleBrowse = async () => {
    const filePath = await window.electronAPI?.openFile();
    if (filePath) onConfigChange({ ...config, serviceAccountPath: filePath });
  };

  const handleSave = () => {
    onConfigChange(config);
    toast.success("Settings saved successfully");
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
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
