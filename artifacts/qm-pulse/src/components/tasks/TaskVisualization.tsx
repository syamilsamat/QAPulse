import { useMemo, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import {
  BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, LabelList, ResponsiveContainer,
} from "recharts";
import { AlertTriangle, CheckCircle2, Clock, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import { LateDetails } from "./LateDetails";
import {
  PIC_DEPARTMENTS,
  picNamesForRow,
  isRowOverdue,
  type TaskBoardRow,
  type PicDepartment,
} from "@/lib/task-board";

// The board answers "what is the state of each milestone". These views answer
// the two questions it can't, in words a first-time reader follows without a
// key: where the work is sitting right now, and who is carrying how much.
// Everything is derived from the same rows the board renders — no second
// fetch, so the two views can never disagree.

// ─── Where is the work? ──────────────────────────────────────────────────────
// Every requirement is counted exactly ONCE, in the step it is at right now.
// (The previous per-department stacked bar counted a requirement once for each
// department named on it, so its bars added up to more than the requirements
// that exist — impossible to read.) Finished work (100%) is its own step.
type StageKey = TaskBoardRow["phase"] | "done";

// `phrase` completes the headline "Most unfinished work is …".
const STAGES: { key: StageKey; label: string; caption: string; phrase: string }[] = [
  { key: "requirements", label: "Writing requirements", caption: "Deciding and checking what to build", phrase: "still in requirements writing" },
  // "Gap" on the server: approved, but no developer has picked it up yet.
  { key: "gap", label: "Waiting for a developer", caption: "Approved, but nobody has started building it", phrase: "waiting for a developer" },
  { key: "develop", label: "Being built", caption: "Developers are building it", phrase: "being built" },
  { key: "qa", label: "Being tested", caption: "Testers are checking that it works", phrase: "being tested" },
  { key: "sit", label: "System integration testing (SIT)", caption: "Checked together with the other systems", phrase: "in system integration testing (SIT)" },
  { key: "uat", label: "User testing (UAT)", caption: "Users try it out before release", phrase: "in user testing (UAT)" },
  { key: "done", label: "Done", caption: "Finished — 100% complete", phrase: "done" },
];

interface StageCount {
  key: StageKey;
  label: string;
  caption: string;
  phrase: string;
  count: number;
  late: number;
  /** The late requirements themselves — listed when "N late" is opened. */
  lateRows: TaskBoardRow[];
}

const stageOf = (row: TaskBoardRow): StageKey => (row.progress >= 100 ? "done" : row.phase);
const stageLabelFor = (row: TaskBoardRow) => STAGES.find((s) => s.key === stageOf(row))?.label ?? row.phaseLabel;

function buildStageCounts(rows: TaskBoardRow[]): StageCount[] {
  const counts = new Map<StageKey, { count: number; lateRows: TaskBoardRow[] }>(
    STAGES.map((s) => [s.key, { count: 0, lateRows: [] }]),
  );
  for (const row of rows) {
    const entry = counts.get(stageOf(row));
    if (!entry) continue;
    entry.count += 1;
    if (isRowOverdue(row)) entry.lateRows.push(row);
  }
  return STAGES.map((s) => {
    const { count, lateRows } = counts.get(s.key)!;
    return { ...s, count, late: lateRows.length, lateRows };
  });
}

// ─── Who has the most work? ──────────────────────────────────────────────────
// Three states that split each person's milestones with nothing counted twice.
// Late wears the reserved status red — it is the part a lead acts on. In
// progress takes the accent blue. Finished recedes to a mid grey: it is the
// least urgent part of the bar, and unlike a status green it stays clearly
// apart from red for red-green colour-blind readers even when a person has
// nothing in progress and the two segments touch (validated all-pairs in both
// modes). The earlier pale grey was near-invisible (1.6:1); this one clears
// 3:1. Every place a colour appears also carries an icon and a word.
const LOAD_SERIES = [
  { key: "overdue", label: "Late", light: "#d03b3b", dark: "#d03b3b", Icon: AlertTriangle },
  { key: "open", label: "In progress", light: "#2a78d6", dark: "#3987e5", Icon: Clock },
  { key: "done", label: "Finished", light: "#898781", dark: "#898781", Icon: CheckCircle2 },
] as const;

interface MemberLoad {
  name: string;
  department: PicDepartment;
  /** In progress and NOT late — the three counts add up to `total`. */
  open: number;
  done: number;
  overdue: number;
  total: number;
  /** Names of the late milestones, for the hover tooltip. */
  lateMilestones: string[];
}

/**
 * One entry per (person, department) pair, counted in MILESTONES rather than
 * requirements.
 *
 * A milestone with five requirements all assigned to the same tester is one
 * piece of work on their plate, not five — counting requirements made a single
 * busy milestone look like a whole backlog and put everyone on roughly the same
 * bar. This is also the unit the Team Workload card on the board uses.
 *
 * A milestone is Finished for a person once every requirement in it (within the
 * current filters) reads 100%; it is Late when it is still open and at least one
 * of its requirements is past due.
 */
function buildMemberLoads(rows: TaskBoardRow[]): MemberLoad[] {
  const byKey = new Map<
    string,
    { name: string; department: PicDepartment; milestones: Map<number, { name: string; allDone: boolean; anyOverdue: boolean }> }
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
          entry.milestones.set(row.milestoneId, { name: row.milestoneName, allDone: rowDone, anyOverdue: rowOverdue });
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
      const lateMilestones: string[] = [];
      for (const state of milestones.values()) {
        if (state.allDone) done += 1;
        else if (state.anyOverdue) {
          overdue += 1;
          lateMilestones.push(state.name);
        } else open += 1;
      }
      return { name, department, open, done, overdue, total: milestones.size, lateMilestones };
    })
    // Whoever is most behind first — late outranks a merely large plate.
    .sort(
      (a, b) =>
        b.overdue - a.overdue ||
        b.open - a.open ||
        b.total - a.total ||
        a.name.localeCompare(b.name),
    );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function StatTile({ label, value, hint, tone, extra }: { label: string; value: number; hint: string; tone?: "late"; extra?: ReactNode }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        {tone === "late" && value > 0 && <AlertTriangle className="w-3.5 h-3.5 text-destructive" aria-hidden />}
        {label}
      </p>
      <p className={`text-3xl font-semibold mt-1 ${tone === "late" && value > 0 ? "text-destructive" : ""}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{hint}</p>
      {extra && <div className="mt-1.5">{extra}</div>}
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
  description: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="text-sm text-muted-foreground mt-1 max-w-2xl">{description}</div>
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const DEPARTMENT_FILTERS = [
  { value: "all", label: "Everyone" },
  { value: "QA", label: "QA" },
  { value: "FA", label: "FA" },
  { value: "Dev", label: "Dev" },
] as const;

const DEPARTMENT_NAME: Record<PicDepartment, string> = { QA: "QA team", FA: "FA team", Dev: "Dev team" };

// Person name on top, their team underneath in muted ink — reads far better
// than "HOD FA · QA" squeezed onto one line.
function MemberTick({ x, y, payload, data, maxChars }: { x?: number; y?: number; payload?: { value: string }; data: { key: string; name: string; department: string }[]; maxChars: number }) {
  const member = data.find((d) => d.key === payload?.value);
  if (!member || x == null || y == null) return null;
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={-8} y={-2} textAnchor="end" fontSize={12} fill="hsl(var(--foreground))">
        <title>{member.name}</title>
        {member.name.length > maxChars ? `${member.name.slice(0, maxChars - 1)}…` : member.name}
      </text>
      <text x={-8} y={12} textAnchor="end" fontSize={10.5} fill="hsl(var(--muted-foreground))">
        {member.department}
      </text>
    </g>
  );
}

function MemberTooltip({ active, payload }: { active?: boolean; payload?: { payload: { name: string; department: string; overdue: number; open: number; done: number; total: number; lateMilestones: string[] } }[] }) {
  const m = payload?.[0]?.payload;
  if (!active || !m) return null;
  const shownLate = m.lateMilestones.slice(0, 5);
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md max-w-[18rem]">
      <p className="font-medium text-sm">{m.name}</p>
      <p className="text-muted-foreground mb-1.5">{m.department}</p>
      {LOAD_SERIES.map(({ key, label, Icon }) => (
        <p key={key} className="flex items-center gap-1.5 tabular-nums">
          <Icon className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />
          {label}: <span className="font-medium">{m[key]}</span>
        </p>
      ))}
      <p className="mt-1.5 pt-1.5 border-t tabular-nums">Total: <span className="font-medium">{plural(m.total, "milestone")}</span></p>
      {shownLate.length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t">
          <p className="font-medium text-destructive flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden /> Late milestones
          </p>
          <ul className="mt-0.5 space-y-0.5">
            {shownLate.map((name, i) => (
              <li key={`${name}-${i}`} className="break-words">• {name}</li>
            ))}
          </ul>
          {m.lateMilestones.length > shownLate.length && (
            <p className="text-muted-foreground mt-0.5">and {m.lateMilestones.length - shownLate.length} more — see the Board tab</p>
          )}
        </div>
      )}
    </div>
  );
}

const NO_PROJECTS = new Map<number, string>();

export function TaskVisualization({
  rows,
  projectNameById = NO_PROJECTS,
}: {
  rows: TaskBoardRow[];
  /** Names the project in the late-details lists; rows only carry its id. */
  projectNameById?: Map<number, string>;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const isMobile = useIsMobile();
  const hue = (slot: { light: string; dark: string }) => (isDark ? slot.dark : slot.light);
  // The 2px separator between touching marks is the chart surface itself, so it
  // reads as a gap rather than an outline drawn around the data.
  const surface = "hsl(var(--card))";
  const axisTick = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };

  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [showMemberTable, setShowMemberTable] = useState(false);
  const [showStageTable, setShowStageTable] = useState(false);

  const stages = useMemo(() => buildStageCounts(rows), [rows]);
  const memberLoads = useMemo(() => buildMemberLoads(rows), [rows]);

  const visibleMembers = useMemo(
    () => (departmentFilter === "all" ? memberLoads : memberLoads.filter((m) => m.department === departmentFilter)),
    [memberLoads, departmentFilter],
  );

  const lateRows = useMemo(() => rows.filter(isRowOverdue), [rows]);
  const totals = useMemo(() => {
    const open = rows.filter((r) => r.progress < 100).length;
    const overdue = lateRows.length;
    const unassigned = rows.filter((r) => PIC_DEPARTMENTS.every((d) => picNamesForRow(r, d).length === 0)).length;
    return { total: rows.length, open, overdue, unassigned, people: memberLoads.length };
  }, [rows, lateRows, memberLoads]);

  // The busiest unfinished step is the one the headline sentence points at and
  // the only tile that gets the accent — everything else stays quiet.
  const unfinishedStages = stages.filter((s) => s.key !== "done");
  const busiest = unfinishedStages.reduce<StageCount | null>((best, s) => (s.count > (best?.count ?? 0) ? s : best), null);
  const unfinishedTotal = unfinishedStages.reduce((sum, s) => sum + s.count, 0);

  // A long name reads far better down the side than rotated under a column, so
  // member load is a horizontal bar chart. The cap keeps it readable on a big
  // team; the table carries everyone.
  const chartMembers = visibleMembers.slice(0, 20);
  const chartData = chartMembers.map((m) => ({
    key: `${m.department}::${m.name}`,
    name: m.name,
    department: DEPARTMENT_NAME[m.department],
    overdue: m.overdue,
    open: m.open,
    done: m.done,
    total: m.total,
    lateMilestones: m.lateMilestones,
  }));
  // Axis ends at the biggest bar (not a rounded-up 12 when nobody has more than
  // 2), with one tick per whole milestone while that stays readable.
  const maxTotal = Math.max(1, ...chartData.map((d) => d.total));
  const xTicks = maxTotal <= 10 ? Array.from({ length: maxTotal + 1 }, (_, i) => i) : undefined;
  const peopleLate = visibleMembers.filter((m) => m.overdue > 0).length;

  if (rows.length === 0) {
    return (
      <div className="text-center py-16 text-sm text-muted-foreground border border-dashed rounded-lg">
        No requirements in view — clear the filters on the Board tab to see the team's workload.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* These five count REQUIREMENTS; the person chart counts milestones.
          The hints name the unit so the two never look like they should match. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatTile label="All requirements" value={totals.total} hint="in this view" />
        <StatTile label="Not finished" value={totals.open} hint="still being worked on" />
        <StatTile
          label="Late"
          value={totals.overdue}
          hint="past the due date and not finished"
          tone="late"
          extra={totals.overdue > 0 && (
            <LateDetails
              rows={lateRows}
              heading={`All ${plural(totals.overdue, "late requirement")}`}
              projectNameById={projectNameById}
              stageLabelFor={stageLabelFor}
              className="text-xs font-medium text-destructive"
            >
              See which ones
            </LateDetails>
          )}
        />
        <StatTile label="People working" value={totals.people} hint="named as the person in charge" />
        <StatTile label="Nobody assigned" value={totals.unassigned} hint="no one is in charge yet" />
      </div>

      <ChartPanel
        title="Where is the work right now?"
        description={
          <>
            <p>
              Every requirement moves through these steps, left to right. Each box shows how many requirements are at
              that step today — each one is counted once.
            </p>
            <p className="mt-1.5 text-foreground">
              {busiest && unfinishedTotal > 0 ? (
                <>
                  Most unfinished work is <strong>{busiest.phrase}</strong>: {busiest.count} of{" "}
                  {plural(unfinishedTotal, "unfinished requirement")}.
                  {totals.overdue > 0 && <> {plural(totals.overdue, "requirement is", "requirements are")} late.</>}
                </>
              ) : (
                <>Everything in this view is done.</>
              )}
            </p>
          </>
        }
        action={
          <Button type="button" size="sm" variant="ghost" className="h-7 px-3 text-xs shrink-0" onClick={() => setShowStageTable((v) => !v)}>
            {showStageTable ? "Hide table" : "Show table"}
          </Button>
        }
      >
        <ol className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {stages.map((stage, i) => {
            const share = totals.total > 0 ? Math.round((stage.count / totals.total) * 100) : 0;
            const isBusiest = stage.key === busiest?.key && stage.count > 0;
            const isDone = stage.key === "done";
            return (
              <li
                key={stage.key}
                className={`relative rounded-lg border p-3 flex flex-col ${isBusiest ? "border-primary ring-1 ring-primary/40" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-muted-foreground">Step {i + 1}</span>
                  {isBusiest && <span className="text-[11px] font-medium text-primary">Most work</span>}
                </div>
                <p className="text-sm font-semibold mt-1 leading-snug flex items-center gap-1.5">
                  {isDone && <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "#0ca30c" }} aria-hidden />}
                  {stage.label}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug flex-1">{stage.caption}</p>
                <p className="text-3xl font-semibold mt-2">{stage.count}</p>
                <p className="text-xs text-muted-foreground">{stage.count === 1 ? "requirement" : "requirements"}</p>
                {/* Share of ALL requirements — one hue, so length is the only
                    thing to read. */}
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden>
                  <div className="h-full rounded-full" style={{ width: `${share}%`, background: hue(LOAD_SERIES[1]) }} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">{share}% of all</p>
                <p className={`text-xs mt-1.5 flex items-center gap-1 ${stage.late > 0 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                  {stage.late > 0 ? (
                    <LateDetails
                      rows={stage.lateRows}
                      heading={`${plural(stage.late, "late requirement")} — ${stage.label}`}
                      projectNameById={projectNameById}
                      stageLabelFor={stageLabelFor}
                    >
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden /> {stage.late} late
                    </LateDetails>
                  ) : isDone ? "—" : "None late"}
                </p>
                {i < stages.length - 1 && (
                  <ChevronRight
                    className="hidden xl:block absolute -right-[15px] top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 z-10"
                    aria-hidden
                  />
                )}
              </li>
            );
          })}
        </ol>
        {showStageTable && (
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Step</TableHead>
                  <TableHead className="w-[130px] text-right">Requirements</TableHead>
                  <TableHead className="w-[90px] text-right">Late</TableHead>
                  <TableHead className="w-[100px] text-right">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stages.map((s, i) => (
                  <TableRow key={s.key}>
                    <TableCell className="font-medium">{i + 1}. {s.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.count}</TableCell>
                    <TableCell className={`text-right tabular-nums ${s.late > 0 ? "text-destructive font-medium" : ""}`}>{s.late}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {totals.total > 0 ? Math.round((s.count / totals.total) * 100) : 0}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </ChartPanel>

      <ChartPanel
        title="Who has the most work?"
        description={
          <>
            <p>
              Each bar is one person. The longer the bar, the more milestones they are in charge of. The colours show
              whether those milestones are late, in progress or finished. People with late work are at the top.
            </p>
            <p className="mt-1.5 text-foreground">
              {visibleMembers.length === 0
                ? null
                : peopleLate > 0
                  ? <>{peopleLate} of {plural(visibleMembers.length, "person", "people")} {peopleLate === 1 ? "has" : "have"} late work.</>
                  : <>Nobody has late work.</>}
            </p>
          </>
        }
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
              onClick={() => setShowMemberTable((v) => !v)}
            >
              {showMemberTable ? "Hide table" : "Show table"}
            </Button>
          </div>
        }
      >
        {chartData.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground border border-dashed rounded-md">
            Nobody is named as the person in charge in this team yet.
          </div>
        ) : (
          <>
            {/* Key above the chart, with an icon next to every colour. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-3 text-xs">
              {LOAD_SERIES.map(({ key, label, Icon, ...slot }) => (
                <span key={key} className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: hue(slot) }} aria-hidden />
                  <Icon className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />
                  {label}
                </span>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={Math.max(160, chartData.length * 42 + 48)}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 40, bottom: 18, left: 8 }}>
                <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  domain={[0, maxTotal]}
                  ticks={xTicks}
                  tick={axisTick}
                  label={{ value: "Number of milestones", position: "insideBottom", offset: -10, fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                {/* A narrower names column on phones, so the bars keep most of
                    the width; the full name is in the tooltip and the table. */}
                <YAxis
                  type="category"
                  dataKey="key"
                  width={isMobile ? 104 : 170}
                  interval={0}
                  tickLine={false}
                  tick={<MemberTick data={chartData} maxChars={isMobile ? 13 : 22} />}
                />
                <Tooltip cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.4 }} content={<MemberTooltip />} />
                {LOAD_SERIES.map((series, i) => {
                  const isLast = i === LOAD_SERIES.length - 1;
                  return (
                    <Bar
                      key={series.key}
                      dataKey={series.key}
                      name={series.label}
                      stackId="load"
                      fill={hue(series)}
                      barSize={20}
                      stroke={surface}
                      strokeWidth={2}
                      radius={isLast ? [0, 4, 4, 0] : undefined}
                    >
                      {isLast && (
                        <LabelList
                          dataKey="total"
                          position="right"
                          style={{ fontSize: 12, fontWeight: 600, fill: "hsl(var(--foreground))" }}
                        />
                      )}
                    </Bar>
                  );
                })}
              </BarChart>
            </ResponsiveContainer>
            {visibleMembers.length > chartMembers.length && (
              <p className="text-xs text-muted-foreground mt-2">
                Showing the {chartMembers.length} people most behind, out of {visibleMembers.length}. Click "Show table" to see everyone.
              </p>
            )}
            {showMemberTable && (
              <div className="mt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Person</TableHead>
                      <TableHead className="w-[100px]">Team</TableHead>
                      <TableHead className="w-[80px] text-right">Late</TableHead>
                      <TableHead className="w-[100px] text-right">In progress</TableHead>
                      <TableHead className="w-[90px] text-right">Finished</TableHead>
                      <TableHead className="w-[80px] text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleMembers.map((m) => (
                      <TableRow key={`${m.department}-${m.name}`}>
                        <TableCell className="font-medium">{m.name}</TableCell>
                        <TableCell className="text-muted-foreground">{DEPARTMENT_NAME[m.department]}</TableCell>
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
    </div>
  );
}

export default TaskVisualization;
