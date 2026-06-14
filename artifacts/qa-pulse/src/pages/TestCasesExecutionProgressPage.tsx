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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx-js-style";
import {
  fetchTestCases,
  saveTestCases,
  fetchModules,
  fetchUsers,
  fetchExecutionFiles,
  type ExecutionTestCase,
  type ExecutionModule,
  type ExecutionUser,
} from "@/lib/execution-api";

const RESULT_OPTIONS = [
  "Passed",
  "Failed",
  "Blocked",
  "In Progress",
  "Not Executed",
  "",
];

const COLUMN_MAPPINGS: Record<string, string[]> = {
  caseId: ["case id", "test case id", "tc id", "id"],
  userStory: [
    "user story",
    "story",
    "requirement",
    "requirement id",
    "redmine user story",
  ],
  scenario: ["scenario", "tracker scenario"],
  preCondition: [
    "pre condition",
    "preconditions",
    "pre-conditions",
    "precondition",
  ],
  caseName: ["case", "case name", "title"],
  testSteps: ["test steps", "steps", "testing steps"],
  testData: ["test data", "data"],
  expectedResult: ["expected result", "expected outcome", "expected results"],
  result: ["result", "status", "test result"],
  defectNumber: [
    "redmine defect",
    "defect id",
    "bug id",
    "redmine id",
    "redmine defect number",
  ],
  qaPic: ["qa pic", "qa owner", "tester", "assigned qa"],
  comments: [
    "additional / comments / issues",
    "additional/comments/issues",
    "comments",
    "additional",
    "issues",
    "remarks",
  ],
  moduleName: ["module name", "module", "feature"],
};

const tableInputClass =
  "h-full w-full text-xs font-sans rounded-none border-0 focus-visible:ring-1 focus-visible:ring-primary focus:z-10 bg-transparent shadow-none text-left px-2 py-2 min-h-[80px] resize-none block";
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

/**
 * 🤖 CopilotTextarea: AI-Assisted Typing Component
 */
const CopilotTextarea = ({
  value,
  onChange,
  fieldName,
  className,
  minHeight = "80px",
}: any) => {
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

// --- MEMOIZED ROW COMPONENTS FOR PERFORMANCE ---
interface RowProps {
  row: ExecutionTestCase;
  index: number;
  isSelected: boolean;
  onToggleSelect: (id: string | number, checked: boolean) => void;
  onUpdate: (
    id: string | number,
    field: keyof ExecutionTestCase,
    value: string,
  ) => void;
  onDelete: (id: string | number) => void;
  availableModules: ExecutionModule[];
  qaUsers: ExecutionUser[];
}

const DesktopTableRow = React.memo(
  ({
    row,
    index,
    isSelected,
    onToggleSelect,
    onUpdate,
    onDelete,
    availableModules,
    qaUsers,
  }: RowProps) => {
    return (
      <tr className="hover:bg-muted/10 group align-top">
        <td className="border border-border text-center text-xs font-sans text-muted-foreground bg-muted/5 py-2">
          <input
            type="checkbox"
            className="w-4 h-4 rounded border-gray-300 cursor-pointer"
            checked={isSelected}
            onChange={(e) =>
              onToggleSelect(row.id as string | number, e.target.checked)
            }
          />
        </td>
        <td className="border border-border text-center text-xs font-sans text-muted-foreground bg-muted/5 py-2">
          {index + 1}
        </td>
        <td className="border border-border p-0 relative align-top">
          <select
            className={tableSelectClass}
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
        </td>
        <td className="border border-border p-0 relative align-top">
          <Textarea
            className={tableInputClass}
            value={row.caseId || ""}
            onChange={(e) =>
              onUpdate(row.id as string, "caseId", e.target.value)
            }
          />
        </td>
        <td className="border border-border p-0 relative align-top">
          <Textarea
            className={tableInputClass}
            value={row.userStory || ""}
            onChange={(e) =>
              onUpdate(row.id as string, "userStory", e.target.value)
            }
          />
        </td>
        <td className="border border-border p-0 relative align-top">
          <CopilotTextarea
            className={tableInputClass}
            value={row.scenario || ""}
            fieldName="Scenario"
            minHeight="80px"
            onChange={(val: string) =>
              onUpdate(row.id as string, "scenario", val)
            }
          />
        </td>
        <td className="border border-border p-0 relative align-top">
          <Textarea
            className={tableInputClass}
            value={row.preCondition || ""}
            onChange={(e) =>
              onUpdate(row.id as string, "preCondition", e.target.value)
            }
          />
        </td>
        <td className="border border-border p-0 relative align-top">
          <CopilotTextarea
            className={tableInputClass}
            value={row.caseName || ""}
            fieldName="Case Name"
            minHeight="80px"
            onChange={(val: string) =>
              onUpdate(row.id as string, "caseName", val)
            }
          />
        </td>
        <td className="border border-border p-0 relative align-top">
          <CopilotTextarea
            className={tableInputClass}
            value={row.testSteps || ""}
            fieldName="Test Steps"
            minHeight="80px"
            onChange={(val: string) =>
              onUpdate(row.id as string, "testSteps", val)
            }
          />
        </td>
        <td className="border border-border p-0 relative align-top">
          <Textarea
            className={tableInputClass}
            value={row.testData || ""}
            onChange={(e) =>
              onUpdate(row.id as string, "testData", e.target.value)
            }
          />
        </td>
        <td className="border border-border p-0 relative align-top">
          <CopilotTextarea
            className={tableInputClass}
            value={row.expectedResult || ""}
            fieldName="Expected Results"
            minHeight="80px"
            onChange={(val: string) =>
              onUpdate(row.id as string, "expectedResult", val)
            }
          />
        </td>
        <td className="border border-border p-0 bg-primary/5 relative align-top">
          <select
            className={`${tableSelectClass} font-semibold`}
            value={row.result || ""}
            onChange={(e) =>
              onUpdate(row.id as string, "result", e.target.value)
            }
          >
            {RESULT_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r || "Select..."}
              </option>
            ))}
          </select>
        </td>
        <td className="border border-border p-0 relative align-top">
          <Textarea
            className={tableInputClass}
            value={row.defectNumber || ""}
            onChange={(e) =>
              onUpdate(row.id as string, "defectNumber", e.target.value)
            }
          />
        </td>
        <td className="border border-border p-0 relative align-top">
          <Textarea
            className={tableInputClass}
            value={row.comments || ""}
            onChange={(e) =>
              onUpdate(row.id as string, "comments", e.target.value)
            }
          />
        </td>
        <td className="border border-border p-0 relative align-top">
          <select
            className={`${tableSelectClass}`}
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
        </td>
        <td className="border border-border p-0 text-center align-top pt-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity mx-auto block"
            onClick={() => onDelete(row.id as string | number)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
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
    availableModules,
    qaUsers,
  }: RowProps) => {
    return (
      <Card
        className={`p-3 space-y-3 shadow-sm relative transition-colors ${isSelected ? "bg-primary/5 border-primary/30" : ""}`}
      >
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
              value={row.moduleName}
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
            <select
              className="flex min-h-[40px] w-full rounded-md border border-primary bg-primary/5 px-2 text-xs font-bold shadow-sm focus-visible:outline-none focus-visible:ring-1"
              value={row.result}
              onChange={(e) =>
                onUpdate(row.id as string, "result", e.target.value)
              }
            >
              {RESULT_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r || "Pending"}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground uppercase font-bold">
              Case ID
            </Label>
            <Textarea
              className="min-h-[60px] text-xs p-2"
              value={row.caseId}
              onChange={(e) =>
                onUpdate(row.id as string, "caseId", e.target.value)
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground uppercase font-bold">
              User Story
            </Label>
            <Textarea
              className="min-h-[60px] text-xs p-2"
              value={row.userStory}
              onChange={(e) =>
                onUpdate(row.id as string, "userStory", e.target.value)
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
            Case Name / Title <Sparkles className="w-3 h-3 text-primary" />
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
            Test Steps <Sparkles className="w-3 h-3 text-primary" />
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

        <div className="grid grid-cols-2 gap-3 pt-2 border-t">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground uppercase font-bold">
              Defect #
            </Label>
            <Textarea
              className="min-h-[40px] text-xs p-2"
              value={row.defectNumber}
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
              value={row.qaPic}
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
      </Card>
    );
  },
);

export default function TestCasesExecutionProgressPage() {
  const [, params] = useRoute("/test-cases/execution/:id");
  const [, setLocation] = useLocation();
  const ticketId = params?.id || "Unknown";
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [availableModules, setAvailableModules] = useState<ExecutionModule[]>(
    [],
  );
  const [qaUsers, setQaUsers] = useState<ExecutionUser[]>([]);
  const [data, setData] = useState<ExecutionTestCase[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(
    null,
  );

  const [pendingImportData, setPendingImportData] = useState<
    ExecutionTestCase[] | null
  >(null);
  const [pendingImportSummary, setPendingImportSummary] =
    useState<ImportSummary | null>(null);
  const [showModuleSelectDialog, setShowModuleSelectDialog] = useState(false);
  const [selectedImportModule, setSelectedImportModule] = useState<string>("");

  const [selectedRows, setSelectedRows] = useState<(string | number)[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [rowsToDelete, setRowsToDelete] = useState<(string | number)[]>([]);

  // Search & Filtering State
  const [globalSearch, setGlobalSearch] = useState("");
  const [moduleFilters, setModuleFilters] = useState<string[]>([]);
  const [resultFilters, setResultFilters] = useState<string[]>([]);
  const [qaFilters, setQaFilters] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([
      fetchTestCases(ticketId),
      fetchModules(),
      fetchUsers(),
      fetchExecutionFiles(),
    ])
      .then(([result, allModules, users, files]) => {
        const testCases = result?.testCases || [];
        const file = files.find((f) => f.redmineTicketId === ticketId);
        const selectedModuleNames = file?.selectedModules
          ? file.selectedModules
              .split(",")
              .map((m) => m.trim())
              .filter(Boolean)
          : [];

        const filteredModules =
          selectedModuleNames.length > 0
            ? allModules.filter((m) => selectedModuleNames.includes(m.name))
            : allModules;

        if (testCases.length === 0) {
          if (selectedModuleNames.length === 1) {
            const firstRow = createEmptyRow();
            firstRow.moduleName = selectedModuleNames[0];
            setData([firstRow]);
          } else {
            setData([createEmptyRow()]);
          }
        } else {
          setData(testCases);
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

  const createEmptyRow = (): ExecutionTestCase => ({
    id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
    moduleName: "",
    caseId: "",
    userStory: "",
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

  const handleAddRow = () => setData((prev) => [...prev, createEmptyRow()]);

  // STABLE CALLBACKS FOR MEMOIZED ROWS
  const updateCell = useCallback(
    (id: string | number, field: keyof ExecutionTestCase, value: string) => {
      setData((prev) =>
        prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
      );
    },
    [],
  );

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
    return data.filter((row) => {
      if (globalSearch.trim()) {
        const searchLower = globalSearch.toLowerCase();
        const rowValues = Object.values(row).map((v) =>
          String(v).toLowerCase(),
        );
        const matchesSearch = rowValues.some((v) => v.includes(searchLower));
        if (!matchesSearch) return false;
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
    setData((prev) =>
      prev.filter((row) => !rowsToDelete.includes(row.id as string | number)),
    );
    setSelectedRows((prev) => prev.filter((id) => !rowsToDelete.includes(id)));
    setDeleteConfirmOpen(false);
    setRowsToDelete([]);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveTestCases(ticketId, data, null);
      toast({ title: `Database saved for Redmine Ticket ID #${ticketId}` });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to save to database" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadExcel = () => {
    const exportData = filteredData.map((row) => ({
      Module: row.moduleName || "",
      "Case ID": row.caseId || "",
      "User Story": row.userStory || "",
      Scenario: row.scenario || "",
      "Pre Condition": row.preCondition || "",
      Case: row.caseName || "",
      "Test Steps": row.testSteps || "",
      "Test Data": row.testData || "",
      "Expected Result": row.expectedResult || "",
      Result: row.result || "",
      "Redmine Defect": row.defectNumber || "",
      "Additional/Comments/Issues": row.comments || "",
      "QA PIC": row.qaPic || "",
    }));

    const headerOrder = [
      "Module",
      "Case ID",
      "User Story",
      "Scenario",
      "Pre Condition",
      "Case",
      "Test Steps",
      "Test Data",
      "Expected Result",
      "Result",
      "Redmine Defect",
      "Additional/Comments/Issues",
      "QA PIC",
    ];

    const ws = XLSX.utils.json_to_sheet(exportData, { header: headerOrder });

    if (ws["!ref"]) {
      const range = XLSX.utils.decode_range(ws["!ref"]);
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cell_ref = XLSX.utils.encode_cell({ c: C, r: R });
          if (!ws[cell_ref]) ws[cell_ref] = { t: "s", v: "" };

          ws[cell_ref].s = {
            border: {
              top: { style: "thin", color: { rgb: "000000" } },
              bottom: { style: "thin", color: { rgb: "000000" } },
              left: { style: "thin", color: { rgb: "000000" } },
              right: { style: "thin", color: { rgb: "000000" } },
            },
            alignment: { vertical: "top", wrapText: true },
          };

          if (R === 0) {
            ws[cell_ref].s.fill = {
              patternType: "solid",
              fgColor: { rgb: "1F4E78" },
            };
            ws[cell_ref].s.font = { bold: true, color: { rgb: "FFFFFF" } };
            ws[cell_ref].s.alignment = {
              vertical: "center",
              horizontal: "center",
              wrapText: true,
            };
          }
        }
      }
    }

    ws["!cols"] = [
      { wch: 15 },
      { wch: 12 },
      { wch: 15 },
      { wch: 20 },
      { wch: 25 },
      { wch: 25 },
      { wch: 35 },
      { wch: 20 },
      { wch: 25 },
      { wch: 15 },
      { wch: 15 },
      { wch: 30 },
      { wch: 20 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Test Cases");
    XLSX.writeFile(wb, `Test_Execution_${ticketId}.xlsx`);
  };

  const normalizeHeader = (val: any) => {
    if (typeof val !== "string") return "";
    return val
      .toLowerCase()
      .replace(/[\n\r\t]/g, " ")
      .trim();
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
      const consolidatedData: ExecutionTestCase[] = [];

      const allRequiredKeys = Object.keys(COLUMN_MAPPINGS).filter(
        (k) => k !== "moduleName",
      );
      const MIN_REQUIRED_COLUMNS = 7;

      for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
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
            currentMap["caseId"] !== undefined &&
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

          if (!hasMeaningfulData) {
            totalRowsSkipped++;
            continue;
          }

          const cid = extracted.caseId;
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
            moduleName: extracted.moduleName || "",
            caseId: extracted.caseId || "",
            userStory: extracted.userStory || "",
            scenario: extracted.scenario || "",
            preCondition: extracted.preCondition || "",
            caseName: extracted.caseName || "",
            testSteps: extracted.testSteps || "",
            testData: extracted.testData || "",
            expectedResult: extracted.expectedResult || "",
            result: extracted.result || "",
            defectNumber: extracted.defectNumber || "",
            comments: extracted.comments || "",
            qaPic: extracted.qaPic || "",
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
        if (availableModules.length === 1) {
          consolidatedData.forEach((r) => {
            if (!r.moduleName) r.moduleName = availableModules[0].name;
          });
          setData(consolidatedData);
          setImportSummary(summaryObj);
        } else if (availableModules.length > 1) {
          const hasMissingModules = consolidatedData.some((r) => !r.moduleName);
          if (hasMissingModules) {
            setPendingImportData(consolidatedData);
            setPendingImportSummary(summaryObj);
            setShowModuleSelectDialog(true);
          } else {
            setData(consolidatedData);
            setImportSummary(summaryObj);
          }
        } else {
          setData(consolidatedData);
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

  return (
    <div className="space-y-3 flex flex-col h-[calc(100dvh-4rem)] lg:h-[calc(100vh-6rem)] relative">
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
            <h1 className="text-xl font-bold flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-primary" /> Ticket #
              {ticketId}
            </h1>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              Test Case Execution Progress{" "}
              <Sparkles className="w-3 h-3 ml-1 text-primary" /> AI Copilot
              Active (Press Tab)
            </p>
            <p className="text-xs text-red-500 flex items-center gap-1">
              Always Save your works (If needed) before leaving this page.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedRows.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => confirmDeleteMulti(selectedRows)}
              className="flex-1 lg:flex-none gap-2"
            >
              <Trash2 className="w-4 h-4" /> Delete Selected (
              {selectedRows.length})
            </Button>
          )}
          <input
            type="file"
            accept=".xlsx, .xls"
            className="hidden"
            ref={fileInputRef}
            onChange={handleImportExcel}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="flex-1 lg:flex-none gap-2"
          >
            {isImporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Import
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadExcel}
            className="flex-1 lg:flex-none gap-2"
          >
            <Download className="w-4 h-4" /> Download
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleAddRow}
            className="flex-1 lg:flex-none gap-2"
          >
            <Plus className="w-4 h-4" /> Add Row
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            size="sm"
            className="w-full lg:w-auto gap-2"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}{" "}
            Save
          </Button>
        </div>
      </div>

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
          <div className="flex items-center gap-2 text-xs text-muted-foreground w-full lg:w-auto justify-end">
            <Filter className="w-3.5 h-3.5" />
            <span>
              {filteredData.length} records found
              {totalActiveFilters > 0
                ? ` (${totalActiveFilters} filters active)`
                : ""}
            </span>
            {totalActiveFilters > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] px-2 ml-2"
                onClick={() => {
                  setModuleFilters([]);
                  setResultFilters([]);
                  setQaFilters([]);
                }}
              >
                Clear Filters
              </Button>
            )}
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
              {uniqueQA.length > 0 ? (
                uniqueQA.map((qa) => (
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
                ))
              ) : (
                <span className="text-[10px] text-muted-foreground italic">
                  No QA assigned
                </span>
              )}
            </div>
          </div>
        </div>
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
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-gray-300 cursor-pointer"
                      checked={
                        filteredData.length > 0 &&
                        selectedRows.length === filteredData.length
                      }
                      onChange={(e) => handleSelectAll(e.target.checked)}
                    />
                  </th>
                  <th className="border border-border w-10 p-2 text-center">
                    #
                  </th>
                  <th className="border border-border w-64 p-2 text-left">
                    Module Name
                  </th>
                  <th className="border border-border w-64 p-2 text-left">
                    Case ID
                  </th>
                  <th className="border border-border w-64 p-2 text-left">
                    User Story
                  </th>
                  <th className="border border-border w-64 p-2 text-left">
                    Scenario{" "}
                    <Sparkles className="w-3 h-3 inline text-primary" />
                  </th>
                  <th className="border border-border w-64 p-2 text-left">
                    Pre Condition
                  </th>
                  <th className="border border-border w-64 p-2 text-left">
                    Case <Sparkles className="w-3 h-3 inline text-primary" />
                  </th>
                  <th className="border border-border w-64 p-2 text-left">
                    Test Steps{" "}
                    <Sparkles className="w-3 h-3 inline text-primary" />
                  </th>
                  <th className="border border-border w-64 p-2 text-left">
                    Test Data
                  </th>
                  <th className="border border-border w-64 p-2 text-left">
                    Expected Result{" "}
                    <Sparkles className="w-3 h-3 inline text-primary" />
                  </th>
                  <th className="border border-border w-64 p-2 text-left text-primary">
                    Result
                  </th>
                  <th className="border border-border w-64 p-2 text-left">
                    Defect #
                  </th>
                  <th className="border border-border w-64 p-2 text-left">
                    Comments
                  </th>
                  <th className="border border-border w-64 p-2 text-left">
                    QA PIC
                  </th>
                  <th className="border border-border w-10 p-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((row, index) => (
                  <DesktopTableRow
                    key={row.id as string}
                    row={row}
                    index={index}
                    isSelected={selectedRows.includes(
                      row.id as string | number,
                    )}
                    onToggleSelect={handleSelectRow}
                    onUpdate={updateCell}
                    onDelete={requestSingleDelete}
                    availableModules={availableModules}
                    qaUsers={qaUsers}
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
              availableModules={availableModules}
              qaUsers={qaUsers}
            />
          ))
        )}
        <Button
          variant="secondary"
          className="w-full py-6 border-dashed"
          onClick={handleAddRow}
        >
          <Plus className="w-5 h-5 mr-2" /> Add Another Row
        </Button>
      </div>

      {/* RESULT ANALYTICS & SUMMARY PANEL */}
      <div className="shrink-0 pt-2 pb-2 border-t mt-1">
        <h2 className="text-sm font-bold mb-2 flex items-center gap-2">
          <BarChart className="w-4 h-4 text-primary" /> Summary Statistics
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card className="p-2.5 bg-primary/5 border-primary/20">
            <h3 className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1.5 mb-2">
              <PieChart className="w-3.5 h-3.5" /> Execution Progress
            </h3>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-xs">Total Filtered</span>
                <span className="font-bold text-sm">{filteredData.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs">Executed</span>
                <span className="font-bold text-green-600 text-sm">
                  {summaryStats.totalExecuted}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs">Unexecuted</span>
                <span className="font-bold text-muted-foreground text-sm">
                  {summaryStats.totalUnexecuted}
                </span>
              </div>
            </div>
          </Card>

          <Card className="p-2.5">
            <h3 className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1.5 mb-2">
              <BarChart className="w-3.5 h-3.5" /> Result Breakdown
            </h3>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 max-h-[64px] overflow-y-auto pr-1">
              {Object.entries(summaryStats.resultsCount)
                .sort(([, a], [, b]) => b - a)
                .map(([result, count]) => (
                  <div
                    key={result}
                    className="flex justify-between items-center bg-muted/30 p-1 rounded text-xs"
                  >
                    <span className="truncate max-w-[70px]" title={result}>
                      {result}
                    </span>
                    <span className="font-bold bg-background px-1.5 py-0.5 rounded shadow-sm">
                      {count}
                    </span>
                  </div>
                ))}
              {Object.keys(summaryStats.resultsCount).length === 0 && (
                <span className="text-xs text-muted-foreground italic col-span-2">
                  No data.
                </span>
              )}
            </div>
          </Card>

          <Card className="p-2.5">
            <h3 className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1.5 mb-2">
              <Users className="w-3.5 h-3.5" /> QA Ownership
            </h3>
            <div className="space-y-1.5 max-h-[64px] overflow-y-auto pr-1">
              {Object.entries(summaryStats.qaCount)
                .sort(([, a], [, b]) => b - a)
                .map(([qa, count]) => (
                  <div
                    key={qa}
                    className="flex justify-between items-center text-xs border-b border-muted pb-1 last:border-0 last:pb-0"
                  >
                    <span className="truncate max-w-[100px]">{qa}</span>
                    <span className="font-bold">{count} cases</span>
                  </div>
                ))}
              {Object.keys(summaryStats.qaCount).length === 0 && (
                <span className="text-xs text-muted-foreground italic">
                  No data.
                </span>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
