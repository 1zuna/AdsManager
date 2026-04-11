import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "lucide-react";

export type LogEntry = {
  id: string;
  timestamp: string;
  message: string;
  type: "info" | "success" | "error" | "warning";
};

interface ExecutionLogProps {
  logs: LogEntry[];
  title?: string;
}

const typeColors: Record<LogEntry["type"], string> = {
  info: "text-terminal-info",
  success: "text-terminal-text",
  error: "text-terminal-error",
  warning: "text-terminal-warning",
};

const typePrefix: Record<LogEntry["type"], string> = {
  info: "INFO",
  success: " OK ",
  error: " ERR",
  warning: "WARN",
};

const ExecutionLog = ({ logs, title = "Execution Log" }: ExecutionLogProps) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottom = useRef(true);

  // Auto-scroll only when already docked to bottom
  useEffect(() => {
    if (isAtBottom.current) {
      const el = scrollContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [logs]);

  // Track whether the user is at the bottom of the log panel
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const threshold = 32; // px from bottom to still count as "docked"
    isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  return (
    <div className="flex flex-col rounded-lg border border-border bg-terminal-bg overflow-hidden flex-1 min-h-0">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 bg-card/50">
        <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">{logs.length} entries</span>
      </div>

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed terminal-scrollbar min-h-[200px] max-h-[400px]"
      >
        {logs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <span>Waiting for execution...</span>
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex gap-2">
              <span className="text-muted-foreground shrink-0">{log.timestamp}</span>
              <span className={`shrink-0 font-semibold ${typeColors[log.type]}`}>
                [{typePrefix[log.type]}]
              </span>
              <span className={typeColors[log.type]}>{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ExecutionLog;
