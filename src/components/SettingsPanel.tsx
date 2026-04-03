import { useState } from "react";
import { ChevronDown, ChevronUp, FolderOpen, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const DEFAULT_EXCLUDED = `Configuration, RAW Data Aggregated, Dashboard Summary, Dashboard Summary (VNĐ), Ads Rules Status, Update Money, Update Money 1, CustomMessage, Bảng Tổng Hợp, USD mẫu`;

interface SettingsPanelProps {
  config: {
    serviceAccountPath: string;
    fbToken: string;
    excludedTabs: string;
  };
  onConfigChange: (config: {
    serviceAccountPath: string;
    fbToken: string;
    excludedTabs: string;
  }) => void;
}

const SettingsPanel = ({ config, onConfigChange }: SettingsPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);

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
              <Button variant="outline" size="icon" title="Browse">
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
              value={config.fbToken}
              onChange={(e) =>
                onConfigChange({ ...config, fbToken: e.target.value })
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
