import { useState, useCallback } from "react";
import { Play, Zap, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import SettingsPanel from "@/components/SettingsPanel";
import GroupSelector from "@/components/GroupSelector";
import ExecutionLog, { type LogEntry } from "@/components/ExecutionLog";
import { toast } from "sonner";

const MOCK_GROUPS = [
  "Agency Alpha – US",
  "Agency Beta – EU",
  "Agency Gamma – SEA",
  "Direct Accounts – VN",
  "Performance Team A",
];

const Index = () => {
  const [config, setConfig] = useState({
    serviceAccountPath: "",
    fbToken: "",
    excludedTabs:
      "Configuration, RAW Data Aggregated, Dashboard Summary, Dashboard Summary (VNĐ), Ads Rules Status, Update Money, Update Money 1, CustomMessage, Bảng Tổng Hợp, USD mẫu",
  });
  const [groups, setGroups] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const now = () =>
    new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const addLog = useCallback(
    (message: string, type: LogEntry["type"] = "info") => {
      setLogs((prev) => [
        ...prev,
        { id: crypto.randomUUID(), timestamp: now(), message, type },
      ]);
    },
    []
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    addLog("Fetching groups from Google Sheets...");
    await new Promise((r) => setTimeout(r, 1200));
    setGroups(MOCK_GROUPS);
    addLog(`Loaded ${MOCK_GROUPS.length} groups successfully.`, "success");
    setIsRefreshing(false);
  };

  const handleExecute = async () => {
    if (!config.serviceAccountPath || !config.fbToken) {
      toast.error("Please configure Service Account path and FB Token in Settings.");
      addLog("Pre-flight check failed: missing credentials.", "error");
      return;
    }
    if (selectedGroups.length === 0) {
      toast.error("Select at least one group to process.");
      addLog("Pre-flight check failed: no groups selected.", "error");
      return;
    }

    setIsExecuting(true);
    addLog("Starting execution...");
    addLog(`Processing ${selectedGroups.length} group(s): ${selectedGroups.join(", ")}`);

    for (const group of selectedGroups) {
      addLog(`── Group: ${group}`);
      const accountCount = Math.floor(Math.random() * 5) + 3;
      const remaining = Math.floor(Math.random() * 5000) + 1000;
      const perAccount = (remaining / accountCount).toFixed(2);
      addLog(`   Found ${accountCount} accounts, Remaining: $${remaining}, Per-account: $${perAccount}`);

      for (let i = 0; i < accountCount; i++) {
        await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));
        const accountId = `act_${Math.random().toString(36).slice(2, 10)}`;
        const success = Math.random() > 0.15;
        if (success) {
          addLog(`   ✓ ${accountId} → limit set to $${perAccount}`, "success");
        } else {
          addLog(`   ✗ ${accountId} → API error: rate limit exceeded, skipping`, "error");
        }
      }
      addLog(`── Group "${group}" completed.`, "info");
    }

    addLog("Execution finished.", "success");
    setIsExecuting(false);
    toast.success("Execution complete!");
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground">FB Ads Limit Controller</h1>
              <p className="text-xs text-muted-foreground">Spending limit management tool</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Shield className="h-3.5 w-3.5" />
            Local-first
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-6">
        <SettingsPanel config={config} onConfigChange={setConfig} />

        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <GroupSelector
            groups={groups}
            selectedGroups={selectedGroups}
            onSelectionChange={setSelectedGroups}
            onRefresh={handleRefresh}
            isLoading={isRefreshing}
          />

          <Button
            variant="execute"
            size="lg"
            className="w-full"
            disabled={isExecuting || selectedGroups.length === 0}
            onClick={handleExecute}
          >
            <Play className={`h-4 w-4 ${isExecuting ? "animate-pulse" : ""}`} />
            {isExecuting ? "Processing..." : "Set Limit"}
          </Button>
        </div>

        <ExecutionLog logs={logs} />
      </main>
    </div>
  );
};

export default Index;
