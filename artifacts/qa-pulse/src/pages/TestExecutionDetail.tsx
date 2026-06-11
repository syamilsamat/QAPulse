import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
// Add this import near the top of your file
import { fetchTestCases } from "@/lib/execution-api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Upload,
  Plus,
  Trash2,
  Save,
  FileSpreadsheet,
  Loader2,
  Search,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

type ExecutionRow = {
  id: string;
  module: string;
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  inProg: number;
  notExec: number;
};

export default function TestExecutionDetails() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [data, setData] = useState<ExecutionRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Ticket ID Management
  const [currentTicketId, setCurrentTicketId] = useState("");
  const [searchTicketId, setSearchTicketId] = useState("");

  // Import Dialog Management
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importTicketId, setImportTicketId] = useState("");

  // --- Real-time Math Calculations ---
  const calculatePassCompletion = (passed: number, total: number) => {
    if (total === 0) return "0.0%";
    return `${((passed / total) * 100).toFixed(1)}%`;
  };

  const calculateTotalCompletion = (total: number, notExec: number) => {
    if (total === 0) return "0.0%";
    return `${(((total - notExec) / total) * 100).toFixed(1)}%`;
  };

  // --- Data Loading & Saving ---
  const handleLoadTicket = async () => {
    if (!searchTicketId.trim()) return;
    setIsLoading(true);
    try {
      // 1. Fetch raw test cases from the progress page DB
      const testCases = await fetchTestCases(searchTicketId);

      if (testCases && testCases.length > 0) {
        // 2. Aggregate logic: Group by Module and Count Results
        const moduleMap: Record<string, ExecutionRow> = {};

        testCases.forEach((tc: any) => {
          // Ignore completely empty placeholder rows
          if (!tc.moduleName && !tc.caseName && !tc.result) return;

          const modName = tc.moduleName || "Unassigned Module";

          if (!moduleMap[modName]) {
            moduleMap[modName] = {
              id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
              module: modName,
              total: 0,
              passed: 0,
              failed: 0,
              blocked: 0,
              inProg: 0,
              notExec: 0,
            };
          }

          const row = moduleMap[modName];
          row.total += 1;

          // Normalize result string for accurate matching
          const res = tc.result?.trim().toLowerCase() || "";

          if (res === "passed") row.passed += 1;
          else if (res === "failed") row.failed += 1;
          else if (res === "blocked") row.blocked += 1;
          else if (res === "in progress") row.inProg += 1;
          else row.notExec += 1; // Catch-all for "Not Executed" or empty results
        });

        const aggregatedData = Object.values(moduleMap);
        setData(aggregatedData);
        setCurrentTicketId(searchTicketId);
        toast({ title: `Calculated metrics from Test Cases for Ticket #${searchTicketId}` });

      } else {
        // 3. Fallback: Check if there's existing summary data on the PMO endpoint if no detailed test cases exist
        const res = await fetch(
          `/api/pmo/execution-details?redmineId=${encodeURIComponent(searchTicketId)}`,
        );
        const fetchedData = await res.json();

        if (fetchedData && fetchedData.length > 0) {
          setData(fetchedData);
          setCurrentTicketId(searchTicketId);
          toast({ title: `Loaded existing report data for Ticket #${searchTicketId}` });
        } else {
          toast({
            title: `No existing data for #${searchTicketId}. Starting fresh.`,
          });
          setData([]);
          setCurrentTicketId(searchTicketId);
        }
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to load execution data" });
    } finally {
      setIsLoading(false);
    }
  };

  // --- Real-Time Listener Setup ---
  useEffect(() => {
    // Connect to the SSE endpoint we created in Express
    const eventSource = new EventSource("/api/execution-events");

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      // If the dashboard is currently viewing the ticket that was just saved
      if (data.type === 'UPDATED' && data.ticketId === currentTicketId) {
        toast({ 
          title: "Live Update Received", 
          description: "A QA tester just saved changes. Refreshing metrics..." 
        });
        // Re-run the fetch logic silently to update the numbers
        handleLoadTicket(currentTicketId); 
      }
    };

    return () => {
      eventSource.close(); // Clean up connection when component unmounts
    };
  }, [currentTicketId]); // Re-bind if the user switches tickets

  const handleSaveToReport = async () => {
    if (!currentTicketId.trim()) {
      toast({
        variant: "destructive",
        title: "Ticket ID Required",
        description: "Please enter or load a Redmine Ticket ID before saving.",
      });
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch("/api/pmo/execution-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redmineId: currentTicketId, details: data }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast({
        title: `Successfully saved to PMO Report under #${currentTicketId}!`,
      });
    } catch (err) {
      toast({ variant: "destructive", title: "Could not save data" });
    } finally {
      setIsSaving(false);
    }
  };

  // --- Inline Editing Logic ---
  const updateRow = (
    id: string,
    field: keyof ExecutionRow,
    value: string | number,
  ) => {
    setData((prev) =>
      prev.map((row) => {
        if (row.id === id) {
          return { ...row, [field]: value };
        }
        return row;
      }),
    );
  };

  const handleDelete = (id: string) => {
    setData((prev) => prev.filter((row) => row.id !== id));
  };

  const handleAddRow = () => {
    const newRow: ExecutionRow = {
      id: Date.now().toString(),
      module: "",
      total: 0,
      passed: 0,
      failed: 0,
      blocked: 0,
      inProg: 0,
      notExec: 0,
    };
    setData([...data, newRow]);
  };

  // --- Client-Side Excel Parsing (Triggered from Dialog) ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const sheetName = "Progress";
      const sheet = workbook.Sheets[sheetName];

      if (!sheet) {
        toast({
          variant: "destructive",
          title: "Sheet not found",
          description: `Could not find a sheet named "Progress".`,
        });
        return;
      }

      const rows = XLSX.utils.sheet_to_json<any>(sheet);
      const importedData: ExecutionRow[] = [];

      for (const row of rows) {
        if (!row.Module || row.Module.toLowerCase().includes("grand total"))
          continue;
        importedData.push({
          id:
            Date.now().toString() + Math.random().toString(36).substring(2, 9),
          module: row.Module,
          total: parseInt(row.Total) || 0,
          passed: parseInt(row.Passed) || 0,
          failed: parseInt(row.Failed) || 0,
          blocked: parseInt(row.Blocked) || 0,
          inProg:
            parseInt(row["In Prog."] || row.InProgress || row["In Progress"]) ||
            0,
          notExec:
            parseInt(
              row["Not Exec."] || row.NotExecuted || row["Not Executed"],
            ) || 0,
        });
      }

      if (importedData.length === 0) {
        toast({
          variant: "destructive",
          title: "Empty Sheet",
          description: "No valid module data found.",
        });
        return;
      }

      setData(importedData);
      setCurrentTicketId(importTicketId); // Set the active ticket ID to the one they typed
      setIsImportDialogOpen(false); // Close the dialog

      toast({
        title: "Import Successful",
        description: `Loaded ${importedData.length} modules for Ticket #${importTicketId}. Click "Save Changes" to apply.`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Import Failed",
        description: "Error parsing the Excel file.",
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header & Buttons */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 sm:w-7 sm:h-7 text-primary shrink-0" />
            Execution Details
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Load a ticket, edit the cells, or import an Excel file.
          </p>
        </div>

        {/* Ticket Load Action */}
        <div className="flex items-center gap-2 w-full lg:w-auto bg-muted/30 p-2 rounded-lg border">
          <div className="relative w-full sm:w-48">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">
              #
            </span>
            <Input
              placeholder="Load Ticket ID..."
              value={searchTicketId}
              onChange={(e) => setSearchTicketId(e.target.value)}
              className="pl-7 bg-background"
            />
          </div>
          <Button
            onClick={handleLoadTicket}
            disabled={isLoading}
            variant="secondary"
            className="shrink-0"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4 mr-2" />
            )}
            Load
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-md font-medium text-sm">
          Editing Ticket:{" "}
          <span className="font-bold text-base">
            {currentTicketId || "None (Unsaved)"}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              setImportTicketId("");
              setIsImportDialogOpen(true);
            }}
          >
            <Upload className="w-4 h-4" /> Import Excel
          </Button>
          <Button variant="secondary" onClick={handleAddRow} className="gap-2">
            <Plus className="w-4 h-4" /> Add Row
          </Button>
          <Button
            onClick={handleSaveToReport}
            disabled={isSaving || !currentTicketId}
            className="gap-2"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Interactive Progress Sheet</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-2 lg:p-0">
          {/* DESKTOP VIEW */}
          <div className="hidden lg:block overflow-x-auto">
            <Table className="w-full text-sm min-w-[900px]">
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-semibold w-[220px]">
                    Module
                  </TableHead>
                  <TableHead className="font-semibold text-center w-[80px]">
                    Total
                  </TableHead>
                  <TableHead className="font-semibold text-center w-[80px]">
                    Passed
                  </TableHead>
                  <TableHead className="font-semibold text-center w-[80px]">
                    Failed
                  </TableHead>
                  <TableHead className="font-semibold text-center w-[80px]">
                    Blocked
                  </TableHead>
                  <TableHead className="font-semibold text-center w-[80px]">
                    In Prog.
                  </TableHead>
                  <TableHead className="font-semibold text-center w-[80px]">
                    Not Exec.
                  </TableHead>
                  <TableHead className="font-semibold text-center w-[120px]">
                    Pass %
                  </TableHead>
                  <TableHead className="font-semibold text-center w-[120px]">
                    Total %
                  </TableHead>
                  <TableHead className="font-semibold text-right w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No data. Load a ticket, add a row, or import Excel.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((row) => (
                    <TableRow
                      key={row.id}
                      className="hover:bg-muted/10 transition-colors group"
                    >
                      <TableCell className="p-1">
                        <Input
                          className="h-8 border-transparent bg-transparent hover:border-input focus-visible:ring-1 uppercase text-sm font-medium"
                          value={row.module}
                          placeholder="Module Name"
                          onChange={(e) =>
                            updateRow(row.id, "module", e.target.value)
                          }
                        />
                      </TableCell>
                      {(
                        [
                          "total",
                          "passed",
                          "failed",
                          "blocked",
                          "inProg",
                          "notExec",
                        ] as const
                      ).map((field) => (
                        <TableCell key={field} className="p-1">
                          <Input
                            type="number"
                            min="0"
                            className="h-8 border-transparent bg-transparent hover:border-input focus-visible:ring-1 text-center shadow-none"
                            value={
                              row[field] === 0 && field !== "total"
                                ? ""
                                : row[field]
                            }
                            placeholder="0"
                            onChange={(e) =>
                              updateRow(
                                row.id,
                                field,
                                parseInt(e.target.value) || 0,
                              )
                            }
                          />
                        </TableCell>
                      ))}
                      <TableCell className="text-center font-semibold text-primary bg-primary/5">
                        {calculatePassCompletion(row.passed, row.total)}
                      </TableCell>
                      <TableCell className="text-center font-semibold bg-muted/20">
                        {calculateTotalCompletion(row.total, row.notExec)}
                      </TableCell>
                      <TableCell className="text-right p-1 pr-3">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(row.id)}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* MOBILE/TABLET VIEW */}
          <div className="lg:hidden flex flex-col gap-4 p-4">
            {data.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground border rounded-lg border-dashed">
                No data. Click "Add Row" or "Import Excel" to start.
              </div>
            ) : (
              data.map((row) => (
                <div
                  key={row.id}
                  className="border rounded-xl p-4 bg-card shadow-sm space-y-4 relative"
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Module Name
                      </label>
                      <Input
                        className="h-9 uppercase font-bold text-sm bg-muted/30 focus:bg-background"
                        value={row.module}
                        placeholder="Enter Module Name"
                        onChange={(e) =>
                          updateRow(row.id, "module", e.target.value)
                        }
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(row.id)}
                      className="text-destructive shrink-0 mt-5 h-9 w-9 bg-destructive/10 hover:bg-destructive/20"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {(
                      [
                        "total",
                        "passed",
                        "failed",
                        "blocked",
                        "inProg",
                        "notExec",
                      ] as const
                    ).map((field) => {
                      const labels: Record<string, string> = {
                        total: "Total",
                        passed: "Passed",
                        failed: "Failed",
                        blocked: "Blocked",
                        inProg: "In Prog",
                        notExec: "Not Exec",
                      };
                      return (
                        <div key={field} className="space-y-1">
                          <label className="text-[10px] sm:text-xs font-semibold text-muted-foreground">
                            {labels[field]}
                          </label>
                          <Input
                            type="number"
                            min="0"
                            className="h-8 text-center text-sm shadow-none"
                            value={
                              row[field] === 0 && field !== "total"
                                ? ""
                                : row[field]
                            }
                            placeholder="0"
                            onChange={(e) =>
                              updateRow(
                                row.id,
                                field,
                                parseInt(e.target.value) || 0,
                              )
                            }
                          />
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-between items-center pt-3 border-t">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                        Pass %
                      </span>
                      <span className="text-lg font-bold text-primary">
                        {calculatePassCompletion(row.passed, row.total)}
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                        Total Completion %
                      </span>
                      <span className="text-lg font-bold">
                        {calculateTotalCompletion(row.total, row.notExec)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* IMPORT DIALOG */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import Excel Sheet</DialogTitle>
            <DialogDescription>
              Assign a Redmine Ticket ID to this import. You must select an
              Excel file containing a sheet named "Progress".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>
                Redmine Ticket ID <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">
                  #
                </span>
                <Input
                  className="pl-7"
                  placeholder="e.g. 34555"
                  value={importTicketId}
                  onChange={(e) => setImportTicketId(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Upload File</Label>
              {/* Hidden file input mapped to a styled button */}
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                className="hidden"
                id="dialog-file-upload"
                ref={fileInputRef}
                onChange={handleFileUpload}
              />
              <Button
                variant="outline"
                className="w-full border-dashed h-24 bg-muted/30"
                onClick={() => {
                  if (!importTicketId.trim()) {
                    toast({
                      variant: "destructive",
                      title: "Missing ID",
                      description: "Please enter a Ticket ID first.",
                    });
                    return;
                  }
                  document.getElementById("dialog-file-upload")?.click();
                }}
              >
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                  <Upload className="w-6 h-6 mb-1" />
                  <span>Click to browse for Excel file</span>
                </div>
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsImportDialogOpen(false)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
