import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { useRoute, useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Plus,
  Save,
  Download,
  Upload,
  Trash2,
  FileSpreadsheet,
  Loader2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Sparkles,
  Search,
  X,
  Filter,
  BarChart,
  PieChart,
  Users,
  ExternalLink,
  Library,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  GripVertical,
  Tag,
  ArrowDownToLine,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import * as XLSX from "xlsx-js-style";
import { format } from "date-fns";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  fetchTestCases,
  saveTestCases,
  fetchModules,
  fetchUsers,
  fetchExecutionFiles,
  fetchTrackers,
  fetchRequirements,
  resolveRequirementByRedmine,
  type ExecutionTestCase,
  type ExecutionModule,
  type ExecutionUser,
  type TrackerOption,
  type RequirementOption,
} from "@/lib/execution-api";
import DefectCreationModal, { type DefectCreationResult } from "@/components/DefectCreationModal";

const RESULT_OPTIONS = [
  "Passed",
  "Failed",
  "Blocked",
  "In Progress",
  "Not Executed",
  "",
];

// Normalizes any casing/wording drift in a stored result value (e.g. a
// lowercase "pass" written by a data-fixup script) back to the canonical
// title-case label — display should never depend on every write path
// storing the exact same casing.
function normalizeResultValue(val: string | null | undefined): string {
  if (!val) return "";
  const clean = val.toLowerCase().trim();
  if (clean.includes("pass")) return "Passed";
  if (clean.includes("fail")) return "Failed";
  if (clean.includes("block")) return "Blocked";
  if (clean.includes("prog")) return "In Progress";
  if (clean.includes("exec") || clean.includes("res") || clean.includes("not")) return "Not Executed";
  return val.trim();
}

const RESULT_PILL_ACTIVE: Record<string, string> = {
  Passed: "bg-green-100 text-green-700 border-green-300",
  Failed: "bg-red-100 text-red-700 border-red-300",
  Blocked: "bg-orange-100 text-orange-700 border-orange-300",
  "In Progress": "bg-blue-100 text-blue-700 border-blue-300",
  "Not Executed": "bg-slate-100 text-slate-600 border-slate-300",
};

const RESULT_DOT_COLOR: Record<string, string> = {
  Passed: "bg-green-500",
  Failed: "bg-red-500",
  Blocked: "bg-orange-400",
  "In Progress": "bg-blue-400",
  "Not Executed": "bg-slate-300",
};

export type AppExecutionTestCase = ExecutionTestCase & { tracker?: string };

// Fields compared to detect drift between an execution copy and its linked library
// test case. Execution-only concerns (QA PIC, Result, Defect Number, QA Notes) are
// deliberately excluded — they always differ and shouldn't trigger a sync prompt.
const LIBRARY_COMPARE_FIELDS: { execField: keyof AppExecutionTestCase; libField: string }[] = [
  { execField: "caseName", libField: "title" },
  { execField: "scenario", libField: "scenario" },
  { execField: "preCondition", libField: "preconditions" },
  { execField: "testData", libField: "testData" },
  { execField: "testSteps", libField: "testSteps" },
  { execField: "expectedResult", libField: "expectedResult" },
  { execField: "moduleName", libField: "module" },
  { execField: "userStory", libField: "redmineUserStory" },
  { execField: "tracker", libField: "tracker" },
];

function getLibraryDrift(row: AppExecutionTestCase, lib: any | undefined | null): boolean {
  if (!lib) return false;
  return LIBRARY_COMPARE_FIELDS.some(
    ({ execField, libField }) => ((row[execField] as string) || "").trim() !== ((lib[libField] as string) || "").trim(),
  );
}

type ModuleProgress = { total: number; passed: number; failed: number; blocked: number; inProgress: number; notExecuted: number };

function getModuleProgress(rows: AppExecutionTestCase[]): ModuleProgress {
  const p: ModuleProgress = { total: rows.length, passed: 0, failed: 0, blocked: 0, inProgress: 0, notExecuted: 0 };
  for (const r of rows) {
    const res = (r.result || "").toLowerCase();
    if (res === "passed") p.passed++;
    else if (res === "failed") p.failed++;
    else if (res === "blocked") p.blocked++;
    else if (res === "in progress") p.inProgress++;
    else p.notExecuted++;
  }
  return p;
}

function groupByModule(rows: AppExecutionTestCase[]) {
  const map = new Map<string, AppExecutionTestCase[]>();
  for (const row of rows) {
    const key = row.moduleName?.trim() || "(No Module)";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  return Array.from(map.entries()).map(([name, rows]) => ({ name, rows }));
}

// Reorders the rows whose (stringified) ids are in `scopeIds` — moving `activeId` to
// `overId`'s position — while leaving every row outside the scope exactly where it was
// in `base`. Used for both the flat spreadsheet-view list and a single module's rows in
// tree view, so a drag never affects rows outside its own scope.
function reorderWithinScope(
  base: AppExecutionTestCase[],
  scopeIds: string[],
  activeId: string,
  overId: string,
): AppExecutionTestCase[] {
  const oldIndex = scopeIds.indexOf(activeId);
  const newIndex = scopeIds.indexOf(overId);
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return base;

  const reordered = arrayMove(scopeIds, oldIndex, newIndex);
  const rowByStringId = new Map(base.map((r) => [String(r.id), r]));
  const scopeSet = new Set(scopeIds);
  let cursor = 0;
  return base.map((row) =>
    scopeSet.has(String(row.id)) ? rowByStringId.get(reordered[cursor++])! : row,
  );
}

function MiniProgressBar({ data }: { data: ModuleProgress }) {
  if (!data || data.total === 0) return <span className="text-xs text-muted-foreground italic">No cases</span>;
  const pct = (n: number) => `${Math.round((n / data.total) * 100)}%`;
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex h-2 rounded-full overflow-hidden flex-1 bg-muted min-w-[80px]">
        {data.passed > 0 && <div className="bg-green-500" style={{ width: pct(data.passed) }} />}
        {data.failed > 0 && <div className="bg-red-500" style={{ width: pct(data.failed) }} />}
        {data.blocked > 0 && <div className="bg-orange-400" style={{ width: pct(data.blocked) }} />}
        {data.inProgress > 0 && <div className="bg-blue-400" style={{ width: pct(data.inProgress) }} />}
        {data.notExecuted > 0 && <div className="bg-muted-foreground/20" style={{ width: pct(data.notExecuted) }} />}
      </div>
      <div className="flex gap-1.5 text-[10px] whitespace-nowrap">
        {data.passed > 0 && <span className="text-green-700 font-medium">{data.passed}P</span>}
        {data.failed > 0 && <span className="text-red-700 font-medium">{data.failed}F</span>}
        {data.blocked > 0 && <span className="text-orange-600 font-medium">{data.blocked}B</span>}
        {data.inProgress > 0 && <span className="text-blue-600 font-medium">{data.inProgress}IP</span>}
        {data.notExecuted > 0 && <span className="text-muted-foreground">{data.notExecuted}NE</span>}
      </div>
    </div>
  );
}

function FilterDropdown({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs shrink-0">
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-semibold">
              {selected.length}
            </Badge>
          )}
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="flex flex-col gap-0.5 max-h-64 overflow-y-auto">
          {options.length === 0 ? (
            <span className="text-xs text-muted-foreground italic px-2 py-1">No options available</span>
          ) : (
            options.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-muted/60 cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 rounded border-gray-300"
                  checked={selected.includes(opt.value)}
                  onChange={() => onToggle(opt.value)}
                />
                {opt.label}
              </label>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DetailItem({ label, value, isCode, highlight }: { label: string; value?: string | null; isCode?: boolean; highlight?: boolean }) {
  if (!value) return (
    <div>
      <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">{label}</p>
      <p className="text-xs text-muted-foreground italic">—</p>
    </div>
  );
  return (
    <div>
      <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">{label}</p>
      {isCode ? (
        <pre className="text-xs bg-muted/50 rounded p-2 whitespace-pre-wrap font-mono leading-relaxed">{value}</pre>
      ) : highlight ? (
        <p className="text-xs bg-primary/5 border border-primary/20 rounded p-2 leading-relaxed">{value}</p>
      ) : (
        <p className="text-xs text-foreground leading-relaxed">{value}</p>
      )}
    </div>
  );
}

const COLUMN_MAPPINGS: Record<string, string[]> = {
  testCaseId: ["case id", "test case id", "tc id", "id"],
  userStory: [
    "redmine ticket id",
    "redmine user story",
    "user story",
    "story",
    "requirement",
    "requirement id",
  ],
  tracker: ["tracker"],
  scenario: ["scenario", "tracker scenario"],
  preCondition: [
    "pre condition",
    "preconditions",
    "pre-conditions",
    "precondition",
  ],
  caseName: ["case", "case name", "title"],
  testSteps: ["steps", "test steps", "testing steps"],
  testData: ["test data", "data"],
  expectedResult: ["expected result", "expected outcome", "expected results"],
  result: ["result", "status", "test result"],
  defectNumber: [
    "redmine defect ticket id",
    "redmine defect",
    "defect #",
    "defect id",
    "bug id",
    "redmine id",
    "redmine defect number",
  ],
  qaPic: ["qa pic", "qa owner", "tester", "assigned qa"],
  comments: [
    "additional/comments/issues",
    "additional / comments / issues",
    "comments",
    "additional",
    "issues",
    "remarks",
  ],
  moduleName: ["module name", "module", "feature"],
};

const getResultColorClass = (result?: string) => {
  switch (result?.toLowerCase()) {
    case "passed":
      return "bg-green-100 text-green-800 border-green-200";
    case "failed":
      return "bg-red-100 text-red-800 border-red-200";
    case "blocked":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "in progress":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "not executed":
    default:
      return "bg-muted/30 text-muted-foreground border-transparent";
  }
};

const tableInputClass =
  "h-full w-full text-xs md:text-xs font-sans rounded-none border-0 focus-visible:ring-1 focus-visible:ring-primary focus:z-10 bg-transparent shadow-none text-left px-2 py-2 min-h-[80px] resize-none block";

const parseDefectIds = (value: string): string[] =>
  value.split(/[\s,;]+/).map(s => s.trim()).filter(s => /^\d+$/.test(s));
const tableSelectClass =
  "w-full h-full min-h-[80px] px-2 text-xs font-sans bg-transparent border-0 outline-none focus:ring-1 focus:ring-primary focus:z-10 relative block";

interface ImportSummary {
  status: "Success" | "Partial Success" | "Failed";
  totalWorksheetsScanned: number;
  totalWorksheetsImported: number;
  totalRowsImported: number;
  totalRowsSkipped: number;
  missingColumns: string[];
  duplicateCaseIds: string[];
}

const CopilotTextarea = ({
  value: rawValue,
  onChange,
  fieldName,
  className,
  minHeight = "80px",
}: any) => {
  const value = rawValue ?? "";
  const [suggestion, setSuggestion] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const divRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const handler = setTimeout(async () => {
      if (value && isTyping) {
        try {
          const res = await fetch("/api/ai/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: `You are an inline AI autocomplete assistant for a QA tester writing a test case. Current field: ${fieldName}. Current text written so far: "${value}". Provide ONLY the next logical 3-10 words to continue or complete the thought. Do NOT repeat the existing text. Do NOT wrap in quotes. If the sentence is fully complete, return an empty string.`,
            }),
          });
          const data = await res.json();
          if (data.reply) {
            let rawReply = data.reply.replace(/^["']|["']$/g, "").trim();
            if (rawReply) {
              setSuggestion(
                (value.endsWith(" ") || value.endsWith("\n") ? "" : " ") +
                  rawReply,
              );
            }
          }
        } catch (e) {
          console.error("AI Auto-complete failed", e);
        }
      }
      setIsTyping(false);
    }, 600);

    return () => clearTimeout(handler);
  }, [value, isTyping, fieldName]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab" && suggestion) {
      e.preventDefault();
      onChange(value + suggestion);
      setSuggestion("");
    } else if (e.key === "Escape") {
      setSuggestion("");
    } else if (e.key !== "Shift" && e.key !== "Control" && e.key !== "Alt") {
      setIsTyping(true);
      setSuggestion("");
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
    if (divRef.current) {
      divRef.current.style.height = "auto";
      divRef.current.style.height = `${e.target.scrollHeight}px`;
    }
    onChange(e.target.value);
  };

  const handleBlur = () => {
    setSuggestion("");
    setIsTyping(false);
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      if (divRef.current) {
        divRef.current.style.height = "auto";
        divRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      }
    }
  }, []);

  return (
    <div className="relative w-full h-full group" style={{ minHeight }}>
      {isTyping && (
        <Sparkles className="absolute right-2 top-2 w-3 h-3 text-primary animate-pulse z-20 opacity-50" />
      )}

      <div
        ref={divRef}
        className={`absolute inset-0 pointer-events-none whitespace-pre-wrap break-words ${className}`}
        style={{ color: "transparent", zIndex: 1, minHeight }}
      >
        {value}
        <span className="text-muted-foreground/40 font-semibold select-none">
          {suggestion}
        </span>
      </div>

      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className={`relative z-10 bg-transparent w-full resize-none overflow-hidden ${className} outline-none border-none`}
        rows={1}
        style={{ minHeight }}
      />
    </div>
  );
};

// Auto-expanding textarea for table cells — matches font + size of CopilotTextarea
const TableAutoTextarea = ({
  value,
  onChange,
  className,
  ...props
}: React.ComponentProps<typeof Textarea>) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <Textarea
      ref={ref}
      value={value}
      className={className}
      onChange={(e) => {
        e.target.style.height = "auto";
        e.target.style.height = `${e.target.scrollHeight}px`;
        onChange?.(e);
      }}
      {...props}
    />
  );
};

// --- RESULT PILLS ---
const RESULT_PILLS = [
  { value: "Passed",       bg: "#E1F5EE", border: "#9FE1CB", color: "#085041" },
  { value: "Failed",       bg: "#FCEBEB", border: "#F7C1C1", color: "#791F1F" },
  { value: "Blocked",      bg: "#FAEEDA", border: "#FAC775", color: "#633806" },
  { value: "In Progress",  bg: "#E6F1FB", border: "#B5D4F4", color: "#0C447C" },
  { value: "Not Executed", bg: "transparent", border: "#B4B2A9", color: "#5F5E5A" },
];

function ResultPills({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1 p-1">
      {RESULT_PILLS.map(p => (
        <button
          key={p.value}
          type="button"
          disabled={disabled}
          onClick={() => !disabled && onChange(p.value)}
          style={{
            background: value === p.value ? p.bg : "transparent",
            border: `1.5px solid ${value === p.value ? p.border : "hsl(var(--border))"}`,
            color: value === p.value ? p.color : "hsl(var(--muted-foreground))",
            borderRadius: 20, padding: "2px 10px",
            fontSize: 11, fontWeight: value === p.value ? 500 : 400,
            cursor: disabled ? "default" : "pointer",
            opacity: disabled ? 0.6 : 1,
          }}
        >
          {p.value}
        </button>
      ))}
    </div>
  );
}

// --- MEMOIZED ROW COMPONENTS FOR PERFORMANCE ---
interface RowProps {
  row: AppExecutionTestCase;
  index: number;
  isSelected: boolean;
  onToggleSelect: (id: string | number, checked: boolean) => void;
  onUpdate: (
    id: string | number,
    field: keyof AppExecutionTestCase,
    value: string,
  ) => void;
  onDelete: (id: string | number) => void;
  onPromote: (row: AppExecutionTestCase) => void;
  onUpdateLibrary: (row: AppExecutionTestCase) => void;
  onPullLatest: (row: AppExecutionTestCase) => void;
  libraryDrift: boolean;
  onBlurRow: (id: string | number) => void;
  onAcknowledgeRevision: (id: string | number) => void;
  availableModules: ExecutionModule[];
  availableTrackers: TrackerOption[];
  qaUsers: ExecutionUser[];
  hiddenCols: Set<string>;
  currentUser: { id: number; name: string; role: string } | null;
  mode: "execute" | "edit";
  isDirty: boolean;
  dragDisabled?: boolean;
}

const DesktopTableRow = React.memo(
  ({
    row,
    index,
    isSelected,
    onToggleSelect,
    onUpdate,
    onDelete,
    onPromote,
    onUpdateLibrary,
    onPullLatest,
    libraryDrift,
    onBlurRow,
    onAcknowledgeRevision,
    availableModules,
    availableTrackers,
    qaUsers,
    hiddenCols,
    currentUser,
    mode,
    isDirty,
    dragDisabled,
  }: RowProps) => {
    const hide = (col: string) => hiddenCols.has(col);
    const defectIds = parseDefectIds(row.defectNumber || "");
    const readOnly = mode === "execute";

    const { setNodeRef, attributes, listeners, transform, transition } = useSortable({
      id: String(row.id),
      disabled: dragDisabled,
    });

    const roCell = (value: string | undefined) => (
      <span className="text-xs text-foreground whitespace-pre-wrap">{value || <span className="italic opacity-40">—</span>}</span>
    );

    const isQaMember = currentUser?.role === "qa_member";
    const isAssignedToMe = row.qaPic === currentUser?.name;
    const isUnassigned = !row.qaPic;
    const canEdit = !isQaMember || isAssignedToMe;

    if (row.rowType === "group") {
      return (
        <tr
          ref={setNodeRef}
          className="group bg-accent/30"
          style={{ transform: CSS.Transform.toString(transform), transition }}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              onBlurRow(row.id as string | number);
            }
          }}
        >
          <td colSpan={20} className="border border-border px-3 py-2">
            <div className="flex items-center gap-2">
              {!readOnly && !dragDisabled && (
                <button
                  type="button"
                  {...attributes}
                  {...listeners}
                  className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none shrink-0"
                  aria-label="Drag to reorder"
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </button>
              )}
              <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              {readOnly ? (
                <span className="text-sm font-medium">{row.caseName || "Untitled group"}</span>
              ) : (
                <input
                  className="flex-1 bg-transparent text-sm font-medium outline-none border-b border-dashed border-border focus:border-primary px-1"
                  value={row.caseName || ""}
                  placeholder="Group tag label"
                  onChange={(e) => onUpdate(row.id as string | number, "caseName", e.target.value)}
                />
              )}
              {!readOnly && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 ml-auto opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                  onClick={() => onDelete(row.id as string | number)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </td>
        </tr>
      );
    }

    return (
      <tr
        ref={setNodeRef}
        className={`hover:bg-muted/10 group align-top ${isQaMember && !canEdit ? "opacity-60" : ""}`}
        style={{
          borderLeft: isDirty ? "3px solid #378ADD" : "3px solid transparent",
          transform: CSS.Transform.toString(transform),
          transition,
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            onBlurRow(row.id as string | number);
          }
        }}
      >
        {!readOnly && (
          <td className="border border-border text-center text-xs font-sans text-muted-foreground bg-card py-2 sticky left-0 z-20">
            <div className="flex items-center justify-center gap-1">
              {!dragDisabled && (
                <button
                  type="button"
                  {...attributes}
                  {...listeners}
                  className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
                  aria-label="Drag to reorder"
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </button>
              )}
              <input type="checkbox" className="w-4 h-4 rounded border-gray-300 cursor-pointer"
                checked={isSelected} onChange={(e) => onToggleSelect(row.id as string | number, e.target.checked)} />
            </div>
          </td>
        )}
        {!readOnly && (
          <td className="border border-border p-0 align-top sticky left-10 z-20 bg-card">
            <select className={tableSelectClass} value={row.moduleName || ""} onChange={(e) => onUpdate(row.id as string, "moduleName", e.target.value)}>
              <option value="">Select...</option>
              {availableModules.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
          </td>
        )}
        {!hide("testCaseId") && (
          <td
            className="border border-border px-2 py-2 align-top sticky bg-card z-20"
            style={{ left: readOnly ? 0 : "14.5rem" }}
          >
            <span className="text-xs text-muted-foreground font-mono select-all">{row.caseId || row.testCaseId || "—"}</span>
          </td>
        )}
        {!hide("userStory") && (
          <td className="border border-border p-0 relative align-top">
            {readOnly
              ? <div className="px-2 py-2">{roCell(row.userStory)}</div>
              : <TableAutoTextarea className={tableInputClass} value={row.userStory || ""} onChange={(e) => onUpdate(row.id as string, "userStory", e.target.value)} />
            }
          </td>
        )}
        {!hide("tracker") && (
          <td className="border border-border p-0 relative align-top">
            {readOnly
              ? <div className="px-2 py-2">{roCell(row.tracker)}</div>
              : <select className={tableSelectClass} value={row.tracker || ""} onChange={(e) => onUpdate(row.id as string, "tracker", e.target.value)}>
                  <option value="">Select...</option>
                  {availableTrackers.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                  {row.tracker && !availableTrackers.some(t => t.name === row.tracker) && (
                    <option value={row.tracker}>{row.tracker}</option>
                  )}
                </select>
            }
          </td>
        )}
        {!hide("scenario") && (
          <td className="border border-border p-0 relative align-top">
            {readOnly
              ? <div className="px-2 py-2">{roCell(row.scenario)}</div>
              : <CopilotTextarea className={tableInputClass} value={row.scenario || ""} fieldName="Scenario" minHeight="80px" onChange={(val: string) => onUpdate(row.id as string, "scenario", val)} />
            }
          </td>
        )}
        {!hide("preCondition") && (
          <td className="border border-border p-0 relative align-top">
            {readOnly
              ? <div className="px-2 py-2">{roCell(row.preCondition)}</div>
              : <TableAutoTextarea className={tableInputClass} value={row.preCondition || ""} onChange={(e) => onUpdate(row.id as string, "preCondition", e.target.value)} />
            }
          </td>
        )}
        <td className="border border-border p-0 relative align-top">
          {readOnly
            ? <div className="px-2 py-2">{roCell(row.caseName)}</div>
            : <CopilotTextarea className={tableInputClass} value={row.caseName || ""} fieldName="Case Name" minHeight="80px" onChange={(val: string) => onUpdate(row.id as string, "caseName", val)} />
          }
        </td>
        <td className="border border-border p-0 relative align-top">
          {readOnly
            ? <div className="px-2 py-2">{roCell(row.testSteps)}</div>
            : <CopilotTextarea className={tableInputClass} value={row.testSteps || ""} fieldName="Test Steps" minHeight="80px" onChange={(val: string) => onUpdate(row.id as string, "testSteps", val)} />
          }
        </td>
        {!hide("testData") && (
          <td className="border border-border p-0 relative align-top">
            {readOnly
              ? <div className="px-2 py-2">{roCell(row.testData)}</div>
              : <TableAutoTextarea className={tableInputClass} value={row.testData || ""} onChange={(e) => onUpdate(row.id as string, "testData", e.target.value)} />
            }
          </td>
        )}
        <td className="border border-border p-0 relative align-top">
          {readOnly
            ? <div className="px-2 py-2">{roCell(row.expectedResult)}</div>
            : <CopilotTextarea className={tableInputClass} value={row.expectedResult || ""} fieldName="Expected Results" minHeight="80px" onChange={(val: string) => onUpdate(row.id as string, "expectedResult", val)} />
          }
        </td>
        <td className={`border border-border p-0 relative align-top transition-colors ${getResultColorClass(row.result)}`}>
          {canEdit ? (
            <ResultPills value={row.result || ""} onChange={(v) => onUpdate(row.id as string, "result", v)} disabled={!readOnly} />
          ) : (
            <span className="px-2 py-2 text-xs font-bold block">{row.result || "—"}</span>
          )}
          {row.alertRevised && (
            <button
              onClick={() => onAcknowledgeRevision(row.id as string | number)}
              className="mx-2 mb-1.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200 transition-colors flex items-center gap-1 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800"
              title="The linked requirement was revised since this was last executed — click to reset for retest"
            >
              <AlertTriangle className="w-2.5 h-2.5" /> Revised
            </button>
          )}
        </td>
        {!hide("executedAt") && !isQaMember && (
          <td className="border border-border px-2 py-2 align-top text-xs text-muted-foreground whitespace-nowrap min-w-[120px]">
            {row.executedAt ? format(new Date(row.executedAt), "dd MMM HH:mm") : "—"}
          </td>
        )}
        <td className="border border-border p-0 relative align-top">
          {defectIds.length > 0 && (
            <div className="px-2 pt-2 flex flex-wrap gap-x-2 gap-y-1">
              {defectIds.map(id => (
                <a key={id} href={`https://redmine.bestinet.my/issues/${id}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                  onClick={(e) => e.stopPropagation()}>
                  <ExternalLink className="w-3 h-3" />#{id}
                </a>
              ))}
            </div>
          )}
          {canEdit ? (
            <TableAutoTextarea
              className={`h-full w-full text-xs md:text-xs font-sans rounded-none border-0 focus-visible:ring-1 focus-visible:ring-primary focus:z-10 bg-transparent shadow-none text-left px-2 py-2 resize-none block ${defectIds.length > 0 ? "min-h-[36px]" : "min-h-[80px]"}`}
              value={row.defectNumber || ""}
              onChange={(e) => onUpdate(row.id as string, "defectNumber", e.target.value)}
              placeholder={defectIds.length > 0 ? "" : "e.g. 38032, 38033"}
            />
          ) : (
            <span className="px-2 py-2 text-xs block min-h-[36px]">{row.defectNumber || "—"}</span>
          )}
        </td>
        {!hide("comments") && (
          <td className="border border-border p-0 relative align-top">
            {canEdit ? (
              <TableAutoTextarea className={tableInputClass} value={row.comments || ""} onChange={(e) => onUpdate(row.id as string, "comments", e.target.value)} />
            ) : (
              <span className="px-2 py-2 text-xs block">{row.comments || "—"}</span>
            )}
          </td>
        )}
        <td className="border border-border p-0 relative align-top">
          {isQaMember ? (
            isAssignedToMe ? (
              <div className="flex items-center gap-1 px-2 py-2">
                <span className="text-xs font-medium truncate">{currentUser?.name}</span>
                <button
                  className="text-[10px] text-muted-foreground underline hover:text-destructive whitespace-nowrap"
                  onClick={() => onUpdate(row.id as string, "qaPic", "")}
                >
                  Unassign
                </button>
              </div>
            ) : isUnassigned ? (
              <div className="px-2 py-2">
                <button
                  className="text-xs px-2 py-1 rounded-full border border-primary text-primary hover:bg-primary/10 transition whitespace-nowrap"
                  onClick={() => onUpdate(row.id as string, "qaPic", currentUser?.name || "")}
                >
                  + Assign to me
                </button>
              </div>
            ) : (
              <span className="px-2 py-2 text-xs text-muted-foreground block">{row.qaPic}</span>
            )
          ) : (
            <select className={`${tableSelectClass}`} value={row.qaPic || ""} onChange={(e) => onUpdate(row.id as string, "qaPic", e.target.value)}>
              <option value="">Select QA PIC...</option>
              {qaUsers.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
            </select>
          )}
        </td>
        {!readOnly && (
          <td className="border border-border p-0 text-center align-top pt-2">
            <div className="flex flex-col items-center gap-1">
              {!row.libraryTcId ? (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Promote to Library"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-opacity"
                  onClick={() => onPromote(row)}
                >
                  <Library className="w-4 h-4" />
                </Button>
              ) : libraryDrift ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Update library test case with these changes"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-opacity"
                    onClick={() => onUpdateLibrary(row)}
                  >
                    <Library className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Pull latest from library"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-opacity"
                    onClick={() => onPullLatest(row)}
                  >
                    <ArrowDownToLine className="w-4 h-4" />
                  </Button>
                </>
              ) : null}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                onClick={() => onDelete(row.id as string | number)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </td>
        )}
      </tr>
    );
  },
);

const MobileCardRow = React.memo(
  ({
    row,
    index,
    isSelected,
    onToggleSelect,
    onUpdate,
    onDelete,
    onBlurRow,
    onAcknowledgeRevision,
    availableModules,
    availableTrackers,
    qaUsers,
    hiddenCols,
    currentUser,
    mode,
    isDirty,
  }: RowProps) => {
    const readOnly = mode === "execute";
    const isQaMember = currentUser?.role === "qa_member";
    const isAssignedToMe = row.qaPic === currentUser?.name;
    const isUnassigned = !row.qaPic;
    const canEdit = !isQaMember || isAssignedToMe;

    return (
      <Card
        className={`p-3 space-y-3 shadow-sm relative transition-colors ${isSelected ? "bg-primary/5 border-primary/30" : ""}`}
        style={{ borderLeft: isDirty ? "3px solid #378ADD" : undefined }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            onBlurRow(row.id as string | number);
          }
        }}
      >
        {!readOnly && (
          <div className="absolute top-2 right-2">
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive h-8 w-8"
              onClick={() => onDelete(row.id as string | number)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        )}

        <div className="flex items-center gap-2 mb-1">
          <input
            type="checkbox"
            className="w-4 h-4 rounded border-gray-300 cursor-pointer text-primary focus:ring-primary"
            checked={isSelected}
            onChange={(e) =>
              onToggleSelect(row.id as string | number, e.target.checked)
            }
          />
          <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs font-bold">
            #{index + 1}
          </span>
          <span className="font-semibold text-sm">Test Case</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground uppercase font-bold">
              Module
            </Label>
            <select
              className="flex min-h-[40px] w-full rounded-md border border-input bg-transparent px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1"
              value={row.moduleName || ""}
              onChange={(e) =>
                onUpdate(row.id as string, "moduleName", e.target.value)
              }
            >
              <option value="">Select...</option>
              {availableModules.map((m) => (
                <option key={m.id} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground uppercase font-bold">
              Result
            </Label>
            {canEdit ? (
              <ResultPills value={row.result || ""} onChange={(v) => onUpdate(row.id as string, "result", v)} disabled={!readOnly} />
            ) : (
              <div className={`flex min-h-[40px] items-center px-2 rounded-md border text-xs font-bold ${getResultColorClass(row.result)}`}>
                {row.result || "—"}
              </div>
            )}
            {row.alertRevised && (
              <button
                onClick={() => onAcknowledgeRevision(row.id as string | number)}
                className="mt-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200 transition-colors flex items-center gap-1 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800"
                title="The linked requirement was revised since this was last executed — click to reset for retest"
              >
                <AlertTriangle className="w-2.5 h-2.5" /> Revised
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground uppercase font-bold">
              Test Case ID
            </Label>
            <div className="min-h-[40px] flex items-center px-2 py-1 text-xs font-mono text-muted-foreground border border-input rounded-md bg-muted/20">
              {row.caseId || row.testCaseId || "—"}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground uppercase font-bold">
              Redmine Ticket ID
            </Label>
            {readOnly
              ? <p className="text-xs px-2 py-1 text-muted-foreground">{row.userStory || "—"}</p>
              : <TableAutoTextarea className="min-h-[60px] text-xs md:text-xs p-2" value={row.userStory || ""} onChange={(e) => onUpdate(row.id as string, "userStory", e.target.value)} />
            }
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground uppercase font-bold">
              Tracker
            </Label>
            {readOnly
              ? <p className="text-xs px-2 py-1 text-muted-foreground">{row.tracker || "—"}</p>
              : <select
                  className="flex min-h-[40px] w-full rounded-md border border-input bg-transparent px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1"
                  value={row.tracker || ""}
                  onChange={(e) => onUpdate(row.id as string, "tracker", e.target.value)}
                >
                  <option value="">Select...</option>
                  {availableTrackers.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                  {row.tracker && !availableTrackers.some(t => t.name === row.tracker) && (
                    <option value={row.tracker}>{row.tracker}</option>
                  )}
                </select>
            }
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground uppercase font-bold">
              Test Data
            </Label>
            {readOnly
              ? <p className="text-xs px-2 py-1 text-muted-foreground">{row.testData || "—"}</p>
              : <TableAutoTextarea className="min-h-[40px] text-xs md:text-xs p-2" value={row.testData || ""} onChange={(e) => onUpdate(row.id as string, "testData", e.target.value)} />
            }
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1">
            Scenario {!readOnly && <Sparkles className="w-3 h-3 text-primary" />}
          </Label>
          {readOnly
            ? <p className="text-xs px-2 py-1 text-muted-foreground whitespace-pre-wrap">{row.scenario || "—"}</p>
            : <div className="border border-input rounded-md focus-within:ring-1">
                <CopilotTextarea className="text-xs p-2 bg-transparent" value={row.scenario} fieldName="Scenario" minHeight="60px" onChange={(val: string) => onUpdate(row.id as string, "scenario", val)} />
              </div>
          }
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1">
            Case {!readOnly && <Sparkles className="w-3 h-3 text-primary" />}
          </Label>
          {readOnly
            ? <p className="text-xs px-2 py-1 text-muted-foreground whitespace-pre-wrap">{row.caseName || "—"}</p>
            : <div className="border border-input rounded-md focus-within:ring-1">
                <CopilotTextarea className="text-xs p-2 bg-transparent" value={row.caseName} fieldName="Case Name" minHeight="60px" onChange={(val: string) => onUpdate(row.id as string, "caseName", val)} />
              </div>
          }
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1">
            Steps {!readOnly && <Sparkles className="w-3 h-3 text-primary" />}
          </Label>
          {readOnly
            ? <p className="text-xs px-2 py-1 text-muted-foreground whitespace-pre-wrap">{row.testSteps || "—"}</p>
            : <div className="border border-input rounded-md focus-within:ring-1">
                <CopilotTextarea className="text-xs p-2 bg-transparent" value={row.testSteps} fieldName="Test Steps" minHeight="80px" onChange={(val: string) => onUpdate(row.id as string, "testSteps", val)} />
              </div>
          }
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1">
            Expected Result {!readOnly && <Sparkles className="w-3 h-3 text-primary" />}
          </Label>
          {readOnly
            ? <p className="text-xs px-2 py-1 text-muted-foreground whitespace-pre-wrap">{row.expectedResult || "—"}</p>
            : <div className="border border-input rounded-md focus-within:ring-1">
                <CopilotTextarea className="text-xs p-2 bg-transparent" value={row.expectedResult} fieldName="Expected Result" minHeight="60px" onChange={(val: string) => onUpdate(row.id as string, "expectedResult", val)} />
              </div>
          }
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2 border-t mt-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground uppercase font-bold">
              Redmine Defect Ticket ID
            </Label>
            {parseDefectIds(row.defectNumber || "").length > 0 && (
              <div className="flex flex-wrap gap-x-2 gap-y-1">
                {parseDefectIds(row.defectNumber || "").map(id => (
                  <a key={id} href={`https://redmine.bestinet.my/issues/${id}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                    onClick={(e) => e.stopPropagation()}>
                    <ExternalLink className="w-3 h-3" />#{id}
                  </a>
                ))}
              </div>
            )}
            {canEdit ? (
              <TableAutoTextarea
                className="min-h-[40px] text-xs md:text-xs p-2"
                value={row.defectNumber || ""}
                placeholder="e.g. 38032, 38033"
                onChange={(e) =>
                  onUpdate(row.id as string, "defectNumber", e.target.value)
                }
              />
            ) : (
              <div className="min-h-[40px] flex items-center px-2 text-xs text-muted-foreground border border-input rounded-md bg-muted/10">
                {row.defectNumber || "—"}
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground uppercase font-bold">
              QA PIC
            </Label>
            {isQaMember ? (
              isAssignedToMe ? (
                <div className="flex min-h-[40px] items-center gap-2 px-2 border border-input rounded-md">
                  <span className="text-xs font-medium">{currentUser?.name}</span>
                  <button
                    className="text-[10px] text-muted-foreground underline hover:text-destructive"
                    onClick={() => onUpdate(row.id as string, "qaPic", "")}
                  >
                    Unassign
                  </button>
                </div>
              ) : isUnassigned ? (
                <button
                  className="flex min-h-[40px] w-full items-center justify-center rounded-md border border-primary text-primary text-xs hover:bg-primary/10 transition"
                  onClick={() => onUpdate(row.id as string, "qaPic", currentUser?.name || "")}
                >
                  + Assign to me
                </button>
              ) : (
                <div className="flex min-h-[40px] items-center px-2 border border-input rounded-md bg-muted/10">
                  <span className="text-xs text-muted-foreground">{row.qaPic}</span>
                </div>
              )
            ) : (
              <select
                className="flex min-h-[40px] w-full rounded-md border border-input bg-transparent px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1"
                value={row.qaPic || ""}
                onChange={(e) =>
                  onUpdate(row.id as string, "qaPic", e.target.value)
                }
              >
                <option value="">Select QA PIC...</option>
                {qaUsers.map((u) => (
                  <option key={u.id} value={u.name}>
                    {u.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="space-y-1 pt-1">
          <Label className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1">
            QA Notes
          </Label>
          {canEdit ? (
            <TableAutoTextarea
              className="min-h-[40px] text-xs md:text-xs p-2"
              value={row.comments || ""}
              onChange={(e) =>
                onUpdate(row.id as string, "comments", e.target.value)
              }
            />
          ) : (
            <div className="min-h-[40px] flex items-center px-2 text-xs text-muted-foreground border border-input rounded-md bg-muted/10">
              {row.comments || "—"}
            </div>
          )}
        </div>
      </Card>
    );
  },
);

interface SortableTreeRowProps {
  row: AppExecutionTestCase;
  isSelected: boolean;
  onToggleSelect: (id: string | number, checked: boolean) => void;
  isTcOpen: boolean;
  onToggleTc: (id: string | number) => void;
  mode: "execute" | "edit";
  updateCell: (id: string | number, field: keyof AppExecutionTestCase, value: string) => void;
  availableModules: ExecutionModule[];
  requirementsList: RequirementOption[];
  qaUsers: ExecutionUser[];
  currentUser: { id: number; name: string; role: string } | null;
  dragDisabled?: boolean;
  onPromote: (row: AppExecutionTestCase) => void;
  onUpdateLibrary: (row: AppExecutionTestCase) => void;
  onPullLatest: (row: AppExecutionTestCase) => void;
  libraryDrift: boolean;
  onAcknowledgeRevision: (id: string | number) => void;
}

// Extracted from the tree-view module-row map so useSortable (a hook) can be called
// per-row without violating the rules of hooks inside a .map() callback.
const SortableTreeRow = React.memo(
  ({
    row,
    isSelected,
    onToggleSelect,
    isTcOpen,
    onToggleTc,
    mode,
    updateCell,
    availableModules,
    requirementsList,
    qaUsers,
    currentUser,
    dragDisabled,
    onPromote,
    onUpdateLibrary,
    onPullLatest,
    libraryDrift,
    onAcknowledgeRevision,
  }: SortableTreeRowProps) => {
    const isQaMember = currentUser?.role === "qa_member";
    const isAssignedToMe = row.qaPic === currentUser?.name;
    const isUnassigned = !row.qaPic;
    const canEdit = !isQaMember || isAssignedToMe;

    const { setNodeRef, attributes, listeners, transform, transition } = useSortable({
      id: String(row.id),
      disabled: dragDisabled,
    });

    if (row.rowType === "group") {
      return (
        <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
          <div className="flex items-center gap-3 px-6 py-2.5 bg-accent/30">
            {!dragDisabled && (
              <button
                type="button"
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none shrink-0"
                aria-label="Drag to reorder"
              >
                <GripVertical className="w-3.5 h-3.5" />
              </button>
            )}
            <div onClick={e => e.stopPropagation()}>
              <input type="checkbox" className="w-4 h-4 rounded border-gray-300 cursor-pointer"
                checked={isSelected}
                onChange={e => onToggleSelect(row.id as string | number, e.target.checked)} />
            </div>
            <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            {mode === "edit" ? (
              <input
                className="flex-1 bg-transparent text-sm font-medium outline-none border-b border-dashed border-border focus:border-primary px-1"
                value={row.caseName || ""}
                placeholder="Group tag label"
                onChange={(e) => updateCell(row.id as string | number, "caseName", e.target.value)}
              />
            ) : (
              <span className="text-sm font-medium">{row.caseName || "Untitled group"}</span>
            )}
          </div>
        </div>
      );
    }

    return (
      <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
        {/* TC summary row */}
        <div
          className={`flex items-center gap-3 px-6 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors ${isTcOpen ? "bg-muted/20 border-l-2 border-primary" : "border-l-2 border-transparent"} ${isQaMember && !canEdit ? "opacity-60" : ""}`}
          onClick={() => onToggleTc(row.id as string | number)}
        >
          {!dragDisabled && (
            <button
              type="button"
              {...attributes}
              {...listeners}
              onClick={(e) => e.stopPropagation()}
              className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none shrink-0"
              aria-label="Drag to reorder"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </button>
          )}
          <div onClick={e => e.stopPropagation()}>
            <input type="checkbox" className="w-4 h-4 rounded border-gray-300 cursor-pointer"
              checked={isSelected}
              onChange={e => onToggleSelect(row.id as string | number, e.target.checked)} />
          </div>
          {isTcOpen ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <span className="font-mono text-xs text-primary font-medium truncate">{row.caseId || row.testCaseId || "—"}</span>
            <span className="text-sm truncate text-foreground">{row.caseName || "Untitled"}</span>
          </div>
          {row.alertRevised && (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-label="Requirement revised — needs re-review" />
          )}
          <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium border shrink-0 ${RESULT_PILL_ACTIVE[normalizeResultValue(row.result)] || "bg-slate-100 text-slate-600 border-slate-300"}`}>
            {normalizeResultValue(row.result) || "Not Executed"}
          </span>
        </div>

        {/* Expanded detail panel — document style */}
        {isTcOpen && (() => {
          const parseLines = (t: string | undefined) => (t || "").split("\n").map(l => l.trim()).filter(Boolean);
          const steps = parseLines(row.testSteps);
          const expectations = parseLines(row.expectedResult);
          const getExpected = (i: number) => {
            if (expectations.length === 0) return "";
            if (expectations.length === 1) return i === Math.max(0, steps.length - 1) ? expectations[0] : "";
            return expectations[i] || "";
          };
          const displaySteps = steps.length > 0 ? steps : [""];
          const cellCls = "p-3 text-sm text-foreground whitespace-pre-wrap";
          const headCls = "p-2 text-[10px] font-bold uppercase text-muted-foreground bg-muted/50";
          const dividerX = "divide-x divide-border";
          const borderB = "border-b border-border";
          return (
            <div className="p-4 bg-muted/10 border-b border-muted">
              <div className="text-sm space-y-4">

                {/* Case */}
                <div>
                  <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Case {mode === "edit" && <Sparkles className="w-3 h-3 inline text-primary" />}</div>
                  {mode === "edit"
                    ? <CopilotTextarea className="min-h-[40px] text-sm" value={row.caseName || ""} fieldName="Case Name" minHeight="40px" onChange={(val: string) => updateCell(row.id as string | number, "caseName", val)} />
                    : <p className="text-sm">{row.caseName || "—"}</p>
                  }
                </div>

                {/* Requirement */}
                <div>
                  <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1 flex items-center gap-2">
                    Requirement
                    {row.requirementId ? (
                      <span className="text-[9px] normal-case font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">linked</span>
                    ) : (
                      <span className="text-[9px] normal-case font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">not linked</span>
                    )}
                  </div>
                  {mode === "edit" ? (
                    <SearchableSelect
                      value={row.requirementId != null ? String(row.requirementId) : ""}
                      onValueChange={(v) => updateCell(row.id as string | number, "requirementId", v)}
                      options={requirementsList.map((r) => ({
                        value: String(r.id),
                        label: r.redmineTicketId ? `#${r.redmineTicketId} — ${r.title}` : r.title,
                      }))}
                      placeholder="Search requirement by Redmine ID or title..."
                      searchPlaceholder="Search requirements..."
                      emptyText="No requirements found."
                    />
                  ) : (() => {
                    const linked = row.requirementId
                      ? requirementsList.find((r) => r.id === Number(row.requirementId))
                      : null;
                    return (
                      <p className="text-sm">
                        {linked ? (linked.redmineTicketId ? `#${linked.redmineTicketId} — ${linked.title}` : linked.title) : "—"}
                      </p>
                    );
                  })()}
                </div>

                {/* Row 1: Module | Scenario */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Module</div>
                    {mode === "edit"
                      ? <select className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1" value={row.moduleName || ""} onChange={e => updateCell(row.id as string | number, "moduleName", e.target.value)}>
                          <option value="">Select...</option>
                          {availableModules.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                        </select>
                      : <p className="text-sm">{row.moduleName || "—"}</p>
                    }
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Scenario {mode === "edit" && <Sparkles className="w-3 h-3 inline text-primary" />}</div>
                    {mode === "edit"
                      ? <CopilotTextarea className="min-h-[40px] text-sm" value={row.scenario || ""} fieldName="Scenario" minHeight="40px" onChange={(val: string) => updateCell(row.id as string | number, "scenario", val)} />
                      : <p className="text-sm whitespace-pre-wrap">{row.scenario || "—"}</p>
                    }
                  </div>
                </div>

                {/* Row 2: Pre-Condition | Test Data */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Pre-Condition {mode === "edit" && <Sparkles className="w-3 h-3 inline text-primary" />}</div>
                    {mode === "edit"
                      ? <CopilotTextarea className="min-h-[40px] text-sm" value={row.preCondition || ""} fieldName="Pre-Condition" minHeight="40px" onChange={(val: string) => updateCell(row.id as string | number, "preCondition", val)} />
                      : <p className="text-sm whitespace-pre-wrap">{row.preCondition || "—"}</p>
                    }
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Test Data {mode === "edit" && <Sparkles className="w-3 h-3 inline text-primary" />}</div>
                    {mode === "edit"
                      ? <CopilotTextarea className="min-h-[40px] text-sm" value={row.testData || ""} fieldName="Test Data" minHeight="40px" onChange={(val: string) => updateCell(row.id as string | number, "testData", val)} />
                      : <p className="text-sm whitespace-pre-wrap">{row.testData || "—"}</p>
                    }
                  </div>
                </div>

                {/* Steps table — bordered only here */}
                <div className="border border-border rounded-md overflow-hidden">
                  <div className={`grid grid-cols-2 ${dividerX} ${borderB}`}>
                    <div className={headCls}>Test Step {mode === "edit" && <Sparkles className="w-3 h-3 inline text-primary" />}</div>
                    <div className={headCls}>Expected Result {mode === "edit" && <Sparkles className="w-3 h-3 inline text-primary" />}</div>
                  </div>
                  {mode === "edit" ? (
                    <div className={`grid grid-cols-2 ${dividerX}`}>
                      <div className="p-3">
                        <CopilotTextarea className="min-h-[80px] text-sm" value={row.testSteps || ""} fieldName="Test Steps" minHeight="80px" onChange={(val: string) => updateCell(row.id as string | number, "testSteps", val)} />
                      </div>
                      <div className="p-3">
                        <CopilotTextarea className="min-h-[80px] text-sm" value={row.expectedResult || ""} fieldName="Expected Result" minHeight="80px" onChange={(val: string) => updateCell(row.id as string | number, "expectedResult", val)} />
                      </div>
                    </div>
                  ) : (
                    displaySteps.map((step, i) => (
                      <div key={i} className={`grid grid-cols-2 ${dividerX} ${i < displaySteps.length - 1 ? borderB : ""}`}>
                        <div className={cellCls}>{step || "—"}</div>
                        <div className={cellCls}>{getExpected(i) || ""}</div>
                      </div>
                    ))
                  )}
                </div>

                {/* Result | QA PIC */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase mb-2">Result</div>
                    {canEdit ? (
                      <div className="flex flex-wrap gap-1.5">
                        {(["Passed", "Failed", "Blocked", "In Progress", "Not Executed"] as const).map(status => (
                          <button key={status} onClick={() => updateCell(row.id as string | number, "result", status)}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${row.result === status ? RESULT_PILL_ACTIVE[status] : "bg-muted/40 border-border text-muted-foreground hover:bg-muted"}`}>
                            {status}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium border ${RESULT_PILL_ACTIVE[normalizeResultValue(row.result)] || "bg-slate-100 text-slate-600 border-slate-300"}`}>
                        {normalizeResultValue(row.result) || "Not Executed"}
                      </span>
                    )}
                    {row.alertRevised && (
                      <button
                        onClick={() => onAcknowledgeRevision(row.id as string | number)}
                        className="mt-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200 transition-colors flex items-center gap-1 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800"
                        title="The linked requirement was revised since this was last executed — click to reset for retest"
                      >
                        <AlertTriangle className="w-2.5 h-2.5" /> Revised
                      </button>
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase mb-2">QA PIC</div>
                    {isQaMember ? (
                      isAssignedToMe ? (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium">{currentUser?.name}</span>
                          <button className="text-xs text-muted-foreground underline hover:text-destructive" onClick={() => updateCell(row.id as string | number, "qaPic", "")}>Unassign</button>
                        </div>
                      ) : isUnassigned ? (
                        <button className="text-xs px-3 py-1 rounded-full border border-primary text-primary hover:bg-primary/10 transition" onClick={() => updateCell(row.id as string | number, "qaPic", currentUser?.name || "")}>
                          + Assign to me
                        </button>
                      ) : (
                        <span className="text-sm text-muted-foreground">{row.qaPic}</span>
                      )
                    ) : (
                      <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1" value={row.qaPic || ""} onChange={e => updateCell(row.id as string | number, "qaPic", e.target.value)}>
                        <option value="">Select QA PIC...</option>
                        {qaUsers.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                      </select>
                    )}
                  </div>
                </div>

                {/* Redmine Defect ID | QA Notes */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase mb-2">Redmine Defect ID</div>
                    {canEdit ? (
                      <Textarea className="min-h-[60px] text-sm" value={row.defectNumber || ""} placeholder="e.g. 38032, 38033" onChange={e => updateCell(row.id as string | number, "defectNumber", e.target.value)} />
                    ) : (
                      <p className="text-sm text-muted-foreground">{row.defectNumber || "—"}</p>
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase mb-2">QA Notes</div>
                    {canEdit ? (
                      <Textarea className="min-h-[60px] text-sm" value={row.comments || ""} onChange={e => updateCell(row.id as string | number, "comments", e.target.value)} />
                    ) : (
                      <p className="text-sm text-muted-foreground">{row.comments || "—"}</p>
                    )}
                  </div>
                </div>

                {mode === "edit" && (!row.libraryTcId || libraryDrift) && (
                  <div className="flex items-center gap-2 pt-1">
                    {!row.libraryTcId ? (
                      <Button variant="outline" size="sm" className="gap-2 h-7 text-xs" onClick={() => onPromote(row)}>
                        <Library className="w-3.5 h-3.5" /> Promote to Library
                      </Button>
                    ) : (
                      <>
                        <Button variant="outline" size="sm" className="gap-2 h-7 text-xs" onClick={() => onUpdateLibrary(row)}>
                          <Library className="w-3.5 h-3.5" /> Update Library TC
                        </Button>
                        <Button variant="outline" size="sm" className="gap-2 h-7 text-xs" onClick={() => onPullLatest(row)}>
                          <ArrowDownToLine className="w-3.5 h-3.5" /> Pull Latest from Library
                        </Button>
                      </>
                    )}
                  </div>
                )}

              </div>
            </div>
          );
        })()}
      </div>
    );
  },
);

export default function TestCasesExecutionProgressPage() {
  const [, params] = useRoute("/test-cases/execution/:id");
  const [, setLocation] = useLocation();
  const ticketId = params?.id || "Unknown";
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [availableModules, setAvailableModules] = useState<ExecutionModule[]>([]);
  const [availableTrackers, setAvailableTrackers] = useState<TrackerOption[]>([]);
  const [requirementsList, setRequirementsList] = useState<RequirementOption[]>([]);
  const [qaUsers, setQaUsers] = useState<ExecutionUser[]>([]);
  const [data, setData] = useState<AppExecutionTestCase[]>([]);
  // This file's own milestone, so an Excel import that auto-creates a
  // requirement (via resolveRequirementByRedmine) can inherit it instead of
  // leaving the new requirement milestone-less.
  const [currentFileMilestoneId, setCurrentFileMilestoneId] = useState<number | null>(null);
  const [currentFileId, setCurrentFileId] = useState<number | null>(null);
  const [currentFileProjectId, setCurrentFileProjectId] = useState<number | null>(null);
  const [currentFileTitle, setCurrentFileTitle] = useState<string | null>(null);
  const [currentFileTracker, setCurrentFileTracker] = useState<string | null>(null);
  // A file with no milestone can't record results — see the same guard on
  // the backend. Lets a user link one right here instead of hitting a save
  // error the first time they try to record a result.
  const [milestoneOptions, setMilestoneOptions] = useState<{ id: number; name: string }[]>([]);
  const [selectedMilestoneToLink, setSelectedMilestoneToLink] = useState<string>("");
  const [linkingMilestone, setLinkingMilestone] = useState(false);

  // Dirty tracking — only changed rows go out on auto-save
  const [dirtyRowIds, setDirtyRowIds] = useState<Set<string | number>>(new Set());
  const [deletedDbIds, setDeletedDbIds] = useState<Set<number>>(new Set());
  const dirtyRowIdsRef = useRef<Set<string | number>>(new Set());
  const deletedDbIdsRef = useRef<Set<number>>(new Set());

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(
    null,
  );

  // Pull from Test Cases library
  const [pullDialogOpen, setPullDialogOpen] = useState(false);
  const [libraryTestCases, setLibraryTestCases] = useState<any[]>([]);
  const libraryTcById = useMemo(
    () => new Map(libraryTestCases.map((tc) => [tc.id, tc])),
    [libraryTestCases],
  );
  const [libraryProjects, setLibraryProjects] = useState<any[]>([]);
  const [pullFilter, setPullFilter] = useState<{ projectId?: number; module?: string }>({});
  const [selectedPullIds, setSelectedPullIds] = useState<Set<number>>(new Set());
  const [isPulling, setIsPulling] = useState(false);
  const [isPullLoading, setIsPullLoading] = useState(false);

  const [pendingImportData, setPendingImportData] = useState<
    AppExecutionTestCase[] | null
  >(null);
  const [pendingImportSummary, setPendingImportSummary] =
    useState<ImportSummary | null>(null);
  const [showModuleSelectDialog, setShowModuleSelectDialog] = useState(false);
  const [selectedImportModule, setSelectedImportModule] = useState<string>("");

  const [selectedRows, setSelectedRows] = useState<(string | number)[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [rowsToDelete, setRowsToDelete] = useState<(string | number)[]>([]);

  // Promote to Library state
  const [promoteRow, setPromoteRow] = useState<AppExecutionTestCase | null>(null);
  const [promoteForm, setPromoteForm] = useState({ requirementId: "", projectId: "", module: "" });
  const [promoteRequirements, setPromoteRequirements] = useState<any[]>([]);
  const [isPromoting, setIsPromoting] = useState(false);

  // Tree mode state
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [expandedTcId, setExpandedTcId] = useState<string | number | null>(null);

  const toggleModule = (name: string) =>
    setExpandedModules(prev => { const s = new Set(prev); s.has(name) ? s.delete(name) : s.add(name); return s; });

  const toggleTc = (id: string | number) =>
    setExpandedTcId(prev => (prev === id ? null : id));

  // Search & Filtering State
  const [globalSearch, setGlobalSearch] = useState("");
  const [moduleFilters, setModuleFilters] = useState<string[]>([]);
  const [resultFilters, setResultFilters] = useState<string[]>([]);
  const [qaFilters, setQaFilters] = useState<string[]>([]);
  const hasSetDefaultQaFilter = useRef(false);

  // ?tc=<caseId> deep link (e.g. from the TC Library "In N runs" dialog):
  // pre-fill the search with the case ID and expand its module in tree view
  const searchString = useSearch();
  const tcParam = useMemo(
    () => new URLSearchParams(searchString).get("tc") ?? "",
    [searchString],
  );
  const hasAppliedTcParam = useRef(false);
  useEffect(() => {
    if (!tcParam || hasAppliedTcParam.current || data.length === 0) return;
    hasAppliedTcParam.current = true;
    setGlobalSearch(tcParam);
    const tcLower = tcParam.toLowerCase();
    setExpandedModules((prev) => {
      const next = new Set(prev);
      for (const row of data) {
        if (!row.moduleName) continue;
        const values = Object.values(row).map((v) => String(v).toLowerCase());
        if (values.some((v) => v.includes(tcLower))) next.add(row.moduleName);
      }
      return next;
    });
  }, [tcParam, data]);

  // Defect creation modal
  const [defectModalOpen, setDefectModalOpen] = useState(false);
  const [pendingFailRowId, setPendingFailRowId] = useState<string | number | null>(null);
  const pendingFailRowIdRef = useRef<string | number | null>(null);

  // Dismissible warning banners
  const [editWarningDismissed, setEditWarningDismissed] = useState(false);

  // Execute / Edit mode — always defaults to "execute" on file open
  const [mode, setMode] = useState<"execute" | "edit">("execute");

  // View layout preference — read from localStorage per user
  const [viewLayout, setViewLayout] = useState<"tree" | "spreadsheet" | "focus">(() => {
    const userId = currentUser?.id;
    if (!userId) return "tree";
    return (localStorage.getItem(`qa_pulse_exec_view_${userId}`) as "tree" | "spreadsheet" | "focus") ?? "tree";
  });

  // Focus view — master-detail layout (TestLink-style): tree on the left,
  // single test case detail on the right
  const [focusRowId, setFocusRowId] = useState<string | number | null>(null);
  // Modules default open in focus view — this tracks explicit user collapses only
  const [focusCollapsedModules, setFocusCollapsedModules] = useState<Set<string>>(new Set());

  // Column visibility — persisted per user in localStorage
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
    const userId = currentUser?.id;
    if (userId) {
      const saved = localStorage.getItem(`qa_pulse_hidden_cols_${userId}`);
      if (saved) try { return new Set(JSON.parse(saved)); } catch {}
    }
    return new Set(["tracker", "preCondition", "userStory"]);
  });
  const [showColPicker, setShowColPicker] = useState(false);

  useEffect(() => {
    const userId = currentUser?.id;
    if (userId) localStorage.setItem(`qa_pulse_hidden_cols_${userId}`, JSON.stringify([...hiddenCols]));
  }, [hiddenCols, currentUser?.id]);

  // CAPA Intelligence
  const [capaOpen, setCapaOpen] = useState(false);
  const [capaLoading, setCapaLoading] = useState(false);
  const [capaResult, setCapaResult] = useState<{ summary: string; items: any[] } | null>(null);

  const handleCapaAnalysis = async () => {
    setCapaOpen(true);
    setCapaLoading(true);
    setCapaResult(null);
    try {
      const res = await fetch("/api/ai/capa-analysis", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          ticketId,
          testCases: data.map(tc => ({
            testCaseId: tc.testCaseId,
            caseName: tc.caseName,
            moduleName: tc.moduleName,
            result: tc.result,
            defectNumber: tc.defectNumber,
            actualResult: tc.actualResult,
            comments: tc.comments,
          })),
        }),
      });
      if (res.ok) setCapaResult(await res.json());
    } catch {}
    finally { setCapaLoading(false); }
  };

  const getHeaders = () => {
    const token = localStorage.getItem("qa_pulse_token");
    return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  };

  useEffect(() => {
    Promise.all([
      fetchTestCases(ticketId),
      fetchModules(),
      fetchUsers(),
      fetchExecutionFiles(),
      fetchTrackers(),
      fetchRequirements(),
      fetch("/api/test-cases", { headers: getHeaders() }).then(r => r.ok ? r.json() : []),
    ])
      .then(([result, allModules, users, files, trackersData, requirementsData, libraryTcs]) => {
        setAvailableTrackers(trackersData || []);
        setRequirementsList(requirementsData || []);
        setLibraryTestCases(libraryTcs || []);
        const testCases = result?.testCases || [];
        const file = files.find((f) => String(f.redmineTicketId) === String(ticketId));
        setCurrentFileMilestoneId(file?.milestoneId ?? null);
        setCurrentFileId(file?.id ?? null);
        setCurrentFileProjectId(file?.projectId ?? null);
        setCurrentFileTitle(file?.title ?? null);
        setCurrentFileTracker(file?.tracker ?? null);
        const selectedModuleNames = file?.selectedModules
          ? file.selectedModules.split(",").map((m) => m.trim()).filter(Boolean)
          : [];

        const selectedModuleLower = selectedModuleNames.map(n => n.toLowerCase());
        const filteredModules =
          selectedModuleLower.length > 0
            ? allModules.filter((m) => selectedModuleLower.includes(m.name.trim().toLowerCase()))
            : allModules;

        if (testCases.length === 0) {
          const firstRow = createEmptyRow();
          if (selectedModuleNames.length === 1) firstRow.moduleName = selectedModuleNames[0];
          setData([firstRow]);
        } else {
          // Auto-fill empty module names when only one module is tied to the file
          const filled = selectedModuleNames.length === 1
            ? testCases.map((tc: any) => ({ ...tc, moduleName: tc.moduleName || selectedModuleNames[0] }))
            : testCases;
          setData(filled);
        }
        setAvailableModules(filteredModules);
        setQaUsers(users);
      })
      .catch(() =>
        toast({
          variant: "destructive",
          title: "Failed to load spreadsheet data",
        }),
      )
      .finally(() => setIsLoading(false));
  }, [ticketId, toast]);

  // Only needed to populate the "link a milestone" picker for a file that
  // doesn't have one yet — no point fetching this once it's already set.
  useEffect(() => {
    if (currentFileMilestoneId != null || !currentFileProjectId) return;
    fetch(`/api/milestones?projectId=${currentFileProjectId}`, { headers: getHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((ms) => setMilestoneOptions(Array.isArray(ms) ? ms.map((m: any) => ({ id: m.id, name: m.name })) : []))
      .catch(() => setMilestoneOptions([]));
  }, [currentFileMilestoneId, currentFileProjectId]);

  const linkMilestone = async () => {
    if (!currentFileId || !selectedMilestoneToLink) return;
    setLinkingMilestone(true);
    try {
      const res = await fetch(`/api/execution-files/${currentFileId}`, {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({ milestoneId: Number(selectedMilestoneToLink) }),
      });
      if (res.ok) {
        const updated = await res.json();
        setCurrentFileMilestoneId(updated.milestoneId ?? Number(selectedMilestoneToLink));
        toast({ title: "Milestone linked", description: "Test results can now be recorded on this execution file." });
      } else {
        const body = await res.json().catch(() => ({}));
        toast({ variant: "destructive", title: "Failed to link milestone", description: body.error });
      }
    } catch {
      toast({ variant: "destructive", title: "Failed to link milestone" });
    } finally {
      setLinkingMilestone(false);
    }
  };

  const createEmptyRow = (): AppExecutionTestCase => ({
    id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
    moduleName: "",
    testCaseId: "",
    libraryTcId: null,
    userStory: "",
    tracker: "",
    scenario: "",
    preCondition: "",
    caseName: "",
    testSteps: "",
    testData: "",
    expectedResult: "",
    result: "",
    defectNumber: "",
    comments: "",
    qaPic: "",
    rowType: "testcase",
  });

  const handleAddRow = () => {
    const row = createEmptyRow();
    if (availableModules.length === 1) row.moduleName = availableModules[0].name;
    setData((prev) => [...prev, row]);
    setDirtyRowIds((prev) => new Set([...prev, row.id]));
    setHasUnsavedChanges(true);
  };

  const handleAddGroupRow = () => {
    const row = { ...createEmptyRow(), rowType: "group" as const };
    if (availableModules.length === 1) row.moduleName = availableModules[0].name;
    setData((prev) => [...prev, row]);
    setDirtyRowIds((prev) => new Set([...prev, row.id]));
    setHasUnsavedChanges(true);
  };

  const updateCell = useCallback(
    (id: string | number, field: keyof AppExecutionTestCase, value: string) => {
      // Update ref immediately so blur-save and polling see it without waiting for useEffect
      dirtyRowIdsRef.current = new Set([...dirtyRowIdsRef.current, id]);
      setDirtyRowIds(dirtyRowIdsRef.current);
      if (field === "result") {
        const executedAt = value && value !== "Not Executed" ? new Date().toISOString() : undefined;
        setData((prev) => {
          const updated = prev.map((row) => row.id === id ? { ...row, result: value, ...(executedAt ? { executedAt } : {}) } : row);
          dataRef.current = updated;
          return updated;
        });
        setHasUnsavedChanges(true);
        if (value === "Failed") {
          pendingFailRowIdRef.current = id;
          setPendingFailRowId(id);
          setDefectModalOpen(true);
        }
        return;
      }
      setData((prev) => {
        const updated = prev.map((row) => (row.id === id ? { ...row, [field]: value } : row));
        dataRef.current = updated;
        return updated;
      });
      setHasUnsavedChanges(true);
    },
    [],
  );

  const handleDefectCreated = useCallback((result: DefectCreationResult) => {
    const rowId = pendingFailRowIdRef.current;
    if (!rowId) return;
    setData((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              defectNumber: (() => {
                const existing = parseDefectIds(row.defectNumber || "");
                if (!existing.includes(result.redmineIssueId)) existing.push(result.redmineIssueId);
                return existing.join(", ");
              })(),
              actualResult: result.actualResult,
              comments: result.actualResult
                ? [row.comments, `Actual Result(#${result.redmineIssueId}): ${result.actualResult}`].filter(Boolean).join("\n\n")
                : row.comments,
              defectScreenshots: result.screenshots,
            }
          : row,
      ),
    );
    setDirtyRowIds((prev) => new Set([...prev, rowId]));
    setHasUnsavedChanges(true);
    pendingFailRowIdRef.current = null;
    setPendingFailRowId(null);
  }, []);

  const handleSelectRow = useCallback(
    (id: string | number, checked: boolean) => {
      if (checked) {
        setSelectedRows((prev) => [...prev, id]);
      } else {
        setSelectedRows((prev) => prev.filter((rowId) => rowId !== id));
      }
    },
    [],
  );

  const requestSingleDelete = useCallback((id: string | number) => {
    setRowsToDelete([id]);
    setDeleteConfirmOpen(true);
  }, []);

  const dataRef = useRef(data);
  const unsavedRef = useRef(hasUnsavedChanges);

  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { unsavedRef.current = hasUnsavedChanges; }, [hasUnsavedChanges]);
  useEffect(() => { dirtyRowIdsRef.current = dirtyRowIds; }, [dirtyRowIds]);
  useEffect(() => { deletedDbIdsRef.current = deletedDbIds; }, [deletedDbIds]);

  // Saves all currently-dirty rows immediately (used by the periodic autosave below,
  // and by row-reorder so a drag persists right away instead of waiting up to 10s).
  const flushDirtyRows = useCallback(async () => {
    const dirty = dirtyRowIdsRef.current;
    const deleted = deletedDbIdsRef.current;
    if (dirty.size === 0 && deleted.size === 0) return;

    setSaveStatus("saving");
    try {
      const currentData = dataRef.current;
      const rowsToSave = currentData
        .filter((r) => dirty.has(r.id))
        .map((r) => ({
          ...r,
          _tempId: typeof r.id === "string" ? r.id : undefined,
          rowOrder: currentData.indexOf(r),
        }));
      const result = await saveTestCases(ticketId, rowsToSave as any, Array.from(deleted));
      if (result?.testCases) applyReturnedRows(result.testCases);
      setSaveStatus("saved");
      setLastSavedAt(new Date());
      setHasUnsavedChanges(false);
      dirtyRowIdsRef.current = new Set();
      setDirtyRowIds(new Set());
      deletedDbIdsRef.current = new Set();
      setDeletedDbIds(new Set());
    } catch {
      setSaveStatus("error");
    }
  }, [ticketId]);

  useEffect(() => {
    const interval = setInterval(() => { flushDirtyRows(); }, 10000);
    return () => clearInterval(interval);
  }, [flushDirtyRows]);

  // Reorders the rows whose ids are in `scopeIds` (either the whole visible list for the
  // spreadsheet view, or one module's rows for the tree view) and returns a dnd-kit
  // onDragEnd handler bound to that scope. Rows outside the scope keep their position.
  const applyRowReorder = useCallback((scopeIds: string[], activeId: string, overId: string) => {
    setData((prev) => {
      const newData = reorderWithinScope(prev, scopeIds, activeId, overId);
      if (newData === prev) return prev;
      const changed: (string | number)[] = [];
      newData.forEach((row, idx) => {
        if (prev[idx]?.id !== row.id) changed.push(row.id as string | number);
      });
      if (changed.length > 0) {
        dirtyRowIdsRef.current = new Set([...dirtyRowIdsRef.current, ...changed]);
        setDirtyRowIds(dirtyRowIdsRef.current);
        setHasUnsavedChanges(true);
      }
      dataRef.current = newData;
      return newData;
    });
    flushDirtyRows();
  }, [flushDirtyRows]);

  // Spreadsheet view: one fixed scope (the whole visible list).
  const handleDragEndForScope = useCallback((scopeIds: string[]) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (!scopeIds.includes(activeId) || !scopeIds.includes(overId)) return;
    applyRowReorder(scopeIds, activeId, overId);
  }, [applyRowReorder]);

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // Default QA filter: only for qa_member — show own rows + unassigned; other roles see everything
  useEffect(() => {
    if (!hasSetDefaultQaFilter.current && currentUser?.name) {
      hasSetDefaultQaFilter.current = true;
      if (currentUser.role === "qa_member") {
        setQaFilters([currentUser.name, ""]);
      }
    }
  }, [currentUser]);

  // Merge server rows into local state — skips dirty rows so unsaved changes aren't overwritten
  const mergeServerData = useCallback((serverRows: AppExecutionTestCase[]) => {
    setData((prev) => {
      const serverMap = new Map<number, AppExecutionTestCase>();
      for (const r of serverRows) {
        if (typeof r.id === "number") serverMap.set(r.id, r);
      }
      const dirty = dirtyRowIdsRef.current;
      const localNumericIds = new Set(
        prev.filter((r) => typeof r.id === "number").map((r) => r.id as number)
      );

      const merged: AppExecutionTestCase[] = [];
      for (const row of prev) {
        if (typeof row.id === "string") {
          merged.push(row); // unsaved local row — keep
        } else if (dirty.has(row.id)) {
          merged.push(row); // dirty — keep local version
        } else {
          const serverRow = serverMap.get(row.id as number);
          if (serverRow) merged.push(serverRow); // clean — use server version; omit if server deleted it
        }
      }
      // Add new rows from server that don't exist locally
      for (const serverRow of serverRows) {
        if (typeof serverRow.id === "number" && !localNumericIds.has(serverRow.id)) {
          merged.push(serverRow);
        }
      }
      // Sort by rowOrder
      merged.sort((a, b) => {
        const aO = typeof (a as any).rowOrder === "number" ? (a as any).rowOrder : Infinity;
        const bO = typeof (b as any).rowOrder === "number" ? (b as any).rowOrder : Infinity;
        return aO - bO;
      });

      dataRef.current = merged;
      return merged;
    });
  }, []);

  // Poll server every 8s for changes from other users
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const result = await fetchTestCases(ticketId);
        if (result?.testCases) mergeServerData(result.testCases as AppExecutionTestCase[]);
      } catch {
        // silent — don't interrupt user on background poll failure
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [ticketId, mergeServerData]);

  // Save a single row immediately when the user leaves it (blur)
  const saveBlurRow = useCallback(async (id: string | number) => {
    if (!dirtyRowIdsRef.current.has(id)) return;
    setSaveStatus("saving");
    try {
      const currentData = dataRef.current;
      const row = currentData.find((r) => r.id === id);
      if (!row) return;
      const rowToSave = {
        ...row,
        _tempId: typeof row.id === "string" ? row.id : undefined,
        rowOrder: currentData.indexOf(row),
      };
      const result = await saveTestCases(ticketId, [rowToSave as any], []);
      if (result?.testCases) applyReturnedRows(result.testCases);
      setSaveStatus("saved");
      setLastSavedAt(new Date());
      dirtyRowIdsRef.current = new Set([...dirtyRowIdsRef.current].filter((x) => x !== id));
      setDirtyRowIds(dirtyRowIdsRef.current);
      if (dirtyRowIdsRef.current.size === 0 && deletedDbIdsRef.current.size === 0) {
        setHasUnsavedChanges(false);
      }
    } catch {
      setSaveStatus("error");
    }
  }, [ticketId]);

  // CR023p4 — "Revised" action: resets result to Not Executed through the
  // existing save path (so it still logs to executionTcHistoryTable) and acks
  // this execution instance's requirement-revision alert.
  const acknowledgeRevision = useCallback(async (id: string | number) => {
    const now = new Date().toISOString();
    setData((prev) => {
      const updated = prev.map((row) =>
        row.id === id
          ? { ...row, result: "Not Executed", reviewAcknowledgedAt: now, alertRevised: false }
          : row,
      );
      dataRef.current = updated;
      return updated;
    });
    dirtyRowIdsRef.current = new Set([...dirtyRowIdsRef.current, id]);
    setDirtyRowIds(dirtyRowIdsRef.current);
    setSaveStatus("saving");
    try {
      const currentData = dataRef.current;
      const row = currentData.find((r) => r.id === id);
      if (!row) return;
      const rowToSave = {
        ...row,
        _tempId: typeof row.id === "string" ? row.id : undefined,
        rowOrder: currentData.indexOf(row),
      };
      const result = await saveTestCases(ticketId, [rowToSave as any], []);
      if (result?.testCases) applyReturnedRows(result.testCases);
      setSaveStatus("saved");
      setLastSavedAt(new Date());
      dirtyRowIdsRef.current = new Set([...dirtyRowIdsRef.current].filter((x) => x !== id));
      setDirtyRowIds(dirtyRowIdsRef.current);
    } catch {
      setSaveStatus("error");
    }
  }, [ticketId]);

  const openPullDialog = async () => {
    setPullDialogOpen(true);
    setPullFilter({});
    setSelectedPullIds(new Set());
    setIsPullLoading(true);
    try {
      const [tcRes, projRes] = await Promise.all([
        fetch("/api/test-cases", { headers: getHeaders() }),
        fetch("/api/projects", { headers: getHeaders() }),
      ]);
      setLibraryTestCases(tcRes.ok ? await tcRes.json() : []);
      setLibraryProjects(projRes.ok ? await projRes.json() : []);
    } catch {
      toast({ variant: "destructive", title: "Failed to load test case library" });
    } finally {
      setIsPullLoading(false);
    }
  };

  const handleConfirmPull = () => {
    setIsPulling(true);
    const toPull = libraryTestCases.filter((tc: any) => selectedPullIds.has(tc.id));
    const newRows: AppExecutionTestCase[] = toPull.map((tc: any) => ({
      ...createEmptyRow(),
      moduleName: tc.module || "",
      caseName: tc.title || "",
      testSteps: tc.testSteps || "",
      expectedResult: tc.expectedResult || "",
      preCondition: tc.preConditions || "",
      libraryTcId: tc.id,
    }));
    setData(prev => [...prev, ...newRows]);
    setDirtyRowIds(prev => new Set([...prev, ...newRows.map(r => r.id)]));
    setHasUnsavedChanges(true);
    toast({ title: `${newRows.length} test case${newRows.length !== 1 ? "s" : ""} pulled from library` });
    setPullDialogOpen(false);
    setSelectedPullIds(new Set());
    setIsPulling(false);
  };

  const applyReturnedRows = (savedRows: any[]) => {
    if (!savedRows || savedRows.length === 0) return;
    // Server only returns newly inserted rows, keyed by _tempId (the client's temp string ID)
    const tempIdMap = new Map<string, any>(
      savedRows.filter((r) => r._tempId).map((r) => [r._tempId, r]),
    );
    if (tempIdMap.size === 0) return;

    // If the pending-fail row had a temp ID, update the ref to the real DB ID
    if (pendingFailRowIdRef.current !== null && typeof pendingFailRowIdRef.current === "string") {
      const mapped = tempIdMap.get(pendingFailRowIdRef.current);
      if (mapped) {
        pendingFailRowIdRef.current = mapped.id;
        setPendingFailRowId(mapped.id);
      }
    }

    setData((prev) =>
      prev.map((row) => {
        if (typeof row.id !== "string") return row;
        const mapped = tempIdMap.get(row.id);
        if (!mapped) return row;
        return {
          ...row,
          id: mapped.id,
          testCaseId: mapped.testCaseId ?? row.testCaseId,
          libraryTcId: mapped.libraryTcId ?? row.libraryTcId,
        };
      }),
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus("saving");
    try {
      // Full sync: send all rows with isFullSync so orphaned DB rows are cleaned up
      const allRows = data.map((r, idx) => ({
        ...r,
        _tempId: typeof r.id === "string" ? r.id : undefined,
        rowOrder: idx,
      }));
      const result = await saveTestCases(ticketId, allRows as any, Array.from(deletedDbIds), true);
      if (result?.testCases) applyReturnedRows(result.testCases);
      toast({ title: `Database saved for Redmine Ticket ID #${ticketId}` });
      setHasUnsavedChanges(false);
      setSaveStatus("saved");
      setLastSavedAt(new Date());
      setDirtyRowIds(new Set());
      setDeletedDbIds(new Set());
    } catch {
      toast({ variant: "destructive", title: "Failed to save to database" });
      setSaveStatus("error");
    } finally {
      setIsSaving(false);
    }
  };

  // Search & Filter Logic
  const toggleFilter = (type: "module" | "result" | "qa", value: string) => {
    if (type === "module") {
      setModuleFilters((prev) =>
        prev.includes(value)
          ? prev.filter((v) => v !== value)
          : [...prev, value],
      );
    } else if (type === "result") {
      setResultFilters((prev) =>
        prev.includes(value)
          ? prev.filter((v) => v !== value)
          : [...prev, value],
      );
    } else if (type === "qa") {
      setQaFilters((prev) =>
        prev.includes(value)
          ? prev.filter((v) => v !== value)
          : [...prev, value],
      );
    }
  };

  const filteredData = useMemo(() => {
    return data
      .filter((row) => {
        if (globalSearch.trim()) {
          const searchLower = globalSearch.toLowerCase();
          const rowValues = Object.values(row).map((v) => String(v).toLowerCase());
          if (!rowValues.some((v) => v.includes(searchLower))) return false;
        }
        if (moduleFilters.length > 0) {
          if (!moduleFilters.includes(row.moduleName || "")) return false;
        }
        if (resultFilters.length > 0) {
          if (!resultFilters.includes(row.result || "")) return false;
        }
        if (qaFilters.length > 0) {
          if (!qaFilters.includes(row.qaPic || "")) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aO = typeof (a as any).rowOrder === "number" ? (a as any).rowOrder : Infinity;
        const bO = typeof (b as any).rowOrder === "number" ? (b as any).rowOrder : Infinity;
        return aO - bO;
      });
  }, [data, globalSearch, moduleFilters, resultFilters, qaFilters]);

  // Focus view: keep the selection valid as filters/data change, defaulting to the first row
  useEffect(() => {
    if (viewLayout !== "focus") return;
    if (focusRowId !== null && filteredData.some((r) => r.id === focusRowId)) return;
    setFocusRowId(filteredData.length > 0 ? filteredData[0].id ?? null : null);
  }, [viewLayout, filteredData, focusRowId]);

  const focusRow = focusRowId !== null ? filteredData.find((r) => r.id === focusRowId) ?? null : null;
  const focusIndex = focusRow ? filteredData.findIndex((r) => r.id === focusRow.id) : -1;

  const goToFocusOffset = (offset: number) => {
    if (focusIndex === -1 || filteredData.length === 0) return;
    const next = filteredData[Math.min(Math.max(focusIndex + offset, 0), filteredData.length - 1)];
    if (next) setFocusRowId(next.id ?? null);
  };

  // Tree view: scope is whichever module the dragged row belongs to, resolved per-drag
  // since rows from different modules' SortableContexts share one page-level DndContext.
  const handleTreeDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const activeRow = filteredData.find((r) => String(r.id) === activeId);
    if (!activeRow) return;
    const moduleKey = activeRow.moduleName?.trim() || "(No Module)";
    const scopeIds = filteredData
      .filter((r) => (r.moduleName?.trim() || "(No Module)") === moduleKey)
      .map((r) => String(r.id));
    if (!scopeIds.includes(overId)) return; // reject drags across modules
    applyRowReorder(scopeIds, activeId, overId);
  }, [filteredData, applyRowReorder]);

  // Summary Statistics
  const summaryStats = useMemo(() => {
    let totalExecuted = 0;
    let totalUnexecuted = 0;
    const resultsCount: Record<string, number> = {};
    const qaCount: Record<string, number> = {};

    filteredData.forEach((row) => {
      if (
        !row.result ||
        row.result === "Not Executed" ||
        row.result === "Pending" ||
        row.result === "In Progress"
      ) {
        totalUnexecuted++;
      } else {
        totalExecuted++;
      }

      const resKey = row.result || "Pending";
      resultsCount[resKey] = (resultsCount[resKey] || 0) + 1;

      const qaKey = row.qaPic || "Unassigned";
      qaCount[qaKey] = (qaCount[qaKey] || 0) + 1;
    });

    return { totalExecuted, totalUnexecuted, resultsCount, qaCount };
  }, [filteredData]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRows(filteredData.map((row) => row.id as string | number));
    } else {
      setSelectedRows([]);
    }
  };

  const confirmDeleteMulti = (ids: (string | number)[]) => {
    setRowsToDelete(ids);
    setDeleteConfirmOpen(true);
  };

  const executeDelete = () => {
    // Collect DB IDs of rows being deleted so the server removes them
    const numericIds = rowsToDelete.filter((id) => typeof id === "number") as number[];
    if (numericIds.length > 0) {
      setDeletedDbIds((prev) => new Set([...prev, ...numericIds]));
    }
    // Remove deleted rows from dirty tracking
    setDirtyRowIds((prev) => {
      const next = new Set(prev);
      rowsToDelete.forEach((id) => next.delete(id));
      return next;
    });
    setData((prev) =>
      prev.filter((row) => !rowsToDelete.includes(row.id as string | number)),
    );
    setSelectedRows((prev) => prev.filter((id) => !rowsToDelete.includes(id)));
    setDeleteConfirmOpen(false);
    setRowsToDelete([]);
    setHasUnsavedChanges(true);
  };

  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadExcel = async () => {
    if (!ticketId || isDownloading) return;
    setIsDownloading(true);
    try {
      const params = new URLSearchParams();
      if (currentFileTitle) params.set("issueSubject", currentFileTitle);
      if (currentFileTracker) params.set("issueType", currentFileTracker);
      if (currentUser?.name) params.set("senderName", currentUser.name);

      const token = localStorage.getItem("qa_pulse_token");
      const res = await fetch(
        `/api/execution-files/${ticketId}/download-excel?${params.toString()}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Download failed" }));
        toast({ variant: "destructive", title: err.error ?? "Download failed" });
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      a.href = url;
      a.download = filenameMatch?.[1] ?? `TC_${ticketId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast({ variant: "destructive", title: "Download failed" });
    } finally {
      setIsDownloading(false);
    }
  };

  // ─── Promote to Library ────────────────────────────────────────────────────
  const openPromoteDialog = async (row: AppExecutionTestCase) => {
    setPromoteRow(row);
    setPromoteForm({
      requirementId: "",
      projectId: "",
      module: row.moduleName || "",
    });
    // Lazy-load requirements and projects if not yet loaded
    if (promoteRequirements.length === 0) {
      const [reqRes, projRes] = await Promise.all([
        fetch("/api/requirements", { headers: getHeaders() }),
        fetch("/api/projects", { headers: getHeaders() }),
      ]);
      if (reqRes.ok) setPromoteRequirements(await reqRes.json());
      if (projRes.ok && libraryProjects.length === 0) setLibraryProjects(await projRes.json());
    } else if (libraryProjects.length === 0) {
      const projRes = await fetch("/api/projects", { headers: getHeaders() });
      if (projRes.ok) setLibraryProjects(await projRes.json());
    }
  };

  const handlePromote = async () => {
    if (!promoteRow || !promoteForm.projectId || !promoteForm.module) return;
    setIsPromoting(true);
    try {
      const token = localStorage.getItem("qa_pulse_token");
      const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const body: Record<string, any> = {
        title: promoteRow.caseName || promoteRow.scenario || "Untitled",
        testSteps: promoteRow.testSteps || undefined,
        expectedResult: promoteRow.expectedResult || undefined,
        preconditions: promoteRow.preCondition || undefined,
        scenario: promoteRow.scenario || undefined,
        testData: promoteRow.testData || undefined,
        tracker: promoteRow.tracker || undefined,
        redmineUserStory: promoteRow.userStory || undefined,
        comments: promoteRow.comments || undefined,
        qaPic: promoteRow.qaPic || undefined,
        module: promoteForm.module,
        projectId: Number(promoteForm.projectId),
        requirementId: promoteForm.requirementId ? Number(promoteForm.requirementId) : undefined,
        authorId: currentUser?.id,
      };
      const res = await fetch("/api/test-cases", { method: "POST", headers, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Failed to create library test case");
      const created = await res.json();

      // Link execution row to the new library TC
      setData(prev =>
        prev.map(r => r.id === promoteRow.id ? { ...r, libraryTcId: created.id } : r)
      );
      setDirtyRowIds(prev => new Set([...prev, promoteRow.id]));
      setHasUnsavedChanges(true);
      setPromoteRow(null);
      toast({ title: `Promoted to library successfully` });
    } catch {
      toast({ variant: "destructive", title: "Failed to promote test case to library" });
    } finally {
      setIsPromoting(false);
    }
  };

  // Push this execution copy's definitional fields up to the already-linked library
  // test case (the "there's drift" counterpart to the create-new promote flow above).
  const handleUpdateLibraryFromExecution = async (row: AppExecutionTestCase) => {
    if (!row.libraryTcId) return;
    try {
      const body = {
        title: row.caseName || row.scenario || "Untitled",
        scenario: row.scenario || undefined,
        preconditions: row.preCondition || undefined,
        testData: row.testData || undefined,
        testSteps: row.testSteps || undefined,
        expectedResult: row.expectedResult || undefined,
        module: row.moduleName || undefined,
        redmineUserStory: row.userStory || undefined,
        tracker: row.tracker || undefined,
      };
      const res = await fetch(`/api/test-cases/${row.libraryTcId}`, {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update library test case");
      const updated = await res.json();
      setLibraryTestCases((prev) => prev.map((tc) => (tc.id === updated.id ? updated : tc)));
      toast({ title: "Library test case updated" });
    } catch {
      toast({ variant: "destructive", title: "Failed to update library test case" });
    }
  };

  // Overwrite this execution copy's definitional fields from the linked library test
  // case's current content — the reverse direction of the update-library flow above.
  const handlePullLatestFromLibrary = (row: AppExecutionTestCase) => {
    const lib = row.libraryTcId ? libraryTcById.get(row.libraryTcId) : null;
    if (!lib) return;
    setData((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? {
              ...r,
              caseName: lib.title || "",
              scenario: lib.scenario || "",
              preCondition: lib.preconditions || "",
              testData: lib.testData || "",
              testSteps: lib.testSteps || "",
              expectedResult: lib.expectedResult || "",
              moduleName: lib.module || r.moduleName,
              userStory: lib.redmineUserStory || "",
              tracker: lib.tracker || "",
            }
          : r,
      ),
    );
    dirtyRowIdsRef.current = new Set([...dirtyRowIdsRef.current, row.id as string | number]);
    setDirtyRowIds(dirtyRowIdsRef.current);
    setHasUnsavedChanges(true);
    toast({ title: "Pulled latest from library — remember to Save" });
  };

  const normalizeHeader = (val: any) => {
    if (typeof val !== "string") return "";
    return val
      .toLowerCase()
      .replace(/[\n\r\t]/g, " ")
      .trim();
  };


  // --- NEW: Robust Case-Insensitive QA Matching ---
  const normalizeQAValue = (val: string) => {
    if (!val) return "";
    const clean = val.toLowerCase().trim();

    // 1. Hardcoded aliases (keys MUST be strictly lowercase to match `clean`)
    const map: Record<string, string> = {
      qinah: "Qinah",
      qina: "Qinah",
      syasya: "Syasya",
      sya2: "Syasya",
      raimi: "Raimi Rosman",
      rai: "Raihan",
    };

    if (map[clean]) return map[clean];

    // 2. Dynamic, case-insensitive match against the actual db list of users
    const existingUser = qaUsers.find((u) => u.name.toLowerCase() === clean);
    if (existingUser) return existingUser.name;

    // 3. Fallback to original
    return val.trim();
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: "array" });

      let totalRowsImported = 0;
      let totalRowsSkipped = 0;
      let totalWorksheetsImported = 0;
      const missingColumnsSet = new Set<string>();
      const duplicateCaseIdsSet = new Set<string>();
      const seenCaseIds = new Set<string>();
      const consolidatedData: AppExecutionTestCase[] = [];

      const allRequiredKeys = Object.keys(COLUMN_MAPPINGS).filter(
        (k) => k !== "moduleName",
      );
      const MIN_REQUIRED_COLUMNS = 7;

      for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];

        if (sheet["!merges"]) {
          sheet["!merges"].forEach((merge: any) => {
            const startCell = XLSX.utils.encode_cell({
              c: merge.s.c,
              r: merge.s.r,
            });
            const val = sheet[startCell] ? sheet[startCell].v : undefined;
            if (val !== undefined) {
              for (let R = merge.s.r; R <= merge.e.r; ++R) {
                for (let C = merge.s.c; C <= merge.e.c; ++C) {
                  const cellRef = XLSX.utils.encode_cell({ c: C, r: R });
                  if (!sheet[cellRef]) {
                    sheet[cellRef] = { t: "s", v: val };
                  } else {
                    sheet[cellRef].v = val;
                  }
                }
              }
            }
          });
        }

        const rawData = XLSX.utils.sheet_to_json<any[]>(sheet, {
          header: 1,
          blankrows: false,
          raw: false,
        });

        if (rawData.length === 0) continue;

        let headerRowIndex = -1;
        let bestMatchCount = 0;
        let columnMapIndex: Record<string, number> = {};

        for (let r = 0; r < Math.min(rawData.length, 30); r++) {
          const row = rawData[r];
          if (!Array.isArray(row)) continue;

          let currentMatchCount = 0;
          let currentMap: Record<string, number> = {};

          row.forEach((cellValue, colIndex) => {
            const normalizedCell = normalizeHeader(cellValue);
            if (!normalizedCell) return;

            for (const [key, synonyms] of Object.entries(COLUMN_MAPPINGS)) {
              if (synonyms.includes(normalizedCell)) {
                currentMap[key] = colIndex;
                currentMatchCount++;
                break;
              }
            }
          });

          const hasCoreTestColumns =
            currentMap["testCaseId"] !== undefined &&
            currentMap["testSteps"] !== undefined &&
            currentMap["expectedResult"] !== undefined;

          if (currentMatchCount >= MIN_REQUIRED_COLUMNS && hasCoreTestColumns) {
            if (currentMatchCount > bestMatchCount) {
              bestMatchCount = currentMatchCount;
              columnMapIndex = currentMap;
              headerRowIndex = r;
            }
          }
        }

        if (headerRowIndex === -1) continue;

        totalWorksheetsImported++;

        allRequiredKeys.forEach((k) => {
          if (columnMapIndex[k] === undefined) missingColumnsSet.add(k);
        });

        for (let r = headerRowIndex + 1; r < rawData.length; r++) {
          const row = rawData[r];

          if (!row || row.length === 0) {
            totalRowsSkipped++;
            continue;
          }

          const extracted: Record<string, string> = {};
          let hasMeaningfulData = false;

          for (const [key, colIdx] of Object.entries(columnMapIndex)) {
            const val = row[colIdx];
            if (
              val !== undefined &&
              val !== null &&
              String(val).trim() !== ""
            ) {
              extracted[key] = String(val).trim();
              hasMeaningfulData = true;
            } else {
              extracted[key] = "";
            }
          }

          const extractedValues = Object.values(extracted).filter(
            (v) => v !== "",
          );

          // If every mapped column extracted the same non-empty value, this is a merged
          // banner/section-divider row (e.g. "Complete Profile Registration") — import it
          // as a Group Tag row rather than folding it into Module.
          if (
            extractedValues.length > 1 &&
            extractedValues.every((val) => val === extractedValues[0])
          ) {
            consolidatedData.push({
              id: Date.now().toString() + Math.random().toString(36).substring(2, 8),
              rowType: "group",
              moduleName: extracted.moduleName || "",
              testCaseId: "",
              userStory: "",
              tracker: "",
              scenario: "",
              preCondition: "",
              caseName: extractedValues[0],
              testSteps: "",
              testData: "",
              expectedResult: "",
              result: "",
              defectNumber: "",
              comments: "",
              qaPic: "",
            });
            totalRowsImported++;
            continue;
          }

          if (!hasMeaningfulData) {
            totalRowsSkipped++;
            continue;
          }

          const cid = extracted.testCaseId;
          if (cid) {
            if (seenCaseIds.has(cid)) {
              duplicateCaseIdsSet.add(cid);
            } else {
              seenCaseIds.add(cid);
            }
          }

          consolidatedData.push({
            id:
              Date.now().toString() +
              Math.random().toString(36).substring(2, 8),
            rowType: "testcase",
            moduleName: extracted.moduleName || "",
            testCaseId: extracted.testCaseId || "",
            userStory: extracted.userStory || "",
            tracker: extracted.tracker || "",
            scenario: extracted.scenario || "",
            preCondition: extracted.preCondition || "",
            caseName: extracted.caseName || "",
            testSteps: extracted.testSteps || "",
            testData: extracted.testData || "",
            expectedResult: extracted.expectedResult || "",
            result: normalizeResultValue(extracted.result || ""),
            defectNumber: extracted.defectNumber || "",
            comments: extracted.comments || "",
            qaPic: normalizeQAValue(extracted.qaPic || ""),
          });

          totalRowsImported++;
        }
      }

      const summaryObj: ImportSummary = {
        status:
          totalRowsImported > 0
            ? missingColumnsSet.size > 0 || duplicateCaseIdsSet.size > 0
              ? "Partial Success"
              : "Success"
            : "Failed",
        totalWorksheetsScanned: wb.SheetNames.length,
        totalWorksheetsImported,
        totalRowsImported,
        totalRowsSkipped,
        missingColumns: Array.from(missingColumnsSet),
        duplicateCaseIds: Array.from(duplicateCaseIdsSet),
      };

      if (consolidatedData.length > 0) {
        // Resolve each unique Redmine ticket ID (userStory column) to a requirement —
        // reuse an existing link, else fetch-and-create from Redmine — deduped so a
        // shared ticket across many rows only triggers one lookup.
        const uniqueTicketIds = Array.from(
          new Set(
            consolidatedData
              .map((r) => r.userStory?.trim())
              .filter((v): v is string => !!v),
          ),
        );
        if (uniqueTicketIds.length > 0) {
          const resolved = await Promise.all(
            uniqueTicketIds.map((tid) =>
              resolveRequirementByRedmine(tid, currentFileMilestoneId)
                .catch(() => null)
                .then((req) => [tid, req] as const),
            ),
          );
          const requirementByTicket = new Map(resolved);
          for (const row of consolidatedData) {
            const tid = row.userStory?.trim();
            const req = tid ? requirementByTicket.get(tid) : null;
            if (req) row.requirementId = req.id;
          }
          const newlyResolved = resolved
            .map(([, req]) => req)
            .filter((r): r is RequirementOption => !!r);
          if (newlyResolved.length > 0) {
            setRequirementsList((prev) => {
              const byId = new Map(prev.map((r) => [r.id, r]));
              for (const r of newlyResolved) byId.set(r.id, r);
              return Array.from(byId.values());
            });
          }
        }

        // Mark existing DB rows for deletion and all imported rows as dirty
        const oldDbIds = dataRef.current
          .filter((r) => typeof r.id === "number")
          .map((r) => r.id as number);
        if (oldDbIds.length > 0) {
          setDeletedDbIds((prev) => new Set([...prev, ...oldDbIds]));
        }
        const applyImport = (rows: AppExecutionTestCase[]) => {
          setData(rows);
          setDirtyRowIds(new Set(rows.map((r) => r.id)));
          setHasUnsavedChanges(true);
        };

        if (availableModules.length === 1) {
          consolidatedData.forEach((r) => {
            if (!r.moduleName) r.moduleName = availableModules[0].name;
          });
          applyImport(consolidatedData);
          setImportSummary(summaryObj);
        } else if (availableModules.length > 1) {
          const hasMissingModules = consolidatedData.some((r) => !r.moduleName);
          if (hasMissingModules) {
            setPendingImportData(consolidatedData);
            setPendingImportSummary(summaryObj);
            setShowModuleSelectDialog(true);
          } else {
            applyImport(consolidatedData);
            setImportSummary(summaryObj);
          }
        } else {
          applyImport(consolidatedData);
          setImportSummary(summaryObj);
        }
      } else {
        setImportSummary(summaryObj);
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Import failed",
        description: "Invalid Excel structure or corrupted file.",
      });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleConfirmImportModule = () => {
    if (pendingImportData) {
      const finalizedData = pendingImportData.map((r) => ({
        ...r,
        moduleName: r.moduleName || selectedImportModule,
      }));
      setData(finalizedData);
      setDirtyRowIds(new Set(finalizedData.map((r) => r.id)));
      setHasUnsavedChanges(true);
    }
    if (pendingImportSummary) setImportSummary(pendingImportSummary);

    setShowModuleSelectDialog(false);
    setPendingImportData(null);
    setSelectedImportModule("");
  };

  if (isLoading)
    return (
      <div className="flex justify-center items-center h-full min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );

  const uniqueModules = Array.from(
    new Set(data.map((r) => r.moduleName || "")),
  ).filter(Boolean);
  const uniqueQA = Array.from(new Set(data.map((r) => r.qaPic || ""))).filter(
    Boolean,
  );
  const totalActiveFilters =
    moduleFilters.length + resultFilters.length + qaFilters.length;

  const defectRow = pendingFailRowId
    ? data.find((r) => r.id === pendingFailRowId)
    : null;

  return (
    <div className="space-y-3 flex flex-col h-[calc(100dvh-4rem)] lg:h-[calc(100vh-6rem)] relative">
      <DefectCreationModal
        open={defectModalOpen}
        onClose={() => {
          setDefectModalOpen(false);
          pendingFailRowIdRef.current = null;
          setPendingFailRowId(null);
        }}
        onDefectCreated={handleDefectCreated}
        testCaseName={defectRow?.caseName ?? defectRow?.scenario ?? ""}
        stepName={defectRow?.testSteps ?? undefined}
        testCaseId={defectRow?.testCaseId ?? undefined}
        expectedResult={defectRow?.expectedResult ?? undefined}
        parentIssueId={ticketId ?? null}
        executionTcId={typeof defectRow?.id === "number" ? defectRow.id : null}
        onSkip={() => {
          setDefectModalOpen(false);
          pendingFailRowIdRef.current = null;
          setPendingFailRowId(null);
          // Result stays "Failed" — user will log defect later
        }}
      />

      {/* CAPA Intelligence Dialog */}
      <Dialog open={capaOpen} onOpenChange={setCapaOpen}>
        <DialogContent className="max-w-3xl w-[96vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" /> CAPA Intelligence
            </DialogTitle>
          </DialogHeader>
          {capaLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
              <p className="text-sm text-muted-foreground">Analysing failure patterns...</p>
            </div>
          ) : capaResult ? (
            <div className="space-y-4">
              {capaResult.items.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">{capaResult.summary || "No failed or blocked test cases found."}</p>
              ) : (
                <>
                  {capaResult.summary && (
                    <div className="rounded-lg bg-purple-50 border border-purple-200 p-3 text-sm text-purple-800">
                      <span className="font-semibold">Summary: </span>{capaResult.summary}
                    </div>
                  )}
                  <div className="space-y-3">
                    {capaResult.items.map((item: any, i: number) => (
                      <div key={i} className="border rounded-lg p-4 space-y-2 text-sm">
                        <div className="flex items-center gap-2 font-semibold text-base">
                          <span className="bg-purple-100 text-purple-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">{item.sl ?? i + 1}</span>
                          {item.analysisPoint}
                          {item.module && <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{item.module}</span>}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-red-600 uppercase">Root Cause</p>
                            <p className="text-xs text-muted-foreground">{item.rootCause}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-amber-600 uppercase">Corrective Action</p>
                            <p className="text-xs text-muted-foreground">{item.correctiveAction}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-green-600 uppercase">Preventive Action</p>
                            <p className="text-xs text-muted-foreground">{item.preventiveAction}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : null}
          <DialogFooter className="gap-2 mt-2">
            {capaResult && capaResult.items.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => {
                const text = capaResult.items.map((item: any, i: number) =>
                  `${i + 1}. ${item.analysisPoint}\n   Root Cause: ${item.rootCause}\n   Corrective: ${item.correctiveAction}\n   Preventive: ${item.preventiveAction}`
                ).join("\n\n");
                navigator.clipboard.writeText(`Summary: ${capaResult.summary}\n\n${text}`);
              }}>
                Copy All
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setCapaOpen(false)}>Close</Button>
            {capaResult && <Button size="sm" onClick={handleCapaAnalysis} variant="secondary" className="gap-2"><Sparkles className="w-3.5 h-3.5" /> Re-analyse</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Confirm Row Removal
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to remove{" "}
              {rowsToDelete.length > 1
                ? `these ${rowsToDelete.length} rows`
                : "this row"}
              ?
              <br />
              <br />
              <strong>Note:</strong> You will still need to click "Save" to
              apply this change to the database.
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={executeDelete}
              className="w-full sm:w-auto"
            >
              Remove Row(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showModuleSelectDialog}
        onOpenChange={setShowModuleSelectDialog}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Map Missing Modules</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Some imported rows do not have a defined module. Would you like to
              map them to an existing module?
            </p>
            <div className="space-y-1">
              <Label>Default Module for Unassigned Rows</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={selectedImportModule}
                onChange={(e) => setSelectedImportModule(e.target.value)}
              >
                <option value="">Leave unassigned</option>
                {availableModules.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleConfirmImportModule}>Continue Import</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {importSummary && !showModuleSelectDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <Card className="max-w-md w-full bg-background shadow-2xl overflow-hidden border-border">
            <div
              className={`p-4 border-b flex items-center gap-2 text-white ${importSummary.status === "Success" ? "bg-green-600" : importSummary.status === "Failed" ? "bg-red-600" : "bg-amber-500"}`}
            >
              {importSummary.status === "Success" && (
                <CheckCircle className="w-5 h-5" />
              )}
              {importSummary.status === "Failed" && (
                <XCircle className="w-5 h-5" />
              )}
              {importSummary.status === "Partial Success" && (
                <AlertTriangle className="w-5 h-5" />
              )}
              <h2 className="text-lg font-bold">
                Import Summary: {importSummary.status}
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-muted/50 p-3 rounded-md">
                  <p className="text-muted-foreground mb-1">Sheets Scanned</p>
                  <p className="text-2xl font-semibold">
                    {importSummary.totalWorksheetsScanned}
                  </p>
                </div>
                <div className="bg-muted/50 p-3 rounded-md">
                  <p className="text-muted-foreground mb-1">
                    Valid Sheets Imported
                  </p>
                  <p className="text-2xl font-semibold text-primary">
                    {importSummary.totalWorksheetsImported}
                  </p>
                </div>
                <div className="bg-muted/50 p-3 rounded-md">
                  <p className="text-muted-foreground mb-1">Rows Imported</p>
                  <p className="text-2xl font-semibold">
                    {importSummary.totalRowsImported}
                  </p>
                </div>
                <div className="bg-muted/50 p-3 rounded-md">
                  <p className="text-muted-foreground mb-1">
                    Empty Rows Skipped
                  </p>
                  <p className="text-2xl font-semibold">
                    {importSummary.totalRowsSkipped}
                  </p>
                </div>
              </div>

              {importSummary.missingColumns.length > 0 && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-md">
                  <p className="text-sm font-semibold text-amber-600 flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4" /> Missing Columns
                    Detected
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {importSummary.missingColumns.join(", ")}
                  </p>
                </div>
              )}

              {importSummary.duplicateCaseIds.length > 0 && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md">
                  <p className="text-sm font-semibold text-red-600 flex items-center gap-2 mb-1">
                    <XCircle className="w-4 h-4" /> Duplicate Case IDs Found
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {importSummary.duplicateCaseIds.join(", ")}
                  </p>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button onClick={() => setImportSummary(null)}>
                  Acknowledge & Continue
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* No milestone linked yet — test cases can still be added/edited, but
          Execute mode (recording a real result) is disabled until one is set. */}
      {currentFileMilestoneId == null && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-md border border-amber-500/30 bg-amber-500/10 shrink-0">
          <p className="text-sm text-amber-700 dark:text-amber-400 flex-1">
            No milestone linked — you can add and edit test cases, but results can't be recorded until one is set.
          </p>
          <div className="flex items-center gap-2">
            <div className="w-56">
              <SearchableSelect
                value={selectedMilestoneToLink}
                onValueChange={setSelectedMilestoneToLink}
                options={milestoneOptions.map((m) => ({ value: String(m.id), label: m.name }))}
                placeholder="Select milestone..."
                searchPlaceholder="Search milestones..."
              />
            </div>
            <Button size="sm" onClick={linkMilestone} disabled={!selectedMilestoneToLink || linkingMilestone}>
              {linkingMilestone ? <Loader2 className="w-4 h-4 animate-spin" /> : "Link"}
            </Button>
          </div>
        </div>
      )}

      {/* HEADER & ACTION BUTTONS */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/test-cases/execution")}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2 flex-wrap">
              <FileSpreadsheet className="w-5 h-5 text-primary shrink-0" /> Ticket #{ticketId}
              {currentFileTitle && (
                <span className="text-muted-foreground font-normal">— {currentFileTitle}</span>
              )}
            </h1>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              Test Case Execution Progress{" "}
              <Sparkles className="w-3 h-3 ml-1 text-primary" /> AI Copilot
              Active (Press Tab)
            </p>
            {/* --- AUTO-SAVE INDICATOR --- */}
            <div className="text-xs flex items-center gap-1 mt-0.5 font-medium">
              {saveStatus === "saving" && (
                <>
                  <Loader2 className="w-3 h-3 animate-spin text-blue-500" />{" "}
                  <span className="text-blue-500">Saving...</span>
                </>
              )}
              {saveStatus === "error" && (
                <>
                  <AlertTriangle className="w-3 h-3 text-red-500" />{" "}
                  <span className="text-red-500">Save Failed!</span>
                </>
              )}
              {saveStatus === "saved" && (
                <>
                  <CheckCircle className="w-3 h-3 text-green-600" />{" "}
                  <span className="text-green-600">Saved</span>
                </>
              )}
              {lastSavedAt && (
                <span className="text-muted-foreground ml-1">
                  Last saved at {format(lastSavedAt, "HH:mm:ss")}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {mode === "edit" && selectedRows.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => confirmDeleteMulti(selectedRows)}
              className="flex-1 lg:flex-none gap-2"
            >
              <Trash2 className="w-4 h-4" /> Delete Selected ({selectedRows.length})
            </Button>
          )}

          {/* Mode toggle — Execute is disabled until a milestone is linked,
              since that's the only mode that can record a result. */}
          <div className="flex border border-border rounded-lg overflow-hidden text-xs font-medium">
            <button
              onClick={() => currentFileMilestoneId != null && setMode("execute")}
              disabled={currentFileMilestoneId == null}
              title={currentFileMilestoneId == null ? "Link a milestone to this execution file before you can record results" : undefined}
              className={`px-3 py-1.5 transition-colors ${mode === "execute" ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted/50"} ${currentFileMilestoneId == null ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              Execute
            </button>
            <button
              onClick={() => setMode("edit")}
              className={`px-3 py-1.5 transition-colors ${mode === "edit" ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted/50"}`}
            >
              Edit test cases
            </button>
          </div>

          <input
            type="file"
            accept=".xlsx, .xls"
            className="hidden"
            ref={fileInputRef}
            onChange={handleImportExcel}
          />

          {/* Utilities — execute mode only */}
          {mode === "execute" && (
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="gap-2"
              >
                {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Import
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadExcel}
                disabled={isDownloading}
                className="gap-2"
              >
                {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {isDownloading ? "Downloading..." : "Download"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCapaAnalysis}
                className="gap-2 border-purple-300 text-purple-700 hover:bg-purple-50"
              >
                <Sparkles className="w-4 h-4" /> CAPA AI
              </Button>
            </div>
          )}

          <div className="w-px h-6 bg-border hidden lg:block" />

          {/* Mode-gated + primary */}
          <div className="flex gap-1.5">
            {mode === "edit" && (
              <Button variant="outline" size="sm" onClick={openPullDialog} className="gap-2">
                <FileSpreadsheet className="w-4 h-4" /> Pull from Library
              </Button>
            )}
            {mode === "edit" && (
              <Button variant="secondary" size="sm" onClick={handleAddRow} className="gap-2">
                <Plus className="w-4 h-4" /> Add Row
              </Button>
            )}
            {mode === "edit" && (
              <Button variant="outline" size="sm" onClick={handleAddGroupRow} className="gap-2">
                <Tag className="w-4 h-4" /> Add Group Tag
              </Button>
            )}
            <Button onClick={handleSave} disabled={isSaving} size="sm" className="gap-2">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </Button>
          </div>
        </div>
      </div>

      {/* STICKY SUMMARY STATS */}
      <div className="shrink-0 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 bg-card border border-border rounded-lg px-3 py-2">
        {[
          { label: "Total", value: filteredData.length, color: "text-foreground" },
          { label: "Passed", value: summaryStats.resultsCount["Passed"] ?? 0, color: "text-green-600" },
          { label: "Failed", value: summaryStats.resultsCount["Failed"] ?? 0, color: "text-red-600" },
          { label: "Blocked", value: summaryStats.resultsCount["Blocked"] ?? 0, color: "text-orange-600" },
          { label: "In Progress", value: summaryStats.resultsCount["In Progress"] ?? 0, color: "text-blue-600" },
          { label: "Not Executed", value: summaryStats.totalUnexecuted, color: "text-muted-foreground" },
          { label: "Executed %", value: `${filteredData.length > 0 ? Math.round((summaryStats.totalExecuted / filteredData.length) * 100) : 0}%`, color: "text-primary" },
        ].map(({ label, value, color }) => (
          <div key={label} className="text-center">
            <div className={`text-lg font-bold ${color}`}>{value}</div>
            <div className="text-[10px] text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      {/* EDIT MODE WARNING BANNER */}
      {mode === "edit" && !editWarningDismissed && (
        <div className="shrink-0 flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-3 py-2 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">You're editing the execution copy. Changes won't update the library TC.</span>
          <button
            type="button"
            onClick={() => setEditWarningDismissed(true)}
            aria-label="Dismiss"
            className="shrink-0 text-blue-600 hover:text-blue-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* GLOBAL SEARCH & FILTER BAR */}
      <div className="flex flex-col gap-2 bg-muted/30 border border-border p-2 rounded-lg shrink-0">
        <div className="flex flex-col lg:flex-row gap-2 items-start lg:items-center flex-wrap">
          <div className="relative w-full lg:w-72 shrink-0">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search across all columns..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="pl-9 pr-9 bg-background h-8 text-xs"
            />
            {globalSearch && (
              <button
                onClick={() => setGlobalSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <FilterDropdown
            label="Module"
            options={uniqueModules.map((m) => ({ value: m, label: m }))}
            selected={moduleFilters}
            onToggle={(v) => toggleFilter("module", v)}
          />
          <FilterDropdown
            label="Result"
            options={[
              ...RESULT_OPTIONS.filter(Boolean).map((r) => ({ value: r, label: r })),
              { value: "", label: "Pending/Empty" },
            ]}
            selected={resultFilters}
            onToggle={(v) => toggleFilter("result", v)}
          />
          <FilterDropdown
            label="QA PIC"
            options={[
              ...uniqueQA.map((qa) => ({ value: qa, label: qa })),
              { value: "", label: "No QA Assigned" },
            ]}
            selected={qaFilters}
            onToggle={(v) => toggleFilter("qa", v)}
          />

          <div className="flex items-center gap-2 text-xs text-muted-foreground w-full lg:w-auto lg:ml-auto justify-end flex-wrap">
            <Filter className="w-3.5 h-3.5" />
            <span>{filteredData.length} records{totalActiveFilters > 0 ? ` (${totalActiveFilters} filters)` : ""}</span>
            {totalActiveFilters > 0 && (
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2"
                onClick={() => { setModuleFilters([]); setResultFilters([]); setQaFilters([]); }}>
                Clear Filters
              </Button>
            )}
            {viewLayout === "spreadsheet" && (
              <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1"
                onClick={() => setShowColPicker(v => !v)}>
                <span>Columns</span>
              </Button>
            )}
          </div>
        </div>

        {/* Column visibility picker — spreadsheet view only */}
        {viewLayout === "spreadsheet" && showColPicker && (
          <div className="border-t mt-2 pt-2 flex flex-wrap gap-x-4 gap-y-1">
            <Label className="text-[10px] font-bold text-muted-foreground uppercase w-full">Show / Hide Columns</Label>
            {[
              { key: "testCaseId", label: "Test Case ID" },
              { key: "userStory", label: "Redmine Ticket ID" },
              { key: "tracker", label: "Tracker" },
              { key: "scenario", label: "Scenario" },
              { key: "preCondition", label: "Pre Condition" },
              { key: "testData", label: "Test Data" },
              { key: "executedAt", label: "Executed At" },
              { key: "comments", label: "QA Notes" },
            ].map(col => (
              <label key={col.key} className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                <input type="checkbox" className="rounded border-gray-300 w-3 h-3"
                  checked={!hiddenCols.has(col.key)}
                  onChange={e => {
                    setHiddenCols(prev => {
                      const next = new Set(prev);
                      if (e.target.checked) next.delete(col.key); else next.add(col.key);
                      return next;
                    });
                  }} />
                {col.label}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* DESKTOP TREE VIEW */}
      {viewLayout === "spreadsheet" && (
        <Card className="hidden lg:flex flex-1 overflow-hidden border rounded-md shadow-sm min-h-[450px]">
          {filteredData.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
              <Search className="w-10 h-10 mb-4 opacity-20" />
              <p>No test cases match your current filters.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-auto bg-card">
              <table className="w-full text-sm border-collapse min-w-[2840px]">
                <thead className="sticky top-0 z-30 bg-muted shadow-sm">
                  <tr className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {mode === "edit" && (
                      <th className="border border-border w-10 p-2 text-center sticky left-0 z-40 bg-muted">
                        <input type="checkbox" className="w-4 h-4 rounded border-gray-300 cursor-pointer"
                          checked={filteredData.length > 0 && selectedRows.length === filteredData.length}
                          onChange={(e) => handleSelectAll(e.target.checked)} />
                      </th>
                    )}
                    {mode === "edit" && <th className="border border-border w-48 p-2 text-left sticky left-10 z-40 bg-muted">Module</th>}
                    {!hiddenCols.has("testCaseId") && (
                      <th className="border border-border w-48 p-2 text-left sticky bg-muted z-30" style={{ left: mode === "edit" ? "14.5rem" : 0 }}>
                        Test Case ID
                      </th>
                    )}
                    {!hiddenCols.has("userStory") && <th className="border border-border w-48 p-2 text-left">Redmine Ticket ID</th>}
                    {!hiddenCols.has("tracker") && <th className="border border-border w-48 p-2 text-left">Tracker</th>}
                    {!hiddenCols.has("scenario") && <th className="border border-border w-64 p-2 text-left">Scenario <Sparkles className="w-3 h-3 inline text-primary" /></th>}
                    {!hiddenCols.has("preCondition") && <th className="border border-border w-48 p-2 text-left">Pre Condition</th>}
                    <th className="border border-border w-64 p-2 text-left">Case <Sparkles className="w-3 h-3 inline text-primary" /></th>
                    <th className="border border-border w-64 p-2 text-left">Steps <Sparkles className="w-3 h-3 inline text-primary" /></th>
                    {!hiddenCols.has("testData") && <th className="border border-border w-48 p-2 text-left">Test Data</th>}
                    <th className="border border-border w-64 p-2 text-left">Expected Result <Sparkles className="w-3 h-3 inline text-primary" /></th>
                    <th className="border border-border w-48 p-2 text-left text-primary">Result</th>
                    {!hiddenCols.has("executedAt") && currentUser?.role !== "qa_member" && <th className="border border-border w-36 p-2 text-left">Executed At</th>}
                    <th className="border border-border w-48 p-2 text-left">Redmine Defect ID</th>
                    {!hiddenCols.has("comments") && <th className="border border-border w-64 p-2 text-left">QA Notes</th>}
                    <th className="border border-border w-48 p-2 text-left">QA PIC</th>
                    {mode === "edit" && <th className="border border-border w-10 p-2"></th>}
                  </tr>
                </thead>
                <DndContext
                  sensors={dndSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEndForScope(filteredData.map((r) => String(r.id)))}
                >
                  <SortableContext items={filteredData.map((r) => String(r.id))} strategy={verticalListSortingStrategy}>
                    <tbody>
                      {filteredData.map((row, index) => (
                        <DesktopTableRow
                          key={row.id as string}
                          row={row}
                          index={index}
                          isSelected={selectedRows.includes(row.id as string | number)}
                          onToggleSelect={handleSelectRow}
                          isDirty={dirtyRowIds.has(row.id as string | number)}
                          onUpdate={updateCell}
                          onBlurRow={saveBlurRow}
                          onAcknowledgeRevision={acknowledgeRevision}
                          onDelete={requestSingleDelete}
                          onPromote={openPromoteDialog}
                          onUpdateLibrary={handleUpdateLibraryFromExecution}
                          onPullLatest={handlePullLatestFromLibrary}
                          libraryDrift={getLibraryDrift(row, row.libraryTcId ? libraryTcById.get(row.libraryTcId) : null)}
                          availableModules={availableModules}
                          availableTrackers={availableTrackers}
                          qaUsers={qaUsers}
                          mode={mode}
                          hiddenCols={hiddenCols}
                          currentUser={currentUser}
                          dragDisabled={mode !== "edit"}
                        />
                      ))}
                    </tbody>
                  </SortableContext>
                </DndContext>
              </table>
            </div>
          )}
        </Card>
      )}

      <Card className={`${viewLayout === "tree" ? "hidden lg:block" : "hidden"} flex-1 overflow-y-auto border rounded-md shadow-sm min-h-[450px]`}>
        {filteredData.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-muted-foreground p-8 h-full">
            <Search className="w-10 h-10 mb-4 opacity-20" />
            <p>No test cases match your current filters and search criteria.</p>
            <Button variant="link" onClick={() => { setGlobalSearch(""); setModuleFilters([]); setResultFilters([]); setQaFilters([]); }}>
              Clear all filters
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleTreeDragEnd}>
              {groupByModule(filteredData).map(({ name: moduleName, rows: moduleRows }) => {
                const isModuleOpen = expandedModules.has(moduleName);
                const prog = getModuleProgress(moduleRows);
                return (
                  <React.Fragment key={moduleName}>
                    {/* Module header */}
                    <div
                      className="flex items-center gap-3 px-4 py-3 bg-muted/50 cursor-pointer select-none hover:bg-muted/80 transition-colors"
                      onClick={() => toggleModule(moduleName)}
                    >
                      {isModuleOpen ? <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />}
                      <span className="font-semibold text-sm">📁 {moduleName}</span>
                      <Badge variant="secondary" className="text-xs shrink-0">{moduleRows.length} case{moduleRows.length !== 1 ? "s" : ""}</Badge>
                      <MiniProgressBar data={prog} />
                    </div>

                    {/* TC rows */}
                    {isModuleOpen && (
                      <SortableContext items={moduleRows.map((r) => String(r.id))} strategy={verticalListSortingStrategy}>
                        <div className="divide-y divide-border/50">
                          {moduleRows.map((row) => (
                            <SortableTreeRow
                              key={row.id as string}
                              row={row}
                              isSelected={selectedRows.includes(row.id as string | number)}
                              onToggleSelect={handleSelectRow}
                              isTcOpen={expandedTcId === row.id}
                              onToggleTc={toggleTc}
                              mode={mode}
                              updateCell={updateCell}
                              availableModules={availableModules}
                              requirementsList={requirementsList}
                              qaUsers={qaUsers}
                              currentUser={currentUser}
                              dragDisabled={mode !== "edit"}
                              onPromote={openPromoteDialog}
                              onUpdateLibrary={handleUpdateLibraryFromExecution}
                              onPullLatest={handlePullLatestFromLibrary}
                              libraryDrift={getLibraryDrift(row, row.libraryTcId ? libraryTcById.get(row.libraryTcId) : null)}
                              onAcknowledgeRevision={acknowledgeRevision}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    )}
                  </React.Fragment>
                );
              })}
            </DndContext>
          </div>
        )}
      </Card>

      {/* FOCUS VIEW — TestLink-style master-detail: tree on the left, single TC on the right */}
      <Card className={`${viewLayout === "focus" ? "hidden lg:flex" : "hidden"} flex-1 overflow-hidden border rounded-md shadow-sm min-h-[450px]`}>
        {filteredData.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-muted-foreground p-8 w-full">
            <Search className="w-10 h-10 mb-4 opacity-20" />
            <p>No test cases match your current filters and search criteria.</p>
            <Button variant="link" onClick={() => { setGlobalSearch(""); setModuleFilters([]); setResultFilters([]); setQaFilters([]); }}>
              Clear all filters
            </Button>
          </div>
        ) : (
          <>
            {/* Left: module tree */}
            <div className="w-72 shrink-0 border-r border-border overflow-y-auto">
              {groupByModule(filteredData).map(({ name: moduleName, rows: moduleRows }) => {
                const isCollapsed = focusCollapsedModules.has(moduleName);
                return (
                  <div key={moduleName}>
                    <div
                      className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border cursor-pointer select-none hover:bg-muted/80 transition-colors sticky top-0 z-10"
                      onClick={() => setFocusCollapsedModules(prev => {
                        const s = new Set(prev);
                        s.has(moduleName) ? s.delete(moduleName) : s.add(moduleName);
                        return s;
                      })}
                    >
                      {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
                      <span className="font-semibold text-xs flex-1 truncate">{moduleName}</span>
                      <Badge variant="secondary" className="text-[10px] shrink-0">{moduleRows.length}</Badge>
                    </div>
                    {!isCollapsed && (
                      <div className="divide-y divide-border/50">
                        {moduleRows.map(row => {
                          const isActive = focusRow?.id === row.id;
                          return (
                            <div
                              key={row.id as string}
                              onClick={() => setFocusRowId(row.id ?? null)}
                              className={`flex items-center gap-2 pl-6 pr-3 py-2 text-xs cursor-pointer border-l-2 transition-colors ${isActive ? "bg-primary/10 border-primary" : "border-transparent hover:bg-muted/40"}`}
                            >
                              <span className={`w-2 h-2 rounded-full shrink-0 ${RESULT_DOT_COLOR[row.result || ""] || "bg-slate-300"}`} />
                              <div className="min-w-0 flex-1">
                                <div className={`font-mono text-[10px] ${isActive ? "text-primary" : "text-muted-foreground"}`}>{row.caseId || row.testCaseId || "—"}</div>
                                <div className="truncate">{row.caseName || "Untitled"}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Right: single test case detail */}
            {focusRow ? (() => {
              const row = focusRow;
              const isQaMember = currentUser?.role === "qa_member";
              const isAssignedToMe = row.qaPic === currentUser?.name;
              const isUnassigned = !row.qaPic;
              const canEdit = !isQaMember || isAssignedToMe;
              const parseLines = (t: string | undefined) => (t || "").split("\n").map(l => l.trim()).filter(Boolean);
              const steps = parseLines(row.testSteps);
              const expectations = parseLines(row.expectedResult);
              const getExpected = (i: number) => {
                if (expectations.length === 0) return "";
                if (expectations.length === 1) return i === Math.max(0, steps.length - 1) ? expectations[0] : "";
                return expectations[i] || "";
              };
              const displaySteps = steps.length > 0 ? steps : [""];
              const cellCls = "p-3 text-sm text-foreground whitespace-pre-wrap";
              const headCls = "p-2 text-[10px] font-bold uppercase text-muted-foreground bg-muted/50";
              const dividerX = "divide-x divide-border";
              const borderB = "border-b border-border";
              return (
                <div className="flex-1 flex flex-col min-w-0">
                  {/* Header */}
                  <div className="px-4 py-3 border-b border-border flex items-center gap-3 shrink-0">
                    <span className="font-mono text-xs text-primary font-medium shrink-0">{row.caseId || row.testCaseId || "—"}</span>
                    {mode === "edit" ? (
                      <Input
                        className="h-7 text-sm flex-1 min-w-0"
                        value={row.caseName || ""}
                        placeholder="Case name"
                        onChange={(e) => updateCell(row.id as string | number, "caseName", e.target.value)}
                      />
                    ) : (
                      <span className="text-sm font-medium truncate flex-1 min-w-0">{row.caseName || "Untitled"}</span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground shrink-0">QA PIC: {row.qaPic || "Unassigned"}</span>
                    {mode === "edit" && (
                      <>
                        {!row.libraryTcId ? (
                          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs shrink-0" onClick={() => openPromoteDialog(row)}>
                            <Library className="w-3.5 h-3.5" /> Promote to Library
                          </Button>
                        ) : getLibraryDrift(row, libraryTcById.get(row.libraryTcId)) ? (
                          <>
                            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs shrink-0" onClick={() => handleUpdateLibraryFromExecution(row)}>
                              <Library className="w-3.5 h-3.5" /> Update Library
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs shrink-0" onClick={() => handlePullLatestFromLibrary(row)}>
                              <ArrowDownToLine className="w-3.5 h-3.5" /> Pull Latest
                            </Button>
                          </>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                          title="Delete test case"
                          onClick={() => requestSingleDelete(row.id as string | number)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>

                  {/* Body */}
                  <div className="flex-1 overflow-y-auto p-4">
                    <div className="text-sm space-y-4">
                      <div>
                        <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1 flex items-center gap-2">
                          Requirement
                          {row.requirementId ? (
                            <span className="text-[9px] normal-case font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">linked</span>
                          ) : (
                            <span className="text-[9px] normal-case font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">not linked</span>
                          )}
                        </div>
                        {mode === "edit" ? (
                          <SearchableSelect
                            value={row.requirementId != null ? String(row.requirementId) : ""}
                            onValueChange={(v) => updateCell(row.id as string | number, "requirementId", v)}
                            options={requirementsList.map((r) => ({
                              value: String(r.id),
                              label: r.redmineTicketId ? `#${r.redmineTicketId} — ${r.title}` : r.title,
                            }))}
                            placeholder="Search requirement by Redmine ID or title..."
                            searchPlaceholder="Search requirements..."
                            emptyText="No requirements found."
                          />
                        ) : (() => {
                          const linked = row.requirementId
                            ? requirementsList.find((r) => r.id === Number(row.requirementId))
                            : null;
                          return (
                            <p className="text-sm">
                              {linked ? (linked.redmineTicketId ? `#${linked.redmineTicketId} — ${linked.title}` : linked.title) : "—"}
                            </p>
                          );
                        })()}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Scenario {mode === "edit" && <Sparkles className="w-3 h-3 inline text-primary" />}</div>
                          {mode === "edit"
                            ? <CopilotTextarea className="min-h-[40px] text-sm" value={row.scenario || ""} fieldName="Scenario" minHeight="40px" onChange={(val: string) => updateCell(row.id as string | number, "scenario", val)} />
                            : <p className="text-sm whitespace-pre-wrap">{row.scenario || "—"}</p>
                          }
                        </div>
                        <div>
                          <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Module</div>
                          {mode === "edit"
                            ? <select className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1" value={row.moduleName || ""} onChange={e => updateCell(row.id as string | number, "moduleName", e.target.value)}>
                                <option value="">Select...</option>
                                {availableModules.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                              </select>
                            : <p className="text-sm">{row.moduleName || "—"}</p>
                          }
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Pre-Condition {mode === "edit" && <Sparkles className="w-3 h-3 inline text-primary" />}</div>
                          {mode === "edit"
                            ? <CopilotTextarea className="min-h-[40px] text-sm" value={row.preCondition || ""} fieldName="Pre-Condition" minHeight="40px" onChange={(val: string) => updateCell(row.id as string | number, "preCondition", val)} />
                            : <p className="text-sm whitespace-pre-wrap">{row.preCondition || "—"}</p>
                          }
                        </div>
                        <div>
                          <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Test Data {mode === "edit" && <Sparkles className="w-3 h-3 inline text-primary" />}</div>
                          {mode === "edit"
                            ? <CopilotTextarea className="min-h-[40px] text-sm" value={row.testData || ""} fieldName="Test Data" minHeight="40px" onChange={(val: string) => updateCell(row.id as string | number, "testData", val)} />
                            : <p className="text-sm whitespace-pre-wrap">{row.testData || "—"}</p>
                          }
                        </div>
                      </div>

                      <div className="border border-border rounded-md overflow-hidden">
                        <div className={`grid grid-cols-2 ${dividerX} ${borderB}`}>
                          <div className={headCls}>Test Step {mode === "edit" && <Sparkles className="w-3 h-3 inline text-primary" />}</div>
                          <div className={headCls}>Expected Result {mode === "edit" && <Sparkles className="w-3 h-3 inline text-primary" />}</div>
                        </div>
                        {mode === "edit" ? (
                          <div className={`grid grid-cols-2 ${dividerX}`}>
                            <div className="p-3">
                              <CopilotTextarea className="min-h-[80px] text-sm" value={row.testSteps || ""} fieldName="Test Steps" minHeight="80px" onChange={(val: string) => updateCell(row.id as string | number, "testSteps", val)} />
                            </div>
                            <div className="p-3">
                              <CopilotTextarea className="min-h-[80px] text-sm" value={row.expectedResult || ""} fieldName="Expected Result" minHeight="80px" onChange={(val: string) => updateCell(row.id as string | number, "expectedResult", val)} />
                            </div>
                          </div>
                        ) : (
                          displaySteps.map((step, i) => (
                            <div key={i} className={`grid grid-cols-2 ${dividerX} ${i < displaySteps.length - 1 ? borderB : ""}`}>
                              <div className={cellCls}>{step || "—"}</div>
                              <div className={cellCls}>{getExpected(i) || ""}</div>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-[10px] font-bold text-muted-foreground uppercase mb-2">Result</div>
                          {canEdit ? (
                            <div className="flex flex-wrap gap-1.5">
                              {(["Passed", "Failed", "Blocked", "In Progress", "Not Executed"] as const).map(status => (
                                <button key={status} onClick={() => updateCell(row.id as string | number, "result", status)}
                                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${row.result === status ? RESULT_PILL_ACTIVE[status] : "bg-muted/40 border-border text-muted-foreground hover:bg-muted"}`}>
                                  {status}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium border ${RESULT_PILL_ACTIVE[normalizeResultValue(row.result)] || "bg-slate-100 text-slate-600 border-slate-300"}`}>
                              {normalizeResultValue(row.result) || "Not Executed"}
                            </span>
                          )}
                        </div>
                        <div>
                          <div className="text-[10px] font-bold text-muted-foreground uppercase mb-2">QA PIC</div>
                          {isQaMember ? (
                            isAssignedToMe ? (
                              <div className="flex items-center gap-2 text-sm">
                                <span className="font-medium">{currentUser?.name}</span>
                                <button className="text-xs text-muted-foreground underline hover:text-destructive" onClick={() => updateCell(row.id as string | number, "qaPic", "")}>Unassign</button>
                              </div>
                            ) : isUnassigned ? (
                              <button className="text-xs px-3 py-1 rounded-full border border-primary text-primary hover:bg-primary/10 transition" onClick={() => updateCell(row.id as string | number, "qaPic", currentUser?.name || "")}>
                                + Assign to me
                              </button>
                            ) : (
                              <span className="text-sm text-muted-foreground">{row.qaPic}</span>
                            )
                          ) : (
                            <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1" value={row.qaPic || ""} onChange={e => updateCell(row.id as string | number, "qaPic", e.target.value)}>
                              <option value="">Select QA PIC...</option>
                              {qaUsers.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                            </select>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-[10px] font-bold text-muted-foreground uppercase mb-2">Redmine Defect ID</div>
                          {canEdit ? (
                            <Textarea className="min-h-[60px] text-sm" value={row.defectNumber || ""} placeholder="e.g. 38032, 38033" onChange={e => updateCell(row.id as string | number, "defectNumber", e.target.value)} />
                          ) : (
                            <p className="text-sm text-muted-foreground">{row.defectNumber || "—"}</p>
                          )}
                        </div>
                        <div>
                          <div className="text-[10px] font-bold text-muted-foreground uppercase mb-2">QA Notes</div>
                          {canEdit ? (
                            <Textarea className="min-h-[60px] text-sm" value={row.comments || ""} onChange={e => updateCell(row.id as string | number, "comments", e.target.value)} />
                          ) : (
                            <p className="text-sm text-muted-foreground">{row.comments || "—"}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer: prev/next */}
                  <div className="px-4 py-2.5 border-t border-border flex items-center justify-between shrink-0">
                    <span className="text-xs text-muted-foreground">{focusIndex + 1} of {filteredData.length}</span>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => goToFocusOffset(-1)} disabled={focusIndex <= 0} className="gap-1">
                        <ChevronLeft className="w-3.5 h-3.5" /> Prev
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => goToFocusOffset(1)} disabled={focusIndex === -1 || focusIndex >= filteredData.length - 1} className="gap-1">
                        Next <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })() : (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Select a test case from the tree.</div>
            )}
          </>
        )}
      </Card>

      {/* MOBILE VIEW (always card-based) */}
      <div className="lg:hidden flex-1 flex flex-col overflow-y-auto min-h-[450px] pb-4">
        {filteredData.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-muted-foreground p-8 border border-dashed rounded-lg">
            <Search className="w-8 h-8 mb-4 opacity-20" />
            <p className="text-center text-sm">No test cases match filters.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {groupByModule(filteredData).map(({ name: moduleName, rows: moduleRows }) => {
              const isModuleOpen = expandedModules.has(moduleName);
              const prog = getModuleProgress(moduleRows);
              return (
                <div key={moduleName} className="border rounded-lg overflow-hidden">
                  {/* Module header */}
                  <div
                    className="flex items-center gap-2 px-4 py-3 bg-muted/50 cursor-pointer select-none"
                    onClick={() => toggleModule(moduleName)}
                  >
                    {isModuleOpen ? <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />}
                    <span className="font-semibold text-sm flex-1 truncate">📁 {moduleName}</span>
                    <Badge variant="secondary" className="text-xs shrink-0">{moduleRows.length} case{moduleRows.length !== 1 ? "s" : ""}</Badge>
                  </div>
                  {isModuleOpen && <div className="px-4 pb-2 bg-muted/30"><MiniProgressBar data={prog} /></div>}

                  {/* TC list */}
                  {isModuleOpen && (
                    <div className="divide-y divide-border/50">
                      {moduleRows.map(row => {
                        const isTcOpen = expandedTcId === row.id;
                        const isQaMember = currentUser?.role === "qa_member";
                        const isAssignedToMe = row.qaPic === currentUser?.name;
                        const isUnassigned = !row.qaPic;
                        const canEdit = !isQaMember || isAssignedToMe;
                        if (row.rowType === "group") {
                          return (
                            <div key={row.id as string} className="flex items-center gap-2 px-4 py-3 bg-accent/30">
                              <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium truncate">{row.caseName || "Untitled group"}</span>
                            </div>
                          );
                        }
                        return (
                          <React.Fragment key={row.id as string}>
                            {/* TC summary row */}
                            <div
                              className={`flex items-center gap-2 px-4 py-3 cursor-pointer transition-colors ${isTcOpen ? "bg-muted/20 border-l-2 border-primary" : "border-l-2 border-transparent hover:bg-muted/10"} ${isQaMember && !canEdit ? "opacity-60" : ""}`}
                              onClick={() => toggleTc(row.id as string | number)}
                            >
                              {isTcOpen ? <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground" />}
                              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                <span className="font-mono text-xs text-primary font-medium truncate">{row.caseId || row.testCaseId || "—"}</span>
                                <span className="text-sm truncate">{row.caseName || "Untitled"}</span>
                              </div>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium border shrink-0 ${RESULT_PILL_ACTIVE[normalizeResultValue(row.result)] || "bg-slate-100 text-slate-600 border-slate-300"}`}>
                                {normalizeResultValue(row.result) || "Not Executed"}
                              </span>
                            </div>

                            {/* Expanded detail panel — document style (mobile) */}
                            {isTcOpen && (() => {
                              const parseLines = (t: string | undefined) => (t || "").split("\n").map(l => l.trim()).filter(Boolean);
                              const steps = parseLines(row.testSteps);
                              const expectations = parseLines(row.expectedResult);
                              const getExpected = (i: number) => {
                                if (expectations.length === 0) return "";
                                if (expectations.length === 1) return i === Math.max(0, steps.length - 1) ? expectations[0] : "";
                                return expectations[i] || "";
                              };
                              const displaySteps = steps.length > 0 ? steps : [""];
                              const dividerX = "divide-x divide-border";
                              const borderB = "border-b border-border";
                              return (
                                <div className="px-3 py-3 bg-muted/5 border-t border-muted">
                                  <div className="text-sm space-y-3">
                                    {/* Case */}
                                    <div>
                                      <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Case</div>
                                      <p className="text-xs">{row.caseName || "—"}</p>
                                    </div>
                                    <div>
                                      <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Requirement</div>
                                      <p className="text-xs">
                                        {(() => {
                                          const linked = row.requirementId
                                            ? requirementsList.find((r) => r.id === Number(row.requirementId))
                                            : null;
                                          return linked ? (linked.redmineTicketId ? `#${linked.redmineTicketId} — ${linked.title}` : linked.title) : "—";
                                        })()}
                                      </p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                      <div><div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Module</div><p className="text-xs">{row.moduleName || "—"}</p></div>
                                      <div><div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Scenario</div><p className="text-xs whitespace-pre-wrap">{row.scenario || "—"}</p></div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                      <div><div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Pre-Condition</div><p className="text-xs whitespace-pre-wrap">{row.preCondition || "—"}</p></div>
                                      <div><div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Test Data</div><p className="text-xs whitespace-pre-wrap">{row.testData || "—"}</p></div>
                                    </div>
                                    {/* Steps table — bordered only here */}
                                    <div className="border border-border rounded-md overflow-hidden">
                                      <div className={`grid grid-cols-2 ${dividerX} ${borderB} bg-muted/50`}>
                                        <div className="p-2 text-[10px] font-bold uppercase text-muted-foreground">Test Step</div>
                                        <div className="p-2 text-[10px] font-bold uppercase text-muted-foreground">Expected Result</div>
                                      </div>
                                      {displaySteps.map((step, i) => (
                                        <div key={i} className={`grid grid-cols-2 ${dividerX} ${i < displaySteps.length - 1 ? borderB : ""}`}>
                                          <div className="p-2 text-xs whitespace-pre-wrap">{step || "—"}</div>
                                          <div className="p-2 text-xs whitespace-pre-wrap">{getExpected(i) || ""}</div>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Result</div>
                                        {canEdit ? (
                                          <div className="flex flex-wrap gap-1">
                                            {(["Passed", "Failed", "Blocked", "In Progress", "Not Executed"] as const).map(status => (
                                              <button key={status} onClick={() => updateCell(row.id as string | number, "result", status)}
                                                className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all ${row.result === status ? RESULT_PILL_ACTIVE[status] : "bg-muted/40 border-border text-muted-foreground hover:bg-muted"}`}>
                                                {status}
                                              </button>
                                            ))}
                                          </div>
                                        ) : (
                                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border ${RESULT_PILL_ACTIVE[normalizeResultValue(row.result)] || "bg-slate-100 text-slate-600 border-slate-300"}`}>
                                            {normalizeResultValue(row.result) || "Not Executed"}
                                          </span>
                                        )}
                                      </div>
                                      <div>
                                        <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">QA PIC</div>
                                        {isQaMember ? (
                                          isAssignedToMe ? (
                                            <div className="flex items-center gap-1 text-xs">
                                              <span className="font-medium">{currentUser?.name}</span>
                                              <button className="text-[10px] text-muted-foreground underline hover:text-destructive" onClick={() => updateCell(row.id as string | number, "qaPic", "")}>Unassign</button>
                                            </div>
                                          ) : isUnassigned ? (
                                            <button className="text-[10px] px-2 py-0.5 rounded-full border border-primary text-primary hover:bg-primary/10 transition" onClick={() => updateCell(row.id as string | number, "qaPic", currentUser?.name || "")}>+ Assign to me</button>
                                          ) : (
                                            <span className="text-xs text-muted-foreground">{row.qaPic}</span>
                                          )
                                        ) : (
                                          <select className="flex h-7 w-full rounded-md border border-input bg-transparent px-2 text-xs shadow-sm focus-visible:outline-none" value={row.qaPic || ""} onChange={e => updateCell(row.id as string | number, "qaPic", e.target.value)}>
                                            <option value="">Select QA PIC...</option>
                                            {qaUsers.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                                          </select>
                                        )}
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Redmine Defect ID</div>
                                        {canEdit ? <Textarea className="min-h-[50px] text-xs" value={row.defectNumber || ""} placeholder="e.g. 38032" onChange={e => updateCell(row.id as string | number, "defectNumber", e.target.value)} /> : <p className="text-xs text-muted-foreground">{row.defectNumber || "—"}</p>}
                                      </div>
                                      <div>
                                        <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">QA Notes</div>
                                        {canEdit ? <Textarea className="min-h-[50px] text-xs" value={row.comments || ""} onChange={e => updateCell(row.id as string | number, "comments", e.target.value)} /> : <p className="text-xs text-muted-foreground">{row.comments || "—"}</p>}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* PULL FROM TEST CASES LIBRARY DIALOG */}
      <Dialog open={pullDialogOpen} onOpenChange={o => { if (!o) { setPullDialogOpen(false); setSelectedPullIds(new Set()); } }}>
        <DialogContent className="sm:max-w-[600px] w-[95vw] flex flex-col max-h-[85vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-primary" /> Pull from Test Case Library
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3 py-2">
            {isPullLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : (
              <>
                <div className="flex gap-2 flex-wrap">
                  <select className="flex h-8 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm flex-1 min-w-[140px]"
                    value={pullFilter.projectId ?? ""}
                    onChange={e => setPullFilter(f => ({ ...f, projectId: e.target.value ? Number(e.target.value) : undefined, module: undefined }))}>
                    <option value="">All Projects</option>
                    {libraryProjects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <select className="flex h-8 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm flex-1 min-w-[140px]"
                    value={pullFilter.module ?? ""}
                    onChange={e => setPullFilter(f => ({ ...f, module: e.target.value || undefined }))}>
                    <option value="">All Modules</option>
                    {Array.from(new Set(libraryTestCases
                      .filter((tc: any) => !pullFilter.projectId || tc.projectId === pullFilter.projectId)
                      .map((tc: any) => tc.module).filter(Boolean)
                    )).map(m => <option key={m as string} value={m as string}>{m as string}</option>)}
                  </select>
                  <span className="text-xs text-muted-foreground self-center">{selectedPullIds.size} selected</span>
                </div>
                <div className="border rounded-md divide-y divide-border overflow-y-auto max-h-[340px]">
                  {libraryTestCases.filter((tc: any) => {
                    if (pullFilter.projectId && tc.projectId !== pullFilter.projectId) return false;
                    if (pullFilter.module && tc.module !== pullFilter.module) return false;
                    return true;
                  }).map((tc: any) => (
                    <label key={tc.id} className="flex items-start gap-3 px-3 py-2 hover:bg-muted/40 cursor-pointer">
                      <input type="checkbox" className="mt-0.5 w-4 h-4 rounded border-gray-300 shrink-0"
                        checked={selectedPullIds.has(tc.id)}
                        onChange={e => setSelectedPullIds(prev => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(tc.id); else next.delete(tc.id);
                          return next;
                        })} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{tc.title}</div>
                        <div className="text-xs text-muted-foreground">{tc.module || "—"}{tc.projectName ? ` · ${tc.projectName}` : ""}</div>
                      </div>
                    </label>
                  ))}
                  {libraryTestCases.filter((tc: any) => {
                    if (pullFilter.projectId && tc.projectId !== pullFilter.projectId) return false;
                    if (pullFilter.module && tc.module !== pullFilter.module) return false;
                    return true;
                  }).length === 0 && (
                    <div className="py-8 text-center text-sm text-muted-foreground">No test cases match your filters.</div>
                  )}
                </div>
              </>
            )}
          </div>
          <DialogFooter className="shrink-0 border-t pt-4 flex-row justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => {
              const filtered = libraryTestCases.filter((tc: any) => {
                if (pullFilter.projectId && tc.projectId !== pullFilter.projectId) return false;
                if (pullFilter.module && tc.module !== pullFilter.module) return false;
                return true;
              });
              setSelectedPullIds(new Set(filtered.map((tc: any) => tc.id)));
            }}>Select All Filtered</Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPullDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleConfirmPull} disabled={selectedPullIds.size === 0 || isPulling} className="gap-2">
                {isPulling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Pull {selectedPullIds.size > 0 ? selectedPullIds.size : ""} Cases
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Promote to Library Dialog */}
      <Dialog open={!!promoteRow} onOpenChange={(open) => { if (!open) setPromoteRow(null); }}>
        <DialogContent className="w-[95vw] sm:max-w-[460px] flex flex-col max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Library className="w-5 h-5 text-primary" />
              Promote to Library
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
            <p className="text-sm text-muted-foreground">
              Saves <span className="font-medium text-foreground">"{promoteRow?.caseName || promoteRow?.scenario || "this row"}"</span> as a reusable test case in the library.
            </p>

            {/* Requirement (optional) */}
            <div className="space-y-1.5">
              <Label>Requirement <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <SearchableSelect
                value={promoteForm.requirementId}
                onValueChange={(v) => {
                  const req = promoteRequirements.find((r: any) => String(r.id) === v);
                  setPromoteForm(f => ({
                    ...f,
                    requirementId: v,
                    projectId: req?.projectId ? String(req.projectId) : f.projectId,
                    module: req?.module || f.module,
                  }));
                }}
                options={[
                  { value: "", label: "None" },
                  ...promoteRequirements.map((r: any) => ({ value: String(r.id), label: r.title })),
                ]}
                placeholder="Search requirement..."
                searchPlaceholder="Search requirement..."
              />
            </div>

            {/* Project (mandatory) */}
            <div className="space-y-1.5">
              <Label>Project <span className="text-destructive">*</span></Label>
              <SearchableSelect
                value={promoteForm.projectId}
                onValueChange={(v) => setPromoteForm(f => ({ ...f, projectId: v }))}
                options={[
                  { value: "", label: "Select project..." },
                  ...libraryProjects.map((p: any) => ({ value: String(p.id), label: p.name })),
                ]}
                placeholder="Select project..."
                searchPlaceholder="Search project..."
              />
            </div>

            {/* Module (mandatory) */}
            <div className="space-y-1.5">
              <Label>Module <span className="text-destructive">*</span></Label>
              <SearchableSelect
                value={promoteForm.module}
                onValueChange={(v) => setPromoteForm(f => ({ ...f, module: v }))}
                options={[
                  { value: "", label: "Select module..." },
                  ...availableModules.map((m) => ({ value: m.name, label: m.name })),
                ]}
                placeholder="Select module..."
                searchPlaceholder="Search module..."
              />
            </div>
          </div>
          <DialogFooter className="gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => setPromoteRow(null)} disabled={isPromoting}>
              Cancel
            </Button>
            <Button
              onClick={handlePromote}
              disabled={!promoteForm.projectId || !promoteForm.module || isPromoting}
              className="gap-2"
            >
              {isPromoting
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Promoting...</>
                : <><Library className="w-4 h-4" /> Promote to Library</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
