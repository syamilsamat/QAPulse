import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
} from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import * as XLSX from "xlsx-js-style";
import { format } from "date-fns";
import {
  fetchTestCases,
  saveTestCases,
  fetchModules,
  fetchUsers,
  fetchExecutionFiles,
  fetchTrackers,
  type ExecutionTestCase,
  type ExecutionModule,
  type ExecutionUser,
  type TrackerOption,
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

export type AppExecutionTestCase = ExecutionTestCase & { tracker?: string };

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
            border: `1.5px solid ${value === p.value ? p.border : "var(--border)"}`,
            color: value === p.value ? p.color : "var(--muted-foreground)",
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
  onBlurRow: (id: string | number) => void;
  availableModules: ExecutionModule[];
  availableTrackers: TrackerOption[];
  qaUsers: ExecutionUser[];
  hiddenCols: Set<string>;
  mode: "execute" | "edit";
  isDirty: boolean;
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
    onBlurRow,
    availableModules,
    availableTrackers,
    qaUsers,
    hiddenCols,
    mode,
    isDirty,
  }: RowProps) => {
    const hide = (col: string) => hiddenCols.has(col);
    const defectIds = parseDefectIds(row.defectNumber || "");
    const readOnly = mode === "execute";

    const roCell = (value: string | undefined) => (
      <span className="text-xs text-foreground whitespace-pre-wrap">{value || <span className="italic opacity-40">—</span>}</span>
    );

    return (
      <tr
        className="hover:bg-muted/10 group align-top"
        style={{ borderLeft: isDirty ? "3px solid #378ADD" : "3px solid transparent" }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            onBlurRow(row.id as string | number);
          }
        }}
      >
        <td className="border border-border text-center text-xs font-sans text-muted-foreground bg-muted/5 py-2">
          <input type="checkbox" className="w-4 h-4 rounded border-gray-300 cursor-pointer"
            checked={isSelected} onChange={(e) => onToggleSelect(row.id as string | number, e.target.checked)} />
        </td>
        <td className="border border-border p-0 relative align-top">
          {readOnly
            ? <div className="px-2 py-2">{roCell(row.moduleName)}</div>
            : <select className={tableSelectClass} value={row.moduleName || ""} onChange={(e) => onUpdate(row.id as string, "moduleName", e.target.value)}>
                <option value="">Select...</option>
                {availableModules.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
              </select>
          }
        </td>
        {!hide("testCaseId") && (
          <td className="border border-border px-2 py-2 align-top">
            <span className="text-xs text-muted-foreground font-mono select-all">{row.testCaseId || "—"}</span>
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
          <ResultPills value={row.result || ""} onChange={(v) => onUpdate(row.id as string, "result", v)} disabled={!readOnly} />
        </td>
        {!hide("executedAt") && (
          <td className="border border-border px-2 py-2 align-top text-xs text-muted-foreground whitespace-nowrap min-w-[120px]">
            {row.executedAt ? new Date(row.executedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
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
          <TableAutoTextarea
            className={`h-full w-full text-xs md:text-xs font-sans rounded-none border-0 focus-visible:ring-1 focus-visible:ring-primary focus:z-10 bg-transparent shadow-none text-left px-2 py-2 resize-none block ${defectIds.length > 0 ? "min-h-[36px]" : "min-h-[80px]"}`}
            value={row.defectNumber || ""}
            onChange={(e) => onUpdate(row.id as string, "defectNumber", e.target.value)}
            placeholder={defectIds.length > 0 ? "" : "e.g. 38032, 38033"}
          />
        </td>
        {!hide("comments") && (
          <td className="border border-border p-0 relative align-top">
            <TableAutoTextarea className={tableInputClass} value={row.comments || ""} onChange={(e) => onUpdate(row.id as string, "comments", e.target.value)} />
          </td>
        )}
        <td className="border border-border p-0 relative align-top">
          <select className={`${tableSelectClass}`} value={row.qaPic || ""} onChange={(e) => onUpdate(row.id as string, "qaPic", e.target.value)}>
            <option value="">Select QA PIC...</option>
            {qaUsers.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
          </select>
        </td>
        <td className="border border-border p-0 text-center align-top pt-2">
          <div className="flex flex-col items-center gap-1">
            {!readOnly && !row.libraryTcId && (
              <Button
                variant="ghost"
                size="icon"
                title="Promote to Library"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-opacity"
                onClick={() => onPromote(row)}
              >
                <Library className="w-4 h-4" />
              </Button>
            )}
            {!readOnly && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                onClick={() => onDelete(row.id as string | number)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </td>
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
    availableModules,
    availableTrackers,
    qaUsers,
    hiddenCols,
    mode,
    isDirty,
  }: RowProps) => {
    const readOnly = mode === "execute";
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
            <ResultPills value={row.result || ""} onChange={(v) => onUpdate(row.id as string, "result", v)} disabled={!readOnly} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground uppercase font-bold">
              Test Case ID
            </Label>
            <div className="min-h-[40px] flex items-center px-2 py-1 text-xs font-mono text-muted-foreground border border-input rounded-md bg-muted/20">
              {row.testCaseId || "—"}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground uppercase font-bold">
              Redmine Ticket ID
            </Label>
            <TableAutoTextarea
              className="min-h-[60px] text-xs md:text-xs p-2"
              value={row.userStory || ""}
              onChange={(e) =>
                onUpdate(row.id as string, "userStory", e.target.value)
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground uppercase font-bold">
              Tracker
            </Label>
            <select
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
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground uppercase font-bold">
              Test Data
            </Label>
            <TableAutoTextarea
              className="min-h-[40px] text-xs md:text-xs p-2"
              value={row.testData || ""}
              onChange={(e) =>
                onUpdate(row.id as string, "testData", e.target.value)
              }
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1">
            Scenario <Sparkles className="w-3 h-3 text-primary" />
          </Label>
          <div className="border border-input rounded-md focus-within:ring-1">
            <CopilotTextarea
              className="text-xs p-2 bg-transparent"
              value={row.scenario}
              fieldName="Scenario"
              minHeight="60px"
              onChange={(val: string) =>
                onUpdate(row.id as string, "scenario", val)
              }
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1">
            Case <Sparkles className="w-3 h-3 text-primary" />
          </Label>
          <div className="border border-input rounded-md focus-within:ring-1">
            <CopilotTextarea
              className="text-xs p-2 bg-transparent"
              value={row.caseName}
              fieldName="Case Name"
              minHeight="60px"
              onChange={(val: string) =>
                onUpdate(row.id as string, "caseName", val)
              }
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1">
            Steps <Sparkles className="w-3 h-3 text-primary" />
          </Label>
          <div className="border border-input rounded-md focus-within:ring-1">
            <CopilotTextarea
              className="text-xs p-2 bg-transparent"
              value={row.testSteps}
              fieldName="Test Steps"
              minHeight="80px"
              onChange={(val: string) =>
                onUpdate(row.id as string, "testSteps", val)
              }
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1">
            Expected Result <Sparkles className="w-3 h-3 text-primary" />
          </Label>
          <div className="border border-input rounded-md focus-within:ring-1">
            <CopilotTextarea
              className="text-xs p-2 bg-transparent"
              value={row.expectedResult}
              fieldName="Expected Result"
              minHeight="60px"
              onChange={(val: string) =>
                onUpdate(row.id as string, "expectedResult", val)
              }
            />
          </div>
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
            <TableAutoTextarea
              className="min-h-[40px] text-xs md:text-xs p-2"
              value={row.defectNumber || ""}
              placeholder="e.g. 38032, 38033"
              onChange={(e) =>
                onUpdate(row.id as string, "defectNumber", e.target.value)
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground uppercase font-bold">
              QA PIC
            </Label>
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
          </div>
        </div>

        <div className="space-y-1 pt-1">
          <Label className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1">
            Additional/Comments/Issues
          </Label>
          <TableAutoTextarea
            className="min-h-[40px] text-xs md:text-xs p-2"
            value={row.comments || ""}
            onChange={(e) =>
              onUpdate(row.id as string, "comments", e.target.value)
            }
          />
        </div>
      </Card>
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
  const [qaUsers, setQaUsers] = useState<ExecutionUser[]>([]);
  const [data, setData] = useState<AppExecutionTestCase[]>([]);

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

  // Search & Filtering State
  const [globalSearch, setGlobalSearch] = useState("");
  const [moduleFilters, setModuleFilters] = useState<string[]>([]);
  const [resultFilters, setResultFilters] = useState<string[]>([]);
  const [qaFilters, setQaFilters] = useState<string[]>([]);
  const hasSetDefaultQaFilter = useRef(false);

  // Defect creation modal
  const [defectModalOpen, setDefectModalOpen] = useState(false);
  const [pendingFailRowId, setPendingFailRowId] = useState<string | number | null>(null);
  const pendingFailRowIdRef = useRef<string | number | null>(null);

  // Linked task warning
  const [linkedTask, setLinkedTask] = useState<{ name: string; status: string; type?: string; projectName?: string | null } | null | undefined>(undefined);

  // Execute / Edit mode — always defaults to "execute" on file open
  const [mode, setMode] = useState<"execute" | "edit">("execute");

  // Column visibility
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set(["tracker", "preCondition", "userStory"]));
  const [showColPicker, setShowColPicker] = useState(false);

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
      fetch("/api/tasks", { headers: getHeaders() }).then(r => r.ok ? r.json() : []),
    ])
      .then(([result, allModules, users, files, trackersData, allTasks]) => {
        setAvailableTrackers(trackersData || []);
        const testCases = result?.testCases || [];
        const file = files.find((f) => String(f.redmineTicketId) === String(ticketId));
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

        const matched = (allTasks || []).find((t: any) => String(t.redmineId) === ticketId);
        setLinkedTask(matched ? { name: matched.name, status: matched.status, type: matched.type, projectName: matched.projectName } : null);
      })
      .catch(() =>
        toast({
          variant: "destructive",
          title: "Failed to load spreadsheet data",
        }),
      )
      .finally(() => setIsLoading(false));
  }, [ticketId, toast]);

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
  });

  const handleAddRow = () => {
    const row = createEmptyRow();
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

  useEffect(() => {
    const interval = setInterval(async () => {
      const dirty = dirtyRowIdsRef.current;
      const deleted = deletedDbIdsRef.current;
      if (dirty.size === 0 && deleted.size === 0) return;

      setSaveStatus("saving");
      try {
        const currentData = dataRef.current;
        const rowsToSave = currentData
          .filter((r) => dirty.has(r.id))
          .map((r, _i) => ({
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
    }, 10000);

    return () => clearInterval(interval);
  }, [ticketId]);

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
        const aid = a.testCaseId || "";
        const bid = b.testCaseId || "";
        // Rows without a testCaseId go to the bottom
        if (!aid && !bid) return 0;
        if (!aid) return 1;
        if (!bid) return -1;
        return aid.localeCompare(bid, undefined, { numeric: true, sensitivity: "base" });
      });
  }, [data, globalSearch, moduleFilters, resultFilters, qaFilters]);

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
        row.result === "Pending"
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
      if (linkedTask?.name) params.set("issueSubject", linkedTask.name);
      if (linkedTask?.type) params.set("issueType", linkedTask.type);
      if (linkedTask?.projectName) params.set("projectName", linkedTask.projectName);
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

  const normalizeHeader = (val: any) => {
    if (typeof val !== "string") return "";
    return val
      .toLowerCase()
      .replace(/[\n\r\t]/g, " ")
      .trim();
  };

  const normalizeResultValue = (val: string) => {
    if (!val) return "";
    const clean = val.toLowerCase().trim();
    if (clean.includes("pass")) return "Passed";
    if (clean.includes("fail")) return "Failed";
    if (clean.includes("block")) return "Blocked";
    if (clean.includes("prog")) return "In Progress";
    if (
      clean.includes("exec") ||
      clean.includes("res") ||
      clean.includes("not")
    )
      return "Not Executed";
    return val.trim();
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

        // 1. NEW: Add a variable to track the active module for the current sheet
        let currentActiveModule = "";

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

          // 2. MODIFIED: If identical across all columns, treat it as a module header
          if (
            extractedValues.length > 1 &&
            extractedValues.every((val) => val === extractedValues[0])
          ) {
            currentActiveModule = extractedValues[0]; // Capture the module name
            totalRowsSkipped++; // Skip adding this as an actual test case row
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
            // 3. MODIFIED: Fallback to currentActiveModule if the row doesn't specify one
            moduleName: extracted.moduleName || currentActiveModule || "",
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
              {linkedTask?.name && (
                <span className="text-muted-foreground font-normal">— {linkedTask.name}</span>
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
          {selectedRows.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => confirmDeleteMulti(selectedRows)}
              className="flex-1 lg:flex-none gap-2"
            >
              <Trash2 className="w-4 h-4" /> Delete Selected ({selectedRows.length})
            </Button>
          )}

          {/* Mode toggle */}
          <div className="flex border border-border rounded-lg overflow-hidden text-xs font-medium">
            <button
              onClick={() => setMode("execute")}
              className={`px-3 py-1.5 transition-colors ${mode === "execute" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
            >
              Execute
            </button>
            <button
              onClick={() => setMode("edit")}
              className={`px-3 py-1.5 transition-colors ${mode === "edit" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
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

          {/* Utilities */}
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

      {/* LINKED TASK WARNING BANNER */}
      {linkedTask === null && (
        <div className="shrink-0 flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>No linked task found for Ticket #{ticketId}. Create a task in the Tasks page first to track this execution properly.</span>
        </div>
      )}

      {/* EDIT MODE WARNING BANNER */}
      {mode === "edit" && (
        <div className="shrink-0 flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-3 py-2 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>You're editing the execution copy. Changes won't update the library TC.</span>
        </div>
      )}

      {/* GLOBAL SEARCH & FILTER BAR */}
      <div className="flex flex-col gap-2 bg-muted/30 border border-border p-2 rounded-lg shrink-0">
        <div className="flex flex-col lg:flex-row gap-2 items-start lg:items-center justify-between">
          <div className="relative w-full lg:w-96 shrink-0">
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
          <div className="flex items-center gap-2 text-xs text-muted-foreground w-full lg:w-auto justify-end flex-wrap">
            <Filter className="w-3.5 h-3.5" />
            <span>{filteredData.length} records{totalActiveFilters > 0 ? ` (${totalActiveFilters} filters)` : ""}</span>
            {totalActiveFilters > 0 && (
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2"
                onClick={() => { setModuleFilters([]); setResultFilters([]); setQaFilters([]); }}>
                Clear Filters
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1"
              onClick={() => setShowColPicker(v => !v)}>
              <span>Columns</span>
            </Button>
          </div>
        </div>

        {/* Filter Badges Container */}
        <div className="flex flex-col lg:flex-row gap-3 overflow-hidden mt-1">
          {/* Module Filters */}
          <div className="flex-1 min-w-0">
            <Label className="text-[10px] font-bold text-muted-foreground uppercase mb-1.5 block">
              Filter by Module
            </Label>
            <div className="flex flex-wrap gap-1.5 max-h-[60px] overflow-y-auto">
              {uniqueModules.length > 0 ? (
                uniqueModules.map((m) => (
                  <button
                    key={m}
                    onClick={() => toggleFilter("module", m)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                      moduleFilters.includes(m)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {m}
                  </button>
                ))
              ) : (
                <span className="text-[10px] text-muted-foreground italic">
                  No modules available
                </span>
              )}
            </div>
          </div>

          {/* Result Filters */}
          <div className="flex-1 min-w-0">
            <Label className="text-[10px] font-bold text-muted-foreground uppercase mb-1.5 block">
              Filter by Result
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {RESULT_OPTIONS.filter(Boolean).map((r) => (
                <button
                  key={r}
                  onClick={() => toggleFilter("result", r)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                    resultFilters.includes(r)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {r}
                </button>
              ))}
              <button
                onClick={() => toggleFilter("result", "")}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                  resultFilters.includes("")
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                Pending/Empty
              </button>
            </div>
          </div>

          {/* QA PIC Filters */}
          <div className="flex-1 min-w-0">
            <Label className="text-[10px] font-bold text-muted-foreground uppercase mb-1.5 block">
              Filter by QA PIC
            </Label>
            <div className="flex flex-wrap gap-1.5 max-h-[60px] overflow-y-auto">
              {uniqueQA.map((qa) => (
                <button
                  key={qa}
                  onClick={() => toggleFilter("qa", qa)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                    qaFilters.includes(qa)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {qa}
                </button>
              ))}
              <button
                onClick={() => toggleFilter("qa", "")}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                  qaFilters.includes("")
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                No QA Assigned
              </button>
            </div>
          </div>
        </div>

        {/* Column visibility picker */}
        {showColPicker && (
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
              { key: "comments", label: "Comments" },
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

      {/* DESKTOP SPREADSHEET VIEW */}
      <Card className="hidden lg:flex flex-1 overflow-hidden border rounded-md shadow-sm min-h-[450px]">
        {filteredData.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
            <Search className="w-10 h-10 mb-4 opacity-20" />
            <p>No test cases match your current filters and search criteria.</p>
            <Button
              variant="link"
              onClick={() => {
                setGlobalSearch("");
                setModuleFilters([]);
                setResultFilters([]);
                setQaFilters([]);
              }}
            >
              Clear all filters
            </Button>
          </div>
        ) : (
          <div className="flex-1 overflow-auto bg-card">
            <table className="w-full text-sm border-collapse min-w-[2840px]">
              <thead className="sticky top-0 z-20 bg-muted/90 backdrop-blur shadow-sm">
                <tr className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <th className="border border-border w-10 p-2 text-center">
                    <input type="checkbox" className="w-4 h-4 rounded border-gray-300 cursor-pointer"
                      checked={filteredData.length > 0 && selectedRows.length === filteredData.length}
                      onChange={(e) => handleSelectAll(e.target.checked)} />
                  </th>
                  <th className="border border-border w-48 p-2 text-left">Module Name</th>
                  {!hiddenCols.has("testCaseId") && <th className="border border-border w-48 p-2 text-left">Test Case ID</th>}
                  {!hiddenCols.has("userStory") && <th className="border border-border w-48 p-2 text-left">Redmine Ticket ID</th>}
                  {!hiddenCols.has("tracker") && <th className="border border-border w-48 p-2 text-left">Tracker</th>}
                  {!hiddenCols.has("scenario") && <th className="border border-border w-64 p-2 text-left">Scenario <Sparkles className="w-3 h-3 inline text-primary" /></th>}
                  {!hiddenCols.has("preCondition") && <th className="border border-border w-48 p-2 text-left">Pre Condition</th>}
                  <th className="border border-border w-64 p-2 text-left">Case <Sparkles className="w-3 h-3 inline text-primary" /></th>
                  <th className="border border-border w-64 p-2 text-left">Steps <Sparkles className="w-3 h-3 inline text-primary" /></th>
                  {!hiddenCols.has("testData") && <th className="border border-border w-48 p-2 text-left">Test Data</th>}
                  <th className="border border-border w-64 p-2 text-left">Expected Result <Sparkles className="w-3 h-3 inline text-primary" /></th>
                  <th className="border border-border w-48 p-2 text-left text-primary">Result</th>
                  {!hiddenCols.has("executedAt") && <th className="border border-border w-36 p-2 text-left">Executed At</th>}
                  <th className="border border-border w-48 p-2 text-left">Redmine Defect ID</th>
                  {!hiddenCols.has("comments") && <th className="border border-border w-64 p-2 text-left">Comments</th>}
                  <th className="border border-border w-48 p-2 text-left">QA PIC</th>
                  <th className="border border-border w-10 p-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((row, index) => (
                  <DesktopTableRow
                    key={row.id as string}
                    row={row}
                    index={index}
                    isSelected={selectedRows.includes(row.id as string | number)}
                    onToggleSelect={handleSelectRow}
                    onUpdate={updateCell}
                    onDelete={requestSingleDelete}
                    onPromote={openPromoteDialog}
                    onBlurRow={saveBlurRow}
                    availableModules={availableModules}
                    availableTrackers={availableTrackers}
                    qaUsers={qaUsers}
                    hiddenCols={hiddenCols}
                    mode={mode}
                    isDirty={dirtyRowIds.has(row.id as string | number)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* MOBILE CARD VIEW */}
      <div className="lg:hidden flex-1 flex flex-col gap-3 overflow-y-auto min-h-[450px] pb-4">
        {filteredData.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-muted-foreground p-8 border border-dashed rounded-lg">
            <Search className="w-8 h-8 mb-4 opacity-20" />
            <p className="text-center text-sm">No test cases match filters.</p>
          </div>
        ) : (
          filteredData.map((row, index) => (
            <MobileCardRow
              key={row.id as string}
              row={row}
              index={index}
              isSelected={selectedRows.includes(row.id as string | number)}
              onToggleSelect={handleSelectRow}
              onUpdate={updateCell}
              onDelete={requestSingleDelete}
              onPromote={openPromoteDialog}
              onBlurRow={saveBlurRow}
              availableModules={availableModules}
              availableTrackers={availableTrackers}
              qaUsers={qaUsers}
              hiddenCols={hiddenCols}
              mode={mode}
              isDirty={dirtyRowIds.has(row.id as string | number)}
            />
          ))
        )}
        {mode === "edit" && (
          <Button
            variant="secondary"
            className="w-full py-6 border-dashed"
            onClick={handleAddRow}
          >
            <Plus className="w-5 h-5 mr-2" /> Add Another Row
          </Button>
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
