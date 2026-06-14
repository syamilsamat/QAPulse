import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HoverList } from "@/components/icons/animated";
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
import { Upload, Plus, Trash2, Loader2, Search } from "lucide-react";
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

  // --- Data Loading & Autosaving ---
  const handleLoadTicket = async () => {
    if (!searchTicketId.trim()) {
      toast({
        variant: "destructive",
        title: "Redmine Ticket ID Required",
        description: "Please enter a Redmine Ticket ID before loading.",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Always aggregate from the latest raw test cases (the source of truth)
      const result = await fetchTestCases(searchTicketId);
      const testCases = result?.testCases || [];

      if (testCases.length > 0) {
        const moduleMap: Record<string, ExecutionRow> = {};

        testCases.forEach((tc: any) => {
          // Ignore completely empty placeholder rows
          if (!tc.moduleName && !tc.caseName && !tc.result) return;

          const modName = tc.moduleName || "Unassigned Module";

          if (!moduleMap[modName]) {
            moduleMap[modName] = {
              id:
                Date.now().toString() +
                Math.random().toString(36).substring(2, 9),
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

        // --- Autosave Logic ---
        const saveRes = await fetch("/api/pmo/execution-details", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            redmineId: searchTicketId,
            details: aggregatedData,
          }),
        });

        if (!saveRes.ok) throw new Error("Autosave failed on server");

        toast({
          title: `Ticket #${searchTicketId} Loaded & Saved`,
          description:
            "Execution metrics have been successfully aggregated and updated in the PMO report.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Ticket Not Found or Empty",
          description: `No test case data found for Ticket #${searchTicketId}. Please verify the ID exists.`,
        });
        setData([]);
        setCurrentTicketId("");
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to process execution data",
      });
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
      if (data.type === "UPDATED" && data.ticketId === currentTicketId) {
        toast({
          title: "Live Update Received",
          description: "A QA tester just saved changes. Refreshing metrics...",
        });
        // Re-run the fetch logic silently to update the numbers
        handleLoadTicket();
      }
    };

    return () => {
      eventSource.close(); // Clean up connection when component unmounts
    };
  }, [currentTicketId]); // Re-bind if the user switches tickets

  // --- Inline Editing Logic (Hidden by default based on provided code) ---
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

      // Optionally, you can call the autosave endpoint here too if you want imported data to save automatically
      toast({
        title: "Import Successful",
        description: `Loaded ${importedData.length} modules for Ticket #${importTicketId}.`,
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
            <HoverList className="w-6 h-6 sm:w-7 sm:h-7 text-primary shrink-0 group" />
            Execution Details
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Load a ticket to auto-generate and auto-save its test execution
            progress.
          </p>
        </div>

        {/* Ticket Load Action */}
        <div className="flex items-center gap-2 w-full lg:w-auto bg-muted/30 p-2 rounded-lg border">
          <div className="relative w-full sm:w-48">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">
              #
            </span>
            <Input
              placeholder="Load Redmine ID..."
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
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
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
          Viewing Ticket:{" "}
          <span className="font-bold text-base">
            {currentTicketId || "None"}
          </span>
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
                      No data. Load a ticket to view progress.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((row) => (
                    <TableRow
                      key={row.id}
                      className="hover:bg-muted/10 transition-colors group"
                    >
                      <TableCell className="p-1 px-3">
                        <span className="uppercase text-sm font-medium">
                          {row.module || "UNNAMED MODULE"}
                        </span>
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
                        <TableCell key={field} className="p-1 text-center">
                          <span className="text-sm">
                            {row[field] === 0 && field !== "total"
                              ? "-"
                              : row[field]}
                          </span>
                        </TableCell>
                      ))}

                      <TableCell className="text-center font-semibold text-primary bg-primary/5">
                        {calculatePassCompletion(row.passed, row.total)}
                      </TableCell>
                      <TableCell className="text-center font-semibold bg-muted/20">
                        {calculateTotalCompletion(row.total, row.notExec)}
                      </TableCell>

                      <TableCell className="text-right p-1 pr-3"></TableCell>
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
                No data. Load a ticket to view progress.
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
                      <div className="h-9 flex items-center px-3 font-bold text-sm uppercase bg-muted/10 rounded-md">
                        {row.module || "UNNAMED MODULE"}
                      </div>
                    </div>
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
                          <div className="h-8 flex items-center justify-center text-sm font-medium bg-muted/5 rounded-md border border-transparent">
                            {row[field] === 0 && field !== "total"
                              ? "-"
                              : row[field]}
                          </div>
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
                      description: "Please enter a Redmine Ticket ID first.",
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
