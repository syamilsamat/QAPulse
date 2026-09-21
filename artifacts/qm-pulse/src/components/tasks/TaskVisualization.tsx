import { useMemo, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import {
  BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, LabelList, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  PIC_DEPARTMENTS,
  picNamesForRow,
  isRowOverdue,
  type TaskBoardRow,
  type PicDepartment,
} from "@/lib/task-board";

// The board answers "what is the state of each milestone". These charts answer
// the two questions it can't: who is carrying how much, and where the work has
// piled up by department. Everything is derived from the same rows the board
// renders — no second fetch, so the two views can never disagree.

// Categorical slots 1–5 in fixed order, with the dark column stepped for the
// dark surface (a selected set, never an automatic flip of the light one). Both
// sets pass the adjacent-pair checks a stacked bar relies on, and the order is
// itself the colour-blind-safety mechanism — so phases take slots in workflow
// order and nothing is ever cycled or generated.
const PHASE_SERIES: { key: TaskBoardRow["phase"]; label: string; light: string; dark: string }[] = [
  { key: "requirements", label: "Requirements", light: "#2a78d6", dark: "#3987e5" },
  { key: "gap", label: "Gap", light: "#eb6834", dark: "#d95926" },
  { key: "develop", label: "Development", light: "#1baf7a", dark: "#199e70" },
  { key: "qa", label: "Testing", light: "#eda100", dark: "#c98500" },
  { key: "uat", label: "UAT", light: "#e87ba4", dark: "#d55181" },
];

// Open vs delivered is emphasis, not identity: the open load is the story, so it
// takes the accent hue and delivered work recedes to grey.
const LOAD_SERIES = {
  open: { label: "Open", light: "#2a78d6", dark: "#3987e5" },
  done: { label: "Delivered", light: "#c9c8c3", dark: "#4a4a47" },
};

interface MemberLoad {
  name: string;
  department: PicDepartment;
  open: number;
  done: number;
  overdue: number;
  total: number;
}

/** One entry per (person, department) pair, read off the PIC columns. */
function buildMemberLoads(rows: TaskBoardRow[]): MemberLoad[] {
  const byKey = new Map<string, MemberLoad>();
  for (const row of rows) {
    for (const department of PIC_DEPARTMENTS) {
      for (const name of picNamesForRow(row, department)) {
        const key = `${department}::${name.toLowerCase()}`;
        let entry = byKey.get(key);
        if (!entry) {
          entry = { name, department, open: 0, done: 0, overdue: 0, total: 0 };
          byKey.set(key, entry);
        }
        entry.total += 1;
        if (row.progress >= 100) entry.done += 1;
        else entry.open += 1;
        if (isRowOverdue(row)) entry.overdue += 1;
      }
    }
  }
  return [...byKey.values()].sort(
    (a, b) => b.open - a.open || b.total - a.total || a.name.localeCompare(b.name),
  );
}

/** Requirements per department, split by the phase each currently sits in. */
function buildDepartmentPhaseMix(rows: TaskBoardRow[]) {
  return PIC_DEPARTMENTS.map((department) => {
    const entry: Record<string, string | number> = { department };
    for (const series of PHASE_SERIES) entry[series.key] = 0;
    let assigned = 0;
    for (const row of rows) {
      if (picNamesForRow(row, department).length === 0) continue;
      assigned += 1;
      entry[row.phase] = (entry[row.phase] as number) + 1;
    }
    entry.assigned = assigned;
    return entry;
  });
}

function StatTile({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-semibold tabular-nums mt-1">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{hint}</p>
    </div>
  );
}

function ChartPanel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">{description}</p>
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const DEPARTMENT_FILTERS = [
  { value: "all", label: "All" },
  { value: "QA", label: "QA" },
  { value: "FA", label: "FA" },
  { value: "Dev", label: "Dev" },
] as const;

export function TaskVisualization({ rows }: { rows: TaskBoardRow[] }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const hue = (slot: { light: string; dark: string }) => (isDark ? slot.dark : slot.light);
  // The 2px separator between touching marks is the chart surface itself, so it
  // reads as a gap rather than an outline drawn around the data.
  const surface = "hsl(var(--card))";
  const axisTick = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
  const tooltipStyle = {
    background: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 8,
    fontSize: 12,
  };

  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [showTable, setShowTable] = useState(false);

  const memberLoads = useMemo(() => buildMemberLoads(rows), [rows]);
  const phaseMix = useMemo(() => buildDepartmentPhaseMix(rows), [rows]);

  const visibleMembers = useMemo(
    () => (departmentFilter === "all" ? memberLoads : memberLoads.filter((m) => m.department === departmentFilter)),
    [memberLoads, departmentFilter],
  );

  const totals = useMemo(() => {
    const open = rows.filter((r) => r.progress < 100).length;
    const overdue = rows.filter(isRowOverdue).length;
    const unassigned = rows.filter((r) => PIC_DEPARTMENTS.every((d) => picNamesForRow(r, d).length === 0)).length;
    return { total: rows.length, open, overdue, unassigned, people: memberLoads.length };
  }, [rows, memberLoads]);

  // A long people-name reads far better down the side than rotated under a
  // column, so member load is a horizontal bar chart. The cap keeps the chart
  // readable on a big team; the table below carries everyone.
  const chartMembers = visibleMembers.slice(0, 20);
  const chartData = chartMembers.map((m) => ({
    name: departmentFilter === "all" ? `${m.name} · ${m.department}` : m.name,
    open: m.open,
    done: m.done,
    total: m.total,
  }));

  if (rows.length === 0) {
    return (
      <div className="text-center py-16 text-sm text-muted-foreground border border-dashed rounded-lg">
        No requirements in view — clear the filters on the Board tab to see the team's workload.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatTile label="Requirements" value={totals.total} hint="in the current view" />
        <StatTile label="Open" value={totals.open} hint="not yet at 100%" />
        <StatTile label="Overdue" value={totals.overdue} hint="past due, still open" />
        <StatTile label="People with work" value={totals.people} hint="named as a PIC" />
        <StatTile label="Unassigned" value={totals.unassigned} hint="no PIC in any department" />
      </div>

      <ChartPanel
        title="Workload by member"
        description="One bar per person, counting the requirements they are named PIC on. Open work carries the colour and delivered work recedes, so the coloured length is the load they are actually still carrying."
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            {DEPARTMENT_FILTERS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={departmentFilter === option.value ? "default" : "outline"}
                className="h-7 px-3 text-xs"
                onClick={() => setDepartmentFilter(option.value)}
              >
                {option.label}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-3 text-xs"
              onClick={() => setShowTable((v) => !v)}
            >
              {showTable ? "Hide table" : "Show table"}
            </Button>
          </div>
        }
      >
        {chartData.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground border border-dashed rounded-md">
            Nobody is named as a PIC in this department yet.
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 34 + 56)}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 44, bottom: 0, left: 8 }}>
                <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" allowDecimals={false} tick={axisTick} />
                <YAxis type="category" dataKey="name" width={170} tick={axisTick} interval={0} />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.4 }}
                  contentStyle={tooltipStyle}
                  formatter={(value, name) => [value, name === "open" ? LOAD_SERIES.open.label : LOAD_SERIES.done.label]}
                />
                <Legend
                  formatter={(value) => (value === "open" ? LOAD_SERIES.open.label : LOAD_SERIES.done.label)}
                  wrapperStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="open" stackId="load" fill={hue(LOAD_SERIES.open)} barSize={18} stroke={surface} strokeWidth={2} />
                <Bar dataKey="done" stackId="load" fill={hue(LOAD_SERIES.done)} barSize={18} stroke={surface} strokeWidth={2} radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="total" position="right" style={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {visibleMembers.length > chartMembers.length && (
              <p className="text-xs text-muted-foreground mt-2">
                Showing the {chartMembers.length} most loaded of {visibleMembers.length} people — the table below lists everyone.
              </p>
            )}
            {showTable && (
              <div className="mt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead className="w-[90px]">Dept</TableHead>
                      <TableHead className="w-[80px] text-right">Open</TableHead>
                      <TableHead className="w-[100px] text-right">Delivered</TableHead>
                      <TableHead className="w-[90px] text-right">Overdue</TableHead>
                      <TableHead className="w-[80px] text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleMembers.map((m) => (
                      <TableRow key={`${m.department}-${m.name}`}>
                        <TableCell className="font-medium">{m.name}</TableCell>
                        <TableCell className="text-muted-foreground">{m.department}</TableCell>
                        <TableCell className="text-right tabular-nums">{m.open}</TableCell>
                        <TableCell className="text-right tabular-nums">{m.done}</TableCell>
                        <TableCell className={`text-right tabular-nums ${m.overdue > 0 ? "text-destructive font-medium" : ""}`}>
                          {m.overdue}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{m.total}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </ChartPanel>

      <ChartPanel
        title="Team workload by phase"
        description="Where each department's requirements currently sit. A department stacked heavily on one phase is where the queue is forming; the number at the end of each bar is everything that department is named on."
      >
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={phaseMix} layout="vertical" margin={{ top: 4, right: 44, bottom: 0, left: 8 }}>
            <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
            <XAxis type="number" allowDecimals={false} tick={axisTick} />
            <YAxis type="category" dataKey="department" width={60} tick={axisTick} interval={0} />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.4 }}
              contentStyle={tooltipStyle}
              formatter={(value, name) => [value, PHASE_SERIES.find((s) => s.key === name)?.label ?? String(name)]}
            />
            <Legend
              formatter={(value) => PHASE_SERIES.find((s) => s.key === value)?.label ?? String(value)}
              wrapperStyle={{ fontSize: 12 }}
            />
            {PHASE_SERIES.map((series, i) => {
              const isLast = i === PHASE_SERIES.length - 1;
              return (
                <Bar
                  key={series.key}
                  dataKey={series.key}
                  stackId="phase"
                  fill={hue(series)}
                  barSize={22}
                  stroke={surface}
                  strokeWidth={2}
                  radius={isLast ? [0, 4, 4, 0] : undefined}
                >
                  {isLast && (
                    <LabelList
                      dataKey="assigned"
                      position="right"
                      style={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    />
                  )}
                </Bar>
              );
            })}
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>
    </div>
  );
}

export default TaskVisualization;
