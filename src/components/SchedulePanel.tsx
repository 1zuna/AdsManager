import { CalendarClock, CircleDot, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
import { useScheduler } from "@/hooks/useScheduler";
import ExecutionLog from "@/components/ExecutionLog";
import type { ScheduleState } from "@/types/index";

const STATE_CONFIG: Record<
  ScheduleState,
  { label: string; color: string; Icon: React.ElementType; spin?: boolean }
> = {
  idle: {
    label: "Idle",
    color: "text-muted-foreground",
    Icon: CircleDot,
  },
  scheduled: {
    label: "Scheduled",
    color: "text-terminal-info",
    Icon: Clock,
  },
  running: {
    label: "Running",
    color: "text-warning",
    Icon: Loader2,
    spin: true,
  },
  completed: {
    label: "Completed",
    color: "text-terminal-text",
    Icon: CheckCircle2,
  },
  error: {
    label: "Error",
    color: "text-terminal-error",
    Icon: XCircle,
  },
};

function fmt(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

interface SchedulePanelProps {
  scheduleEnabled: boolean;
  scheduleTime: string;
  onToggle: (enabled: boolean) => void;
}

const SchedulePanel = ({ scheduleEnabled, scheduleTime, onToggle }: SchedulePanelProps) => {
  const { status, displayLogs, start, stop } = useScheduler();
  const { label, color, Icon, spin } = STATE_CONFIG[status.state];

  const handleToggle = async () => {
    if (scheduleEnabled) {
      await stop();
      onToggle(false);
    } else {
      onToggle(true);
      // Start is triggered by config save in ipcHandlers; call directly here for instant feedback
      await start();
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-card-foreground">Scheduled Job</span>
        </div>

        {/* Toggle switch */}
        <button
          onClick={handleToggle}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none ${
            scheduleEnabled ? "bg-primary" : "bg-secondary"
          }`}
          role="switch"
          aria-checked={scheduleEnabled}
        >
          <span
            className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg transition-transform ${
              scheduleEnabled ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* Status row */}
      <div className="flex items-center gap-6 px-4 py-3 text-xs">
        <div className="flex items-center gap-1.5">
          <Icon className={`h-3.5 w-3.5 ${color} ${spin ? "animate-spin" : ""}`} />
          <span className={`font-medium ${color}`}>{label}</span>
        </div>

        {status.nextRun && status.state === "scheduled" && (
          <div className="flex items-center gap-1 text-muted-foreground">
            <span className="uppercase tracking-wider">Next</span>
            <span className="text-foreground font-mono">{fmt(status.nextRun)}</span>
            <span className="text-muted-foreground/60">({scheduleTime})</span>
          </div>
        )}

        {status.lastRun && (
          <div className="flex items-center gap-1 text-muted-foreground ml-auto">
            <span className="uppercase tracking-wider">Last</span>
            <span className="text-foreground font-mono">{fmt(status.lastRun)}</span>
          </div>
        )}
      </div>

      {/* Error message */}
      {status.state === "error" && status.error && (
        <div className="mx-4 mb-3 rounded border border-terminal-error/30 bg-terminal-error/10 px-3 py-2 text-xs text-terminal-error">
          {status.error}
        </div>
      )}

      {/* Last run log */}
      {displayLogs.length > 0 && (
        <div className="px-4 pb-4">
          <ExecutionLog logs={displayLogs} title="Last Job Log" />
        </div>
      )}
    </div>
  );
};

export default SchedulePanel;
