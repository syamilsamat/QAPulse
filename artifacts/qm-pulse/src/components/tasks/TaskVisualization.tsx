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

// Three states that partition a member's milestones, so the segments sum to the
// total with nothing counted twice. Overdue is carved OUT of open rather than
// laid over it — it is the segment a lead acts on, and leaving it only in the
// table meant the chart couldn't show the one thing worth looking for.
//
// Overdue wears the reserved status red (never a series colour elsewhere here);
// the rest is emphasis — open work carries the accent hue, delivered recedes to
// grey. Legend, direct totals and the table keep identity off colour alone.
const LOAD_SERIES = {
  overdue: { key: "overdue", label: "Overdue", light: "#d03b3b", dark: "#d03b3b" },
  open: { key: "open", label: "Open", light: "#2a78d6", dark: "#3987e5" },
  done: { key: "done", label: "Delivered", light: "#c9c8c3", dark: "#4a4a47" },
} as const;

const LOAD_STACK = [LOAD_SERIES.overdue, LOAD_SERIES.open, LOAD_SERIES.done];
const LOAD_LABELS: Record<string, string> = {
  overdue: LOAD_SERIES.overdue.label,
  open: LOAD_SERIES.open.label,
  done: LOAD_SERIES.done.label,
};

interface MemberLoad {
  name: string;
  department: PicDepartment;
  /** Open and NOT overdue — the three counts partition `total`. */
  open: number;
  done: number;
  overdue: number;
  total: number;
}

/**
 * One entry per (person, department) pair, counted in MILESTONES rather than
 * requirements.
 *
 * A milestone with five requirements all assigned to the same tester is one
 * piece of work on their plate, not five — counting requirements made a single
 * busy milestone look like a whole backlog and put everyone on roughly the same
 * bar. This is also the unit the Team Workload card above already uses, so the
 * two now agree.
 *
 * A milestone is Delivered for a member once every requirement in it (within
 * the current filters) reads 100%, matching the card's own "average progress
 * below 100 means open" test; it is Overdue when it is still open and at least
 * one of its requirements is past due.
 */
function buildMemberLoads(rows: TaskBoardRow[]): MemberLoad[] {
  // (person, department) -> milestoneId -> rolled-up state of that milestone
  const byKey = new Map<
    string,
    { name: string; department: PicDepartment; milestones: Map<number, { allDone: boolean; anyOverdue: boolean }> }
  >();

  for (const row of rows) {
    for (const department of PIC_DEPARTMENTS) {
      for (const name of picNamesForRow(row, department)) {
        const key = `${department}::${name.toLowerCase()}`;
        let entry = byKey.get(key);
        if (!entry) {
          entry = { name, department, milestones: new Map() };
          byKey.set(key, entry);
        }
        const state = entry.milestones.get(row.milestoneId);
        const rowDone = row.progress >= 100;
        const rowOverdue = isRowOverdue(row);
        if (!state) {
          entry.milestones.set(row.milestoneId, { allDone: rowDone, anyOverdue: rowOverdue });
        } else {
          state.allDone = state.allDone && rowDone;
          state.anyOverdue = state.anyOverdue || rowOverdue;
        }
      }
    }
  }

  return [...byKey.values()]
    .map(({ name, department, milestones }) => {
      let open = 0;
      let done = 0;
      let overdue = 0;
      for (const state of milestones.values()) {
        if (state.allDone) done += 1;
        else if (state.anyOverdue) overdue += 1;
        else open += 1;
      }
      return { name, department, open, done, overdue, total: milestones.size };
    })
    // Whoever is most behind first — overdue outranks a merely large plate.
    .sort(
      (a, b) =>
        b.overdue - a.overdue ||
        b.open - a.open ||
        b.total - a.total ||
        a.name.localeCompare(b.name),
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
    overdue: m.overdue,
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
        {/* These five count REQUIREMENTS. The member chart below counts
            milestones — different questions, so the hints name the unit rather
            than leaving two numbers on one screen that look like they should
            reconcile and don't. */}
        <StatTile label="Requirements" value={totals.total} hint="in the current view" />
        <StatTile label="Open" value={totals.open} hint="requirements under 100%" />
        <StatTile label="Overdue" value={totals.overdue} hint="requirements past due, still open" />
        <StatTile label="People with work" value={totals.people} hint="named as a PIC" />
        <StatTile label="Unassigned" value={totals.unassigned} hint="no PIC in any department" />
      </div>

      <ChartPanel
        title="Workload by member"
        description="Milestones each person is named PIC on — a milestone with five requirements on one tester is one piece of work, not five, which is the same unit the Team Workload card uses. Overdue means still open with at least one requirement past due. Sorted by who is most behind."
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
                  formatter={(value, name) => [value, LOAD_LABELS[String(name)] ?? String(name)]}
                />
                <Legend
                  formatter={(value) => LOAD_LABELS[String(value)] ?? String(value)}
                  wrapperStyle={{ fontSize: 12 }}
                />
                {LOAD_STACK.map((series, i) => {
                  const isLast = i === LOAD_STACK.length - 1;
                  return (
                    <Bar
                      key={series.key}
                      dataKey={series.key}
                      stackId="load"
                      fill={hue(series)}
                      barSize={18}
                      stroke={surface}
                      strokeWidth={2}
                      radius={isLast ? [0, 4, 4, 0] : undefined}
                    >
                      {isLast && (
                        <LabelList
                          dataKey="total"
                          position="right"
                          style={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        />
                      )}
                    </Bar>
                  );
                })}
              </BarChart>
            </ResponsiveContainer>
            {visibleMembers.length > chartMembers.length && (
              <p className="text-xs text-muted-foreground mt-2">
                Showing the {chartMembers.length} most behind of {visibleMembers.length} people — the table below lists everyone.
              </p>
            )}
            {showTable && (
              <div className="mt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead className="w-[90px]">Dept</TableHead>
                      <TableHead className="w-[90px] text-right">Overdue</TableHead>
                      <TableHead className="w-[80px] text-right">Open</TableHead>
                      <TableHead className="w-[100px] text-right">Delivered</TableHead>
                      <TableHead className="w-[80px] text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleMembers.map((m) => (
                      <TableRow key={`${m.department}-${m.name}`}>
                        <TableCell className="font-medium">{m.name}</TableCell>
                        <TableCell className="text-muted-foreground">{m.department}</TableCell>
                        <TableCell className={`text-right tabular-nums ${m.overdue > 0 ? "text-destructive font-medium" : ""}`}>
                          {m.overdue}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{m.open}</TableCell>
                        <TableCell className="text-right tabular-nums">{m.done}</TableCell>
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
        description="Requirements — not milestones — so a department's queue is visible at the level work actually moves through. Where each department's requirements currently sit right now; the number at the end of each bar is everything that department is named on."
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
