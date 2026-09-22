import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { 
  FileText, ScrollText, Bug, CheckSquare, Users, 
  AlertCircle, Target, Briefcase, Layers, FileCheck2, Loader2, Link as LinkIcon, TestTube
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// Hook for debouncing
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const TYPE_ICONS: Record<string, any> = {
  requirement: ScrollText,
  test_case: TestTube,
  task: CheckSquare,
  defect: Bug,
  milestone: Target,
  risk: AlertCircle,
  uat_signoff: FileCheck2,
  project: Briefcase,
  module: Layers,
  contact: Users,
  user: Users,
  team: Users,
  document_register: LinkIcon,
};

async function fetchSearch(token: string | null, q: string, type: string) {
  if (!token || q.trim().length < 2) return { query: q, total: 0, groups: [] };
  const url = new URL(`${getApiUrl()}/search`);
  url.searchParams.set("q", q.trim());
  if (type !== "all") url.searchParams.set("type", type);
  
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}

export function GlobalSearch() {
  const { token } = useAuth();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeType, setActiveType] = useState("all");
  
  const debouncedQuery = useDebounce(query, 250);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener("open-global-search", handleOpen);
    return () => window.removeEventListener("open-global-search", handleOpen);
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["global-search", debouncedQuery, activeType],
    queryFn: () => fetchSearch(token, debouncedQuery, activeType),
    enabled: !!token && debouncedQuery.length >= 2,
    placeholderData: keepPreviousData,
  });

  const handleSelect = (route: string) => {
    setOpen(false);
    setLocation(route);
  };

  const getStatusColor = (tone: string) => {
    switch(tone) {
      case 'success': return 'bg-green-100 text-green-700 hover:bg-green-100/80';
      case 'destructive': return 'bg-red-100 text-red-700 hover:bg-red-100/80';
      case 'warning': return 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100/80';
      default: return 'bg-slate-100 text-slate-700 hover:bg-slate-100/80';
    }
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
      <CommandInput 
        placeholder="Type a command or search..." 
        value={query} 
        onValueChange={setQuery} 
      />
      
      {/* Category Filter Chips */}
      {data && data.total > 0 && (
        <div className="flex flex-wrap gap-2 p-2 border-b border-border bg-muted/20">
          <Badge 
            variant={activeType === "all" ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setActiveType("all")}
          >
            All {data.total}
          </Badge>
          {data.groups.map((g: any) => (
            <Badge 
              key={g.type}
              variant={activeType === g.type ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setActiveType(g.type)}
            >
              {g.label} {g.count}
            </Badge>
          ))}
        </div>
      )}

      <CommandList>
        <CommandEmpty>
          {query.length < 2 ? "Type at least 2 characters to search." : 
           isLoading ? "Searching..." : 
           "No results found."}
        </CommandEmpty>

        {isLoading && (
          <div className="p-4 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Searching...
          </div>
        )}

        {data?.groups?.map((group: any) => (
          <CommandGroup key={group.type} heading={group.label.toUpperCase()}>
            {group.results.map((item: any) => {
              const Icon = TYPE_ICONS[group.type] || FileText;
              return (
                <CommandItem
                  key={`${item.type}-${item.id}`}
                  value={`${item.title} ${item.subtitle}`}
                  onSelect={() => handleSelect(item.route)}
                  className="flex items-start gap-3 py-3"
                >
                  <Icon className="h-5 w-5 mt-0.5 text-muted-foreground" />
                  <div className="flex flex-col flex-1 gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{item.title}</span>
                      {item.status && (
                        <Badge variant="secondary" className={`uppercase text-[10px] tracking-wider font-semibold px-2 py-0.5 ${getStatusColor(item.statusTone)}`}>
                          {item.status}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{item.subtitle}</span>
                  </div>
                </CommandItem>
              );
            })}
            
            {/* Show "N more results" if there are more in the group but we are in "all" view */}
            {activeType === "all" && group.count > group.results.length && (
              <CommandItem
                value={`more-${group.type}`}
                onSelect={() => setActiveType(group.type)}
                className="text-primary text-sm font-medium justify-center py-3"
              >
                {group.count - group.results.length} more results &rsaquo;
              </CommandItem>
            )}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
