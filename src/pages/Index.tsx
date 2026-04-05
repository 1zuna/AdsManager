import React, { useState, useEffect, useRef } from "react";
import { Play, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import SettingsPanel from "@/components/SettingsPanel";
import GroupSelector from "@/components/GroupSelector";
import SchedulePanel from "@/components/SchedulePanel";
import ExecutionLog from "@/components/ExecutionLog";
import UpdateBadge from "@/components/UpdateBadge";
import { toast } from "sonner";
import { useConfig } from "@/hooks/useConfig";
import { useGroups } from "@/hooks/useGroups";
import { useExecution } from "@/hooks/useExecution";

const Index = () => {
  const { config, setConfig } = useConfig();
  const { groups, isRefreshing, error: groupsError, refresh } = useGroups();
  const { logs, isExecuting, run } = useExecution();

  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);

  const handleRefresh = async () => {
    await refresh(config.googleSheetId, config.excludedTabs);
  };

  // Auto-sync Google Sheet tabs every 5 minutes
  const configRef = useRef(config);
  configRef.current = config;
  useEffect(() => {
    const id = setInterval(() => {
      const { googleSheetId, excludedTabs } = configRef.current;
      if (googleSheetId) refresh(googleSheetId, excludedTabs);
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [refresh]);

  // Surface groups fetch error via toast when error changes
  React.useEffect(() => {
    if (groupsError) toast.error(groupsError);
  }, [groupsError]);

  const handleExecute = async () => {
    if (!config.serviceAccountPath || !config.facebookApiToken) {
      toast.error("Please configure Service Account path and FB Token in Settings.");
      return;
    }
    if (!config.googleSheetId) {
      toast.error("Please configure Google Sheet ID in Settings.");
      return;
    }
    if (selectedGroups.length === 0) {
      toast.error("Select at least one group to process.");
      return;
    }
    await run(selectedGroups, config);
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
            <UpdateBadge />
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-6">
        <SettingsPanel
            config={config}
            onConfigChange={setConfig}
            availableGroups={groups}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
          />

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

        <SchedulePanel
            scheduleEnabled={config.scheduleEnabled}
            scheduleIntervalHours={config.scheduleIntervalHours ?? 2}
            onToggle={(enabled) => setConfig({ ...config, scheduleEnabled: enabled })}
          />

          <ExecutionLog logs={logs} />
      </main>
    </div>
  );
};

export default Index;
