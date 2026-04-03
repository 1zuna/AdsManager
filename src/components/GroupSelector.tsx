import { RefreshCw, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useRef, useEffect } from "react";

interface GroupSelectorProps {
  groups: string[];
  selectedGroups: string[];
  onSelectionChange: (groups: string[]) => void;
  onRefresh: () => void;
  isLoading: boolean;
}

const GroupSelector = ({
  groups,
  selectedGroups,
  onSelectionChange,
  onRefresh,
  isLoading,
}: GroupSelectorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (group: string) => {
    onSelectionChange(
      selectedGroups.includes(group)
        ? selectedGroups.filter((g) => g !== group)
        : [...selectedGroups, group]
    );
  };

  const removeGroup = (group: string) => {
    onSelectionChange(selectedGroups.filter((g) => g !== group));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
          Account Groups
        </label>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div ref={ref} className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex w-full items-center justify-between rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors"
        >
          <span className="text-muted-foreground">
            {selectedGroups.length === 0
              ? "Select groups..."
              : `${selectedGroups.length} group(s) selected`}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>

        {isOpen && (
          <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-card shadow-xl max-h-56 overflow-y-auto">
            {groups.length === 0 ? (
              <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                No groups loaded. Click Refresh.
              </div>
            ) : (
              groups.map((group) => (
                <button
                  key={group}
                  onClick={() => toggle(group)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-secondary/80 transition-colors ${
                    selectedGroups.includes(group) ? "text-primary" : "text-foreground"
                  }`}
                >
                  <span
                    className={`h-3.5 w-3.5 rounded border flex items-center justify-center text-[10px] ${
                      selectedGroups.includes(group)
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-muted-foreground"
                    }`}
                  >
                    {selectedGroups.includes(group) && "✓"}
                  </span>
                  {group}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {selectedGroups.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedGroups.map((group) => (
            <span
              key={group}
              className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary"
            >
              {group}
              <button onClick={() => removeGroup(group)} className="hover:text-primary-foreground">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default GroupSelector;
