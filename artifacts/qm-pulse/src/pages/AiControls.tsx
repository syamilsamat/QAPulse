import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, ShieldAlert, Loader2, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl, authHeaders } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";

type GlobalSettings = { enabled: boolean; dailyCapPerUser: number; hourlyCapPerUser: number };
type FeatureRow = {
  feature: string;
  label: string;
  description: string;
  writes: boolean;
  enabled: boolean;
  allowedRoles: string[] | null;
  defaultRoles: string[] | null;
  dailyCapPerUser: number | null;
  separateDailyCap: number | null;
};
type Controls = { global: GlobalSettings; defaults: GlobalSettings; features: FeatureRow[]; roles: string[] };
type Usage = {
  days: number;
  byFeature: { feature: string; label: string; ok: number; error: number; blocked: number; cached: number }[];
  byUser: { userId: number | null; name: string; calls: number; blocked: number }[];
  recent: { id: number; label: string; status: string; blockedReason: string | null; userName: string; createdAt: string }[];
};

const BLOCK_LABEL: Record<string, string> = {
  ai_disabled: "AI off",
  feature_disabled: "Feature off",
  role: "Role not allowed",
  access: "No project access",
  daily_cap: "Daily limit",
  hourly_cap: "Hourly limit",
};

async function send(path: string, method: string, body?: unknown) {
  const res = await fetch(`${getApiUrl()}${path}`, {
    method,
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export default function AiControls() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [days, setDays] = useState(7);

  const { data: controls, isLoading } = useQuery<Controls>({
    queryKey: ["ai-controls"],
    queryFn: () => send("/ai/controls", "GET"),
  });
  const { data: usage } = useQuery<Usage>({
    queryKey: ["ai-controls-usage", days],
    queryFn: () => send(`/ai/controls/usage?days=${days}`, "GET"),
  });

  const [daily, setDaily] = useState("");
  const [hourly, setHourly] = useState("");
  useEffect(() => {
    if (controls) {
      setDaily(String(controls.global.dailyCapPerUser));
      setHourly(String(controls.global.hourlyCapPerUser));
    }
  }, [controls]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["ai-controls"] });
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast({ title: ok });
      refresh();
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message ?? "Failed" });
    }
  };

  if (user?.role !== "admin" && user?.role !== "cto") {
    return <p className="p-8 text-center text-muted-foreground">Only an administrator can manage AI controls.</p>;
  }
  if (isLoading || !controls) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const g = controls.global;
  const patchFeature = (feature: string, body: Record<string, unknown>, ok: string) =>
    run(() => send(`/ai/controls/features/${feature}`, "PUT", body), ok);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-6xl">
      <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground w-fit">
        <ArrowLeft className="w-4 h-4" /> Back to Settings
      </Link>
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Bot className="w-7 h-7 text-primary" /> AI Controls
        </h1>
        <p className="text-muted-foreground mt-1">
          Decide who can use AI, how much, and see what has been run. Changes apply within seconds.
        </p>
      </div>

      <Card className={g.enabled ? "" : "border-destructive"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="w-4 h-4" /> Master switch and limits
          </CardTitle>
          <CardDescription>
            Turning AI off blocks every AI feature for everyone except administrators, so you can test a fix before re-enabling it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">{g.enabled ? "AI is on" : "AI is off"}</p>
              <p className="text-xs text-muted-foreground">Applies to all AI features at once.</p>
            </div>
            <Switch
              checked={g.enabled}
              onCheckedChange={(enabled) =>
                run(() => send("/ai/controls/global", "PUT", { enabled }), enabled ? "AI turned on" : "AI turned off")
              }
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
            <div className="space-y-1.5">
              <Label htmlFor="ai-daily">Calls per user per day</Label>
              <Input id="ai-daily" type="number" min={0} value={daily} onChange={(e) => setDaily(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-hourly">Calls per user per hour</Label>
              <Input id="ai-hourly" type="number" min={0} value={hourly} onChange={(e) => setHourly(e.target.value)} />
            </div>
          </div>
          <Button
            size="sm"
            disabled={daily === String(g.dailyCapPerUser) && hourly === String(g.hourlyCapPerUser)}
            onClick={() =>
              run(
                () => send("/ai/controls/global", "PUT", { dailyCapPerUser: Number(daily), hourlyCapPerUser: Number(hourly) }),
                "Limits saved",
              )
            }
          >
            Save limits
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Features</CardTitle>
          <CardDescription>
            Turn a feature off, restrict it to certain roles, or give it its own daily limit. An empty role list means any signed-in role.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feature</TableHead>
                <TableHead className="w-20">On</TableHead>
                <TableHead className="min-w-[220px]">Allowed roles</TableHead>
                <TableHead className="w-36">Daily limit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {controls.features.map((f) => (
                <TableRow key={f.feature}>
                  <TableCell>
                    <div className="font-medium flex items-center gap-2">
                      {f.label}
                      {f.writes && <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">changes data</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">{f.description}</div>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={f.enabled}
                      onCheckedChange={(enabled) => patchFeature(f.feature, { enabled }, `${f.label} ${enabled ? "turned on" : "turned off"}`)}
                    />
                  </TableCell>
                  <TableCell>
                    <SearchableMultiSelect
                      values={f.allowedRoles ?? f.defaultRoles ?? []}
                      onValuesChange={(roles) =>
                        patchFeature(f.feature, { allowedRoles: roles.length > 0 ? roles : null }, "Roles updated")
                      }
                      options={controls.roles.map((r) => ({ value: r, label: r }))}
                      placeholder="Any role"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      className="h-8"
                      defaultValue={f.dailyCapPerUser ?? ""}
                      placeholder={f.separateDailyCap != null ? `${f.separateDailyCap} (own)` : "global"}
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        const next = raw === "" ? null : Number(raw);
                        if (next !== f.dailyCapPerUser) patchFeature(f.feature, { dailyCapPerUser: next }, "Limit saved");
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Usage</CardTitle>
            <CardDescription>What was run, by whom, and what was blocked.</CardDescription>
          </div>
          <select
            className="h-8 rounded-md border bg-background px-2 text-sm"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={1}>Last 24 hours</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </CardHeader>
        <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="overflow-x-auto">
            <p className="text-sm font-medium mb-2">By feature</p>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Feature</TableHead><TableHead>OK</TableHead><TableHead>Cached</TableHead><TableHead>Failed</TableHead><TableHead>Blocked</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {(usage?.byFeature ?? []).map((f) => (
                  <TableRow key={f.feature}><TableCell>{f.label}</TableCell><TableCell>{f.ok}</TableCell><TableCell>{f.cached}</TableCell><TableCell>{f.error}</TableCell><TableCell>{f.blocked}</TableCell></TableRow>
                ))}
                {usage && usage.byFeature.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-muted-foreground">No AI calls in this period.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="overflow-x-auto">
            <p className="text-sm font-medium mb-2">By user</p>
            <Table>
              <TableHeader>
                <TableRow><TableHead>User</TableHead><TableHead>Calls</TableHead><TableHead>Blocked</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {(usage?.byUser ?? []).map((u) => (
                  <TableRow key={`${u.userId}`}><TableCell>{u.name}</TableCell><TableCell>{u.calls}</TableCell><TableCell>{u.blocked}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="lg:col-span-2 overflow-x-auto">
            <p className="text-sm font-medium mb-2">Recent calls</p>
            <Table>
              <TableHeader>
                <TableRow><TableHead>When</TableHead><TableHead>User</TableHead><TableHead>Feature</TableHead><TableHead>Result</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {(usage?.recent ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</TableCell>
                    <TableCell>{r.userName}</TableCell>
                    <TableCell>{r.label}</TableCell>
                    <TableCell>
                      {r.status === "blocked"
                        ? <Badge variant="destructive" className="text-[10px]">Blocked · {BLOCK_LABEL[r.blockedReason ?? ""] ?? r.blockedReason}</Badge>
                        : r.status === "error"
                          ? <Badge variant="outline" className="text-[10px]">Failed</Badge>
                          : r.status === "cached"
                            ? <Badge variant="outline" className="text-[10px]">Cached (free)</Badge>
                          : <Badge variant="secondary" className="text-[10px]">OK</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
