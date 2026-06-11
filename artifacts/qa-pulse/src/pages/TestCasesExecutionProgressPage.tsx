import { useState, useRef, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import {
  fetchTestCases,
  saveTestCases,
  fetchModules,
  fetchUsers,
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

  // LOAD FROM DB ON MOUNT
  useEffect(() => {
    Promise.all([fetchTestCases(ticketId), fetchModules(), fetchUsers()])
      .then(([result, modules, users]) => {
        const testCases = result?.testCases || [];
        if (testCases.length === 0) {
          setData([createEmptyRow()]); // Give them 1 empty row to start
        } else {
          setData(testCases);
        }
        setAvailableModules(modules);
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
      await saveTestCases(ticketId, data, null); // Pass null or standard args as per updated api
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

  if (isLoading)
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );

  // Common input styling for desktop table ensuring identical fonts and inline display
  const tableInputClass = "h-full min-h-[40px] w-full text-xs font-sans rounded-none border-0 focus-visible:ring-1 focus-visible:ring-primary focus:z-10 bg-transparent shadow-none text-left px-2 py-0";
  const tableSelectClass = "w-full h-full min-h-[40px] px-2 text-xs font-sans bg-transparent border-0 outline-none focus:ring-1 focus:ring-primary focus:z-10 relative";

  return (
    <div className="space-y-4 flex flex-col h-[calc(100vh-6rem)]">
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
            className="flex-1 lg:flex-none gap-2"
          >
            <Upload className="w-4 h-4" /> Import
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
                <th className="border border-border w-40 p-2 text-left">
                  Module Name
                </th>
                <th className="border border-border w-24 p-2 text-left">
                  Case ID
                </th>
                <th className="border border-border w-32 p-2 text-left">
                  User Story
                </th>
                <th className="border border-border w-40 p-2 text-left">
                  Scenario
                </th>
                <th className="border border-border w-48 p-2 text-left">
                  Pre Condition
                </th>
                <th className="border border-border w-48 p-2 text-left">
                  Case
                </th>
                <th className="border border-border w-64 p-2 text-left">
                  Test Steps
                </th>
                <th className="border border-border w-40 p-2 text-left">
                  Test Data
                </th>
                <th className="border border-border w-48 p-2 text-left">
                  Expected Result
                </th>
                <th className="border border-border w-36 p-2 text-left text-primary">
                  Result
                </th>
                <th className="border border-border w-32 p-2 text-left">
                  Defect #
                </th>
                <th className="border border-border w-48 p-2 text-left">
                  Comments
                </th>
                <th className="border border-border w-32 p-2 text-left">
                  QA PIC
                </th>
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
                        updateCell(
                          row.id as string,
                          "userStory",
                          e.target.value,
                        )
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
                        updateCell(
                          row.id as string,
                          "preCondition",
                          e.target.value,
                        )
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
                    <Input
                      className={tableInputClass}
                      value={row.testSteps || ""}
                      onChange={(e) =>
                        updateCell(
                          row.id as string,
                          "testSteps",
                          e.target.value,
                        )
                      }
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
                    <Input
                      className={tableInputClass}
                      value={row.expectedResult || ""}
                      onChange={(e) =>
                        updateCell(
                          row.id as string,
                          "expectedResult",
                          e.target.value,
                        )
                      }
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
                        updateCell(
                          row.id as string,
                          "defectNumber",
                          e.target.value,
                        )
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
                <Label className="text-xs text-muted-foreground uppercase">
                  Module
                </Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={row.moduleName}
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
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase">
                  Result
                </Label>
                <select
                  className="flex h-9 w-full rounded-md border border-primary bg-primary/5 px-3 py-1 text-sm font-bold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={row.result}
                  onChange={(e) =>
                    updateCell(row.id as string, "result", e.target.value)
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
                <Label className="text-xs text-muted-foreground uppercase">
                  Case ID
                </Label>
                <Input
                  className="h-8 text-sm"
                  value={row.caseId}
                  onChange={(e) =>
                    updateCell(row.id as string, "caseId", e.target.value)
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase">
                  User Story
                </Label>
                <Input
                  className="h-8 text-sm"
                  value={row.userStory}
                  onChange={(e) =>
                    updateCell(row.id as string, "userStory", e.target.value)
                  }
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground uppercase">
                Case Name / Title
              </Label>
              <Input
                className="h-8 text-sm"
                value={row.caseName}
                onChange={(e) =>
                  updateCell(row.id as string, "caseName", e.target.value)
                }
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground uppercase">
                Test Steps
              </Label>
              <Textarea
                className="min-h-[60px] text-sm"
                value={row.testSteps}
                onChange={(e) =>
                  updateCell(row.id as string, "testSteps", e.target.value)
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase">
                  Expected Result
                </Label>
                <Textarea
                  className="min-h-[60px] text-sm"
                  value={row.expectedResult}
                  onChange={(e) =>
                    updateCell(
                      row.id as string,
                      "expectedResult",
                      e.target.value,
                    )
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase">
                  Comments
                </Label>
                <Textarea
                  className="min-h-[60px] text-sm"
                  value={row.comments}
                  onChange={(e) =>
                    updateCell(row.id as string, "comments", e.target.value)
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase">
                  Defect #
                </Label>
                <Input
                  className="h-8 text-sm"
                  value={row.defectNumber}
                  onChange={(e) =>
                    updateCell(row.id as string, "defectNumber", e.target.value)
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase">
                  QA PIC
                </Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={row.qaPic}
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