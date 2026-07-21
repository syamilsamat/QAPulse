import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getApiUrl, authHeaders } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { History, Search, CalendarClock } from "lucide-react";

// CR068 — History Trail now shows the requirement event log (Blocker/Server
// down/Automation unavailable/custom), replacing the old ad-hoc task events
// view. tasksTable stopped growing after CR060's Tasks redesign, so that
// view would have slowly gone stale; requirement events are the thing users
// actually log going forward (see RequirementEventsDialog on Tasks.tsx).
interface RequirementEventRow {
  id: number;
  requirementId: number;
  requirementTitle: string;
  projectId: number | null;
  projectName: string | null;
  milestoneId: number | null;
  milestoneName: string | null;
  type: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
  createdByName: string | null;
}

const EVENT_TYPE_CLASSES: Record<string, string> = {
  Blocker: "bg-red-100 text-red-700 border-red-200",
  "Server down": "bg-orange-100 text-orange-700 border-orange-200",
  "Automation unavailable": "bg-amber-100 text-amber-700 border-amber-200",
};

export default function HistoryTrail() {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 15;

  const { data: events = [], isLoading } = useQuery<RequirementEventRow[]>({
    queryKey: ["requirement-events-all"],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/requirements/events/all`, { headers: authHeaders() });
      return res.ok ? res.json() : [];
    },
  });

  const typeOptions = Array.from(new Set(events.map((e) => e.type))).sort();

  const filtered = events.filter((e) => {
    if (filterType !== "all" && e.type !== filterType) return false;
    if (filterStatus === "open" && e.endDate) return false;
    if (filterStatus === "closed" && !e.endDate) return false;
    if (search) {
      const q = search.toLowerCase();
      const matches =
        e.requirementTitle.toLowerCase().includes(q) ||
        e.type.toLowerCase().includes(q) ||
        (e.description ?? "").toLowerCase().includes(q) ||
        (e.milestoneName ?? "").toLowerCase().includes(q);
      if (!matches) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE) || 1;
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <History className="w-7 h-7 text-primary" /> History Trail
        </h1>
        <p className="text-muted-foreground mt-1">
          Blocker, server-down, and other events logged against requirements
        </p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by requirement, milestone, type, or description..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <SearchableSelect
              value={filterType}
              onValueChange={(v) => { setFilterType(v); setCurrentPage(1); }}
              options={[{ value: "all", label: "All Types" }, ...typeOptions.map((t) => ({ value: t, label: t }))]}
              placeholder="Type"
              searchPlaceholder="Search type..."
              className="w-full sm:w-48"
            />
            <SearchableSelect
              value={filterStatus}
              onValueChange={(v) => { setFilterStatus(v); setCurrentPage(1); }}
              options={[
                { value: "all", label: "All" },
                { value: "open", label: "Ongoing" },
                { value: "closed", label: "Ended" },
              ]}
              placeholder="Status"
              searchPlaceholder="Search status..."
              className="w-full sm:w-36"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <History className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-muted-foreground">No events found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[220px]">Requirement</TableHead>
                    <TableHead>Milestone</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Logged By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="max-w-[280px] truncate" title={e.requirementTitle}>{e.requirementTitle}</TableCell>
                      <TableCell>{e.milestoneName ?? <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={EVENT_TYPE_CLASSES[e.type] ?? "bg-slate-100 text-slate-700 border-slate-200"}>{e.type}</Badge>
                      </TableCell>
                      <TableCell>{new Date(e.startDate).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {e.endDate ? (
                          new Date(e.endDate).toLocaleDateString()
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-amber-600">
                            <CalendarClock className="w-3 h-3" /> Ongoing
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{e.createdByName ?? <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <div className="text-xs text-muted-foreground">
            Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length} events
          </div>
          <div className="flex gap-2">
            <button
              className="text-xs border rounded-md px-3 py-1.5 disabled:opacity-50"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </button>
            <button
              className="text-xs border rounded-md px-3 py-1.5 disabled:opacity-50"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
