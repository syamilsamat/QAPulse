import { useState, useRef, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
  XCircle
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

// Define synonym mappings for robust auto-detection
const COLUMN_MAPPINGS: Record<string, string[]> = {
  caseId: ["case id", "test case id", "tc id", "id"],
  userStory: ["user story", "story", "requirement", "requirement id", "redmine user story"],
  scenario: ["scenario", "tracker scenario"],
  preCondition: ["pre condition", "preconditions", "pre-conditions", "precondition"],
  caseName: ["case", "case name", "title"],
  testSteps: ["test steps", "steps", "testing steps"],
  testData: ["test data", "data"],
  expectedResult: ["expected result", "expected outcome", "expected results"],
  result: ["result", "status", "test result"],
  defectNumber: ["redmine defect", "defect id", "bug id", "redmine id", "redmine defect number"],
  qaPic: ["qa pic", "qa owner", "tester", "assigned qa"],
  comments: ["additional / comments / issues", "additional/comments/issues", "comments", "additional", "issues", "remarks"],
  moduleName: ["module name", "module", "feature"]
};

interface ImportSummary {
  status: "Success" | "Partial Success" | "Failed";
  totalWorksheetsScanned: number;
  totalWorksheetsImported: number;
  totalRowsImported: number;
  totalRowsSkipped: number;
  missingColumns: string[];
  duplicateCaseIds: string[];
}

export default function TestCasesExecutionProgressPage() {
  const [, params] = useRoute("/test-cases/execution/:id");
  const [, setLocation] = useLocation();
  const ticketId = params?.id || "Unknown";
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [availableModules, setAvailableModules] = useState<ExecutionModule[]>([]);
  const [qaUsers, setQaUsers] = useState<ExecutionUser[]>([]);
  const [data, setData] = useState<ExecutionTestCase[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

  // LOAD FROM DB ON MOUNT
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

  const updateCell = (
    id: string | number,
    field: keyof ExecutionTestCase,
    value: string,
  ) => {
    setData((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    );
  };

  const handleDeleteRow = (id: string | number) =>
    setData((prev) => prev.filter((row) => row.id !== id));

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveTestCases(ticketId, data, null);
      toast({ title: `Database saved for Ticket #${ticketId}` });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to save to database" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadExcel = () => {
    const exportData = data.map((row) => ({
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
      { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 20 },
      { wch: 25 }, { wch: 25 }, { wch: 35 }, { wch: 20 },
      { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 20 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Test Cases");
    XLSX.writeFile(wb, `Test_Execution_${ticketId}.xlsx`);
  };

  const normalizeHeader = (val: any) => {
    if (typeof val !== "string") return "";
    return val.toLowerCase().replace(/[\n\r\t]/g, " ").trim();
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

      const allRequiredKeys = Object.keys(COLUMN_MAPPINGS).filter(k => k !== "moduleName"); 
      const MIN_REQUIRED_COLUMNS = 7;

      // Scan ALL sheets in the workbook without restricting by name
      for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, blankrows: false, raw: false });

        if (rawData.length === 0) continue;

        let headerRowIndex = -1;
        let bestMatchCount = 0;
        let columnMapIndex: Record<string, number> = {};

        // Find the Header Row (Search top 30 rows)
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

          // STRICT FIX: Ensure the row genuinely looks like a test case header
          // It MUST contain "Case ID", "Test Steps", AND "Expected Result"
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

        // If we didn't meet the strict threshold, ignore the entire worksheet
        if (headerRowIndex === -1) continue;

        totalWorksheetsImported++;

        // Track missing columns for this valid sheet
        allRequiredKeys.forEach(k => {
          if (columnMapIndex[k] === undefined) missingColumnsSet.add(k);
        });

        // Extract rows
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
            if (val !== undefined && val !== null && String(val).trim() !== "") {
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
            id: Date.now().toString() + Math.random().toString(36).substring(2, 8),
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

      if (consolidatedData.length > 0) {
        setData(consolidatedData);
      }

      setImportSummary({
        status: totalRowsImported > 0 
          ? (missingColumnsSet.size > 0 || duplicateCaseIdsSet.size > 0 ? "Partial Success" : "Success") 
          : "Failed",
        totalWorksheetsScanned: wb.SheetNames.length,
        totalWorksheetsImported,
        totalRowsImported,
        totalRowsSkipped,
        missingColumns: Array.from(missingColumnsSet),
        duplicateCaseIds: Array.from(duplicateCaseIdsSet)
      });

    } catch (err) {
      toast({
        variant: "destructive",
        title: "Import failed",
        description: "Invalid Excel structure or corrupted file."
      });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (isLoading)
    return (
      <div className="flex justify-center items-center h-full min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );

  const tableInputClass =
    "h-full min-h-[40px] w-full text-xs font-sans rounded-none border-0 focus-visible:ring-1 focus-visible:ring-primary focus:z-10 bg-transparent shadow-none text-left px-2 py-0";
  const tableSelectClass =
    "w-full h-full min-h-[40px] px-2 text-xs font-sans bg-transparent border-0 outline-none focus:ring-1 focus:ring-primary focus:z-10 relative";

  return (
    <div className="space-y-4 flex flex-col h-[calc(100vh-6rem)] relative">

      {/* Import Summary Overlay */}
      {importSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <Card className="max-w-md w-full bg-background shadow-2xl overflow-hidden border-border">
            <div className={`p-4 border-b flex items-center gap-2 text-white ${importSummary.status === "Success" ? "bg-green-600" : importSummary.status === "Failed" ? "bg-red-600" : "bg-amber-500"}`}>
               {importSummary.status === "Success" && <CheckCircle className="w-5 h-5" />}
               {importSummary.status === "Failed" && <XCircle className="w-5 h-5" />}
               {importSummary.status === "Partial Success" && <AlertTriangle className="w-5 h-5" />}
               <h2 className="text-lg font-bold">Import Summary: {importSummary.status}</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-muted/50 p-3 rounded-md">
                  <p className="text-muted-foreground mb-1">Sheets Scanned</p>
                  <p className="text-2xl font-semibold">{importSummary.totalWorksheetsScanned}</p>
                </div>
                <div className="bg-muted/50 p-3 rounded-md">
                  <p className="text-muted-foreground mb-1">Valid Sheets Imported</p>
                  <p className="text-2xl font-semibold text-primary">{importSummary.totalWorksheetsImported}</p>
                </div>
                <div className="bg-muted/50 p-3 rounded-md">
                  <p className="text-muted-foreground mb-1">Rows Imported</p>
                  <p className="text-2xl font-semibold">{importSummary.totalRowsImported}</p>
                </div>
                <div className="bg-muted/50 p-3 rounded-md">
                  <p className="text-muted-foreground mb-1">Empty Rows Skipped</p>
                  <p className="text-2xl font-semibold">{importSummary.totalRowsSkipped}</p>
                </div>
              </div>

              {importSummary.missingColumns.length > 0 && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-md">
                  <p className="text-sm font-semibold text-amber-600 flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4" /> Missing Columns Detected
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
                <Button onClick={() => setImportSummary(null)}>Acknowledge & Continue</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* HEADER & ACTION BUTTONS */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 shrink-0 border-b pb-4">
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
            <p className="text-xs text-muted-foreground">
              Test Case Execution Progress
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
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
            {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} 
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

      {/* DESKTOP SPREADSHEET VIEW (Hidden on Mobile) */}
      <Card className="hidden lg:flex flex-1 overflow-hidden border rounded-md shadow-sm">
        <div className="flex-1 overflow-auto bg-card">
          <table className="w-full text-sm border-collapse min-w-[1800px]">
            <thead className="sticky top-0 z-20 bg-muted/90 backdrop-blur shadow-sm">
              <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                <th className="border border-border w-10 p-2 text-center">#</th>
                <th className="border border-border w-40 p-2 text-left">Module Name</th>
                <th className="border border-border w-24 p-2 text-left">Case ID</th>
                <th className="border border-border w-32 p-2 text-left">User Story</th>
                <th className="border border-border w-40 p-2 text-left">Scenario</th>
                <th className="border border-border w-48 p-2 text-left">Pre Condition</th>
                <th className="border border-border w-48 p-2 text-left">Case</th>
                <th className="border border-border w-64 p-2 text-left">Test Steps</th>
                <th className="border border-border w-40 p-2 text-left">Test Data</th>
                <th className="border border-border w-48 p-2 text-left">Expected Result</th>
                <th className="border border-border w-36 p-2 text-left text-primary">Result</th>
                <th className="border border-border w-32 p-2 text-left">Defect #</th>
                <th className="border border-border w-48 p-2 text-left">Comments</th>
                <th className="border border-border w-32 p-2 text-left">QA PIC</th>
                <th className="border border-border w-10 p-2"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, index) => (
                <tr
                  key={row.id as string}
                  className="hover:bg-muted/10 group align-middle"
                >
                  <td className="border border-border text-center text-xs font-sans text-muted-foreground bg-muted/5">
                    {index + 1}
                  </td>
                  <td className="border border-border p-0 relative align-middle">
                    <select
                      className={tableSelectClass}
                      value={row.moduleName || ""}
                      onChange={(e) =>
                        updateCell(row.id as string, "moduleName", e.target.value)
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
                  <td className="border border-border p-0 relative align-middle">
                    <Input
                      className={tableInputClass}
                      value={row.caseId || ""}
                      onChange={(e) =>
                        updateCell(row.id as string, "caseId", e.target.value)
                      }
                    />
                  </td>
                  <td className="border border-border p-0 relative align-middle">
                    <Input
                      className={tableInputClass}
                      value={row.userStory || ""}
                      onChange={(e) =>
                        updateCell(row.id as string, "userStory", e.target.value)
                      }
                    />
                  </td>
                  <td className="border border-border p-0 relative align-middle">
                    <Input
                      className={tableInputClass}
                      value={row.scenario || ""}
                      onChange={(e) =>
                        updateCell(row.id as string, "scenario", e.target.value)
                      }
                    />
                  </td>
                  <td className="border border-border p-0 relative align-middle">
                    <Input
                      className={tableInputClass}
                      value={row.preCondition || ""}
                      onChange={(e) =>
                        updateCell(row.id as string, "preCondition", e.target.value)
                      }
                    />
                  </td>
                  <td className="border border-border p-0 relative align-middle">
                    <Input
                      className={tableInputClass}
                      value={row.caseName || ""}
                      onChange={(e) =>
                        updateCell(row.id as string, "caseName", e.target.value)
                      }
                    />
                  </td>
                  <td className="border border-border p-0 relative align-middle">
                    <Textarea
                      className={`${tableInputClass} resize-none overflow-hidden h-auto min-h-[40px] py-2`}
                      value={row.testSteps || ""}
                      rows={1}
                      onChange={(e) => {
                         e.target.style.height = 'inherit';
                         e.target.style.height = `${e.target.scrollHeight}px`;
                         updateCell(row.id as string, "testSteps", e.target.value)
                      }}
                    />
                  </td>
                  <td className="border border-border p-0 relative align-middle">
                    <Input
                      className={tableInputClass}
                      value={row.testData || ""}
                      onChange={(e) =>
                        updateCell(row.id as string, "testData", e.target.value)
                      }
                    />
                  </td>
                  <td className="border border-border p-0 relative align-middle">
                    <Textarea
                      className={`${tableInputClass} resize-none overflow-hidden h-auto min-h-[40px] py-2`}
                      value={row.expectedResult || ""}
                      rows={1}
                      onChange={(e) => {
                         e.target.style.height = 'inherit';
                         e.target.style.height = `${e.target.scrollHeight}px`;
                         updateCell(row.id as string, "expectedResult", e.target.value)
                      }}
                    />
                  </td>
                  <td className="border border-border p-0 bg-primary/5 relative align-middle">
                    <select
                      className={`${tableSelectClass} font-semibold`}
                      value={row.result || ""}
                      onChange={(e) =>
                        updateCell(row.id as string, "result", e.target.value)
                      }
                    >
                      {RESULT_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {r || "Select..."}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="border border-border p-0 relative align-middle">
                    <Input
                      className={tableInputClass}
                      value={row.defectNumber || ""}
                      onChange={(e) =>
                        updateCell(row.id as string, "defectNumber", e.target.value)
                      }
                    />
                  </td>
                  <td className="border border-border p-0 relative align-middle">
                    <Input
                      className={tableInputClass}
                      value={row.comments || ""}
                      onChange={(e) =>
                        updateCell(row.id as string, "comments", e.target.value)
                      }
                    />
                  </td>
                  <td className="border border-border p-0 relative align-middle">
                    <select
                      className={tableSelectClass}
                      value={row.qaPic || ""}
                      onChange={(e) =>
                        updateCell(row.id as string, "qaPic", e.target.value)
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
                  <td className="border border-border p-0 text-center align-middle">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity mx-auto block"
                      onClick={() => handleDeleteRow(row.id as string)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* MOBILE CARD VIEW (Hidden on Desktop) */}
      <div className="lg:hidden flex flex-col gap-4 overflow-y-auto pb-6">
        {data.map((row, index) => (
          <Card
            key={row.id as string}
            className="p-4 space-y-4 shadow-sm relative"
          >
            <div className="absolute top-2 right-2">
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => handleDeleteRow(row.id as string)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2 mb-2">
              <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs font-bold">
                #{index + 1}
              </span>
              <span className="font-semibold text-sm">Test Case</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase">Module</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={row.moduleName}
                  onChange={(e) => updateCell(row.id as string, "moduleName", e.target.value)}
                >
                  <option value="">Select...</option>
                  {availableModules.map((m) => (
                    <option key={m.id} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase">Result</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-primary bg-primary/5 px-3 py-1 text-sm font-bold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={row.result}
                  onChange={(e) => updateCell(row.id as string, "result", e.target.value)}
                >
                  {RESULT_OPTIONS.map((r) => (
                    <option key={r} value={r}>{r || "Pending"}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase">Case ID</Label>
                <Input
                  className="h-8 text-sm"
                  value={row.caseId}
                  onChange={(e) => updateCell(row.id as string, "caseId", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase">User Story</Label>
                <Input
                  className="h-8 text-sm"
                  value={row.userStory}
                  onChange={(e) => updateCell(row.id as string, "userStory", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground uppercase">Case Name / Title</Label>
              <Input
                className="h-8 text-sm"
                value={row.caseName}
                onChange={(e) => updateCell(row.id as string, "caseName", e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground uppercase">Test Steps</Label>
              <Textarea
                className="min-h-[60px] text-sm"
                value={row.testSteps}
                onChange={(e) => updateCell(row.id as string, "testSteps", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase">Expected Result</Label>
                <Textarea
                  className="min-h-[60px] text-sm"
                  value={row.expectedResult}
                  onChange={(e) => updateCell(row.id as string, "expectedResult", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase">Comments</Label>
                <Textarea
                  className="min-h-[60px] text-sm"
                  value={row.comments}
                  onChange={(e) => updateCell(row.id as string, "comments", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase">Defect #</Label>
                <Input
                  className="h-8 text-sm"
                  value={row.defectNumber}
                  onChange={(e) => updateCell(row.id as string, "defectNumber", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase">QA PIC</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={row.qaPic}
                  onChange={(e) => updateCell(row.id as string, "qaPic", e.target.value)}
                >
                  <option value="">Select QA PIC...</option>
                  {qaUsers.map((u) => (
                    <option key={u.id} value={u.name}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </Card>
        ))}
        <Button
          variant="secondary"
          className="w-full py-6 border-dashed"
          onClick={handleAddRow}
        >
          <Plus className="w-5 h-5 mr-2" /> Add Another Row
        </Button>
      </div>
    </div>
  );
}