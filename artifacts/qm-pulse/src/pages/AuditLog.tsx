import { useState, useEffect, useMemo } from "react";
import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import * as XLSX from "xlsx-js-style";
import { format } from "date-fns";
import {
  ScrollText,
  Download,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string;
  source: "activity" | "execution_history";
  type: string;
  description: string;
  userId: number | null;
  actorName: string | null;
  entityId: number | null;
  entityType: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

interface AuditResponse {
  total: number;
  page: number;
  limit: number;
  entries: AuditEntry[];
}

const ENTITY_TYPES = [
  { value: "requirement", label: "Requirements" },
  { value: "test_case", label: "Test Cases" },
  { value: "task", label: "Tasks" },
  { value: "execution", label: "Execution" },
  { value: "verdict", label: "Verdicts" },
  { value: "system", label: "System (login/logout)" },
];

const PAGE_SIZE = 50;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function typeBadgeClass(type: string): string {
  if (type.endsWith("_created")) return "bg-green-100 text-green-700 hover:bg-green-100";
  if (type.endsWith("_deleted")) return "bg-red-100 text-red-700 hover:bg-red-100";
  if (type.includes("status_changed") || type.includes("result_changed"))
    return "bg-orange-100 text-orange-700 hover:bg-orange-100";
  if (type.endsWith("_updated") || type === "execution_saved")
    return "bg-blue-100 text-blue-700 hover:bg-blue-100";
  if (type === "user_login" || type === "user_logout")
    return "bg-violet-100 text-violet-700 hover:bg-violet-100";
  if (type === "verdict_sent") return "bg-pink-100 text-pink-700 hover:bg-pink-100";
  return "bg-gray-100 text-gray-600 hover:bg-gray-100";
}

function parseJson(value: string | null): Record<string, any> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function fmtVal(v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.join(", ") || "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// Render "field: old → new" lines from the stored JSON diffs
function DiffChips({ entry }: { entry: AuditEntry }) {
  const oldObj = parseJson(entry.oldValue);
  const newObj = parseJson(entry.newValue);
  if (!oldObj && !newObj) return <span className="text-muted-foreground">—</span>;

  const keys = Array.from(new Set([...Object.keys(oldObj ?? {}), ...Object.keys(newObj ?? {})]));
  return (
    <div className="space-y-0.5">
      {keys.map((k) => (
        <div key={k} className="flex items-center gap-1.5 text-xs flex-wrap">
          <span className="font-mono text-muted-foreground">{k}:</span>
          {oldObj && k in oldObj && (
            <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300 max-w-[180px] truncate">
              {fmtVal(oldObj[k])}
            </span>
          )}
          {oldObj && k in oldObj && newObj && k in newObj && (
            <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
          )}
          {newObj && k in newObj && (
            <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300 max-w-[180px] truncate">
              {fmtVal(newObj[k])}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AuditLog() {
  const { token } = useAuth();
  const searchString = useSearch();

  const urlParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const [entityType, setEntityType] = useState(urlParams.get("entityType") ?? "all");
  const [userId, setUserId] = useState(urlParams.get("userId") ?? "all");
  const [startDate, setStartDate] = useState(urlParams.get("startDate") ?? "");
  const [endDate, setEndDate] = useState(urlParams.get("endDate") ?? "");
  const [search, setSearch] = useState(urlParams.get("search") ?? "");
  const [page, setPage] = useState(Number(urlParams.get("page")) || 1);
  const [isExporting, setIsExporting] = useState(false);

  // URL-persisted filters (shareable audit links)
  useEffect(() => {
    const p = new URLSearchParams();
    if (entityType !== "all") p.set("entityType", entityType);
    if (userId !== "all") p.set("userId", userId);
    if (startDate) p.set("startDate", startDate);
    if (endDate) p.set("endDate", endDate);
    if (search) p.set("search", search);
    if (page > 1) p.set("page", String(page));
    const qs = p.toString();
    window.history.replaceState(null, "", `/audit-log${qs ? `?${qs}` : ""}`);
  }, [entityType, userId, startDate, endDate, search, page]);

  const { data: users = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/users`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return res.json();
    },
  });

  const buildQuery = (pageNum: number, limit: number) => {
    const p = new URLSearchParams();
    p.set("page", String(pageNum));
    p.set("limit", String(limit));
    if (entityType !== "all") p.set("entityType", entityType);
    if (userId !== "all") p.set("userId", userId);
    if (startDate) p.set("startDate", startDate);
    if (endDate) p.set("endDate", endDate);
    if (search.trim()) p.set("search", search.trim());
    return p.toString();
  };

  const { data, isLoading } = useQuery<AuditResponse>({
    queryKey: ["audit-log", entityType, userId, startDate, endDate, search, page],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/audit-log?${buildQuery(page, PAGE_SIZE)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to load audit log");
      return res.json();
    },
  });

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const resetFilters = () => {
    setEntityType("all");
    setUserId("all");
    setStartDate("");
    setEndDate("");
    setSearch("");
    setPage(1);
  };

  // ─── Excel export — same filters, up to 2000 rows ─────────────────────────
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const all: AuditEntry[] = [];
      for (let p = 1; p <= 10; p++) {
        const res = await fetch(`${getApiUrl()}/audit-log?${buildQuery(p, 200)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) break;
        const chunk: AuditResponse = await res.json();
        all.push(...chunk.entries);
        if (all.length >= chunk.total || chunk.entries.length === 0) break;
      }

      const sheetData: any[][] = [
        ["Date", "Actor", "Entity", "Action", "Description", "Old Value", "New Value"],
      ];
      for (const e of all) {
        sheetData.push([
          format(new Date(e.createdAt), "yyyy-MM-dd HH:mm:ss"),
          e.actorName ?? (e.userId ? `User #${e.userId}` : "System"),
          e.entityType ?? "",
          e.type,
          e.description,
          e.oldValue ?? "",
          e.newValue ?? "",
        ]);
      }

      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      const headerStyle = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "274AB3" } },
        alignment: { horizontal: "center" },
      };
      for (let c = 0; c < sheetData[0].length; c++) {
        const ref = XLSX.utils.encode_cell({ r: 0, c });
        if (ws[ref]) ws[ref].s = headerStyle;
      }
      ws["!cols"] = [
        { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 24 }, { wch: 50 },
        { wch: 40 }, { wch: 40 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Audit Log");
      const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([buf], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Audit_Log_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const hasFilters =
    entityType !== "all" || userId !== "all" || startDate || endDate || search;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-slate-500" />
            Audit Log
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Who changed what, when — across requirements, test cases, tasks, execution, and verdicts
          </p>
        </div>
        <Button onClick={handleExport} variant="outline" className="gap-2" disabled={isExporting || total === 0}>
          {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Export Excel
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={entityType} onValueChange={(v) => { setEntityType(v); setPage(1); }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Entities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Entities</SelectItem>
            {ENTITY_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={userId} onValueChange={(v) => { setUserId(v); setPage(1); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Actors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actors</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
            className="w-38"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
            className="w-38"
          />
        </div>

        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search description..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-8"
          />
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={resetFilters} className="gap-1 text-muted-foreground">
            <X className="w-3.5 h-3.5" /> Clear
          </Button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <p className="text-sm">No audit entries match the selected filters.</p>
        </div>
      ) : (
        <>
          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[800px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Date</TableHead>
                  <TableHead className="w-36">Actor</TableHead>
                  <TableHead className="w-44">Action</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-72">Changes (Old → New)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(e.createdAt), "dd MMM yyyy HH:mm")}
                    </TableCell>
                    <TableCell className="text-sm">
                      {e.actorName ?? (e.userId ? `User #${e.userId}` : <span className="text-muted-foreground">System</span>)}
                    </TableCell>
                    <TableCell>
                      <Badge className={`${typeBadgeClass(e.type)} text-[10px] whitespace-nowrap`}>
                        {e.type.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{e.description}</TableCell>
                    <TableCell>
                      <DiffChips entry={e} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {total} entr{total !== 1 ? "ies" : "y"} · page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="gap-1"
              >
                <ChevronLeft className="w-4 h-4" /> Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="gap-1"
              >
                Next <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
