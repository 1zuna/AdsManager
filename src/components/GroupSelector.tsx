import { RefreshCw, ChevronDown, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useRef, useEffect } from "react";
import type { GroupData } from "@/types/index";

interface GroupSelectorProps {
  groups: GroupData[];
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
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Focus search when opening
  useEffect(() => {
    if (isOpen) setTimeout(() => searchRef.current?.focus(), 50);
    else setSearch("");
  }, [isOpen]);

  const toggle = (tabName: string) => {
    onSelectionChange(
      selectedGroups.includes(tabName)
        ? selectedGroups.filter((g) => g !== tabName)
        : [...selectedGroups, tabName]
    );
  };

  const removeGroup = (tabName: string) => {
    onSelectionChange(selectedGroups.filter((g) => g !== tabName));
  };

  const filtered = search.trim()
    ? groups.filter(
        (g) =>
          g.groupName.toLowerCase().includes(search.toLowerCase()) ||
          g.tabName.toLowerCase().includes(search.toLowerCase())
      )
    : groups;

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
          <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-card shadow-xl">
            {/* Search box */}
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search groups..."
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Select All / Unselect All */}
            {filtered.length > 0 && (
              <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
                <span className="text-xs text-muted-foreground">
                  {filtered.filter((g) => selectedGroups.includes(g.tabName)).length}/{filtered.length} selected
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const allFilteredNames = filtered.map((g) => g.tabName);
                      const alreadySelected = selectedGroups.filter((s) => !allFilteredNames.includes(s));
                      onSelectionChange([...alreadySelected, ...allFilteredNames]);
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    Select all
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button
                    onClick={() => {
                      const allFilteredNames = new Set(filtered.map((g) => g.tabName));
                      onSelectionChange(selectedGroups.filter((s) => !allFilteredNames.has(s)));
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    None
                  </button>
                </div>
              </div>
            )}

            <div className="max-h-52 overflow-y-auto">
              {groups.length === 0 ? (
                <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                  No groups loaded. Click Refresh.
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                  No groups match "{search}".
                </div>
              ) : (
                filtered.map((group) => {
                  const isSelected = selectedGroups.includes(group.tabName);
                  return (
                    <button
                      key={group.tabName}
                      onClick={() => toggle(group.tabName)}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-secondary/80 transition-colors ${
                        isSelected ? "text-primary" : "text-foreground"
                      }`}
                    >
                      <span
                        className={`h-3.5 w-3.5 shrink-0 rounded border flex items-center justify-center text-[10px] ${
                          isSelected
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-muted-foreground"
                        }`}
                      >
                        {isSelected && "✓"}
                      </span>
                      <span className="flex-1 text-left min-w-0">
                        <span className="block truncate font-medium">{group.tabName}</span>
                        {(group.remaining != null || group.accountIds != null) && (
                          <span className="block text-xs text-muted-foreground mt-0.5">
                            {group.remaining != null &&
                              `$${group.remaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} remaining`
                            }
                            {group.remaining != null && group.accountIds != null && " · "}
                            {group.accountIds != null &&
                              `${group.accountIds.length} account${group.accountIds.length !== 1 ? "s" : ""}`
                            }
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {selectedGroups.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedGroups.map((tabName) => {
            const g = groups.find((x) => x.tabName === tabName);
            return (
              <span
                key={tabName}
                className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary"
              >
                {g?.tabName ?? tabName}
                <button onClick={() => removeGroup(tabName)} className="hover:text-primary-foreground">
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default GroupSelector;

