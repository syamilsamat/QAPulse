import { useState, useRef, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  ArrowLeft,
  Plus,
  Save,
  Download,
  Upload,
  Trash2,
  FileSpreadsheet,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import {
  fetchTestCases,
  saveTestCases,
  fetchModules,
  type ExecutionTestCase,
  type ExecutionModule,
} from "@/lib/execution-api";

const RESULT_OPTIONS = [
  "Passed",
  "Failed",
  "Blocked",
  "In Progress",
  "Not Executed",
  "",
];

export default function TestCasesExecutionProgressPage() {
  const [, params] = useRoute("/test-cases/execution/:id");
  const [, setLocation] = useLocation();
  const ticketId = params?.id || "Unknown";
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [availableModules, setAvailableModules] = useState<ExecutionModule[]>(
    [],
  );
  const [data, setData] = useState<ExecutionTestCase[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // LOAD FROM DB ON MOUNT
  useEffect(() => {
    Promise.all([fetchTestCases(ticketId), fetchModules()])
      .then(([testCases, modules]) => {
        if (testCases.length === 0) {
          setData([createEmptyRow()]); // Give them 1 empty row to start
        } else {
          setData(testCases);
        }
        setAvailableModules(modules);
      })
      .catch(() =>
        toast({
          variant: "destructive",
          title: "Failed to load spreadsheet data",
        }),
      )
      .finally(() => setIsLoading(false));
  }, [ticketId]);

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
      await saveTestCases(ticketId, data);
      toast({ title: `Database saved for Ticket #${ticketId}` });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to save to database" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadExcel = () => {
    const exportData = data.map(({ id, ...row }) => ({
      "Module Name": row.moduleName,
      "Case ID": row.caseId,
      "Redmine User Story": row.userStory,
      "Tracker Scenario": row.scenario,
      "Pre Condition": row.preCondition,
      Case: row.caseName,
      "Test Steps": row.testSteps,
      "Test Data": row.testData,
      "Expected Result": row.expectedResult,
      Result: row.result,
      "Redmine Defect Number": row.defectNumber,
      "Additional / Comments / Issues": row.comments,
      "QA PIC": row.qaPic,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Test Cases");
    XLSX.writeFile(wb, `Test_Execution_${ticketId}.xlsx`);
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(sheet);

      const importedData: ExecutionTestCase[] = rows.map((row) => ({
        id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
        moduleName: row["Module Name"] || "",
        caseId: row["Case ID"] || "",
        userStory: row["Redmine User Story"] || "",
        scenario: row["Tracker Scenario"] || "",
        preCondition: row["Pre Condition"] || "",
        caseName: row["Case"] || "",
        testSteps: row["Test Steps"] || "",
        testData: row["Test Data"] || "",
        expectedResult: row["Expected Result"] || "",
        result: row["Result"] || "",
        defectNumber: row["Redmine Defect Number"] || "",
        comments: row["Additional / Comments / Issues"] || "",
        qaPic: row["QA PIC"] || "",
      }));

      setData(importedData);
      toast({
        title: `Imported ${importedData.length} test cases. Remember to save!`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Import failed. Invalid Excel file.",
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const CellInput = ({
    row,
    field,
    isTextArea = false,
  }: {
    row: ExecutionTestCase;
    field: keyof ExecutionTestCase;
    isTextArea?: boolean;
  }) => {
    if (isTextArea) {
      return (
        <Textarea
          className="min-h-[40px] h-full w-full text-xs rounded-none border-0 focus-visible:ring-1 bg-transparent resize-none"
          value={row[field] as string}
          onChange={(e) => updateCell(row.id as string, field, e.target.value)}
        />
      );
    }
    return (
      <Input
        className="h-full w-full text-xs rounded-none border-0 focus-visible:ring-1 bg-transparent shadow-none"
        value={row[field] as string}
        onChange={(e) => updateCell(row.id as string, field, e.target.value)}
      />
    );
  };

  if (isLoading)
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );

  return (
    <div className="space-y-4 flex flex-col h-[calc(100vh-6rem)]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
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
            className="gap-2"
          >
            <Upload className="w-4 h-4" /> Import
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadExcel}
            className="gap-2"
          >
            <Download className="w-4 h-4" /> Download
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleAddRow}
            className="gap-2"
          >
            <Plus className="w-4 h-4" /> Add Row
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            size="sm"
            className="gap-2"
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

      <Card className="flex-1 overflow-hidden border rounded-md flex flex-col shadow-sm">
        <div className="flex-1 overflow-auto bg-card">
          <table className="w-full text-sm border-collapse min-w-[1800px]">
            <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur shadow-sm">
              <tr className="divide-x divide-border border-b text-xs uppercase tracking-wider text-muted-foreground">
                <th className="w-10 p-2 text-center">#</th>
                <th className="w-40 p-2 text-left">Module Name</th>
                <th className="w-24 p-2 text-left">Case ID</th>
                <th className="w-32 p-2 text-left">User Story</th>
                <th className="w-40 p-2 text-left">Scenario</th>
                <th className="w-48 p-2 text-left">Pre Condition</th>
                <th className="w-48 p-2 text-left">Case</th>
                <th className="w-64 p-2 text-left">Test Steps</th>
                <th className="w-40 p-2 text-left">Test Data</th>
                <th className="w-48 p-2 text-left">Expected Result</th>
                <th className="w-36 p-2 text-left text-primary">Result</th>
                <th className="w-32 p-2 text-left">Defect #</th>
                <th className="w-48 p-2 text-left">Comments</th>
                <th className="w-32 p-2 text-left">QA PIC</th>
                <th className="w-10 p-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((row, index) => (
                <tr
                  key={row.id as string}
                  className="divide-x divide-border hover:bg-muted/10 group"
                >
                  <td className="text-center text-xs text-muted-foreground bg-muted/5">
                    {index + 1}
                  </td>
                  <td className="p-0">
                    <select
                      className="w-full h-full min-h-[40px] text-xs bg-transparent border-0 px-2 outline-none"
                      value={row.moduleName}
                      onChange={(e) =>
                        updateCell(
                          row.id as string,
                          "moduleName",
                          e.target.value,
                        )
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
                  <td className="p-0">
                    <CellInput row={row} field="caseId" />
                  </td>
                  <td className="p-0">
                    <CellInput row={row} field="userStory" />
                  </td>
                  <td className="p-0">
                    <CellInput row={row} field="scenario" />
                  </td>
                  <td className="p-0">
                    <CellInput row={row} field="preCondition" isTextArea />
                  </td>
                  <td className="p-0">
                    <CellInput row={row} field="caseName" isTextArea />
                  </td>
                  <td className="p-0">
                    <CellInput row={row} field="testSteps" isTextArea />
                  </td>
                  <td className="p-0">
                    <CellInput row={row} field="testData" isTextArea />
                  </td>
                  <td className="p-0">
                    <CellInput row={row} field="expectedResult" isTextArea />
                  </td>
                  <td className="p-0 bg-primary/5">
                    <select
                      className="w-full h-full min-h-[40px] text-xs bg-transparent font-semibold border-0 px-2 outline-none"
                      value={row.result}
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
                  <td className="p-0">
                    <CellInput row={row} field="defectNumber" />
                  </td>
                  <td className="p-0">
                    <CellInput row={row} field="comments" isTextArea />
                  </td>
                  <td className="p-0">
                    <CellInput row={row} field="qaPic" />
                  </td>
                  <td className="p-0 text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
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
    </div>
  );
}
