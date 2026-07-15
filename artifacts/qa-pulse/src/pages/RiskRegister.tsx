import { useState } from "react";
import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShieldAlert } from "lucide-react";
import { RisksCard, CAN_WRITE_ROLES } from "@/components/RiskRegisterCard";

// CR040 — standalone Risk Register page, split out of PM Dashboard so
// qa_lead/fa_lead (Consulted-level stakeholders per the originating RACI
// review) can reach it without the rest of PM Dashboard's other panels.

function api(path: string, token: string | null) {
  return fetch(`${getApiUrl()}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

export default function RiskRegister() {
  const { token, user } = useAuth();
  const searchString = useSearch();
  const initialProjectId = new URLSearchParams(searchString).get("projectId");
  const [filterProject, setFilterProject] = useState<string>(initialProjectId ?? "all");

  const { data: projects = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await api("/projects", token);
      return res.ok ? res.json() : [];
    },
  });

  const { data: milestones = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["milestones", filterProject],
    queryFn: async () => {
      if (filterProject === "all") return [];
      const res = await api(`/milestones?projectId=${filterProject}`, token);
      return res.ok ? res.json() : [];
    },
    enabled: filterProject !== "all",
  });

  const canWrite = CAN_WRITE_ROLES.includes(user?.role ?? "");

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            Risk Register
          </h1>
          <p className="text-sm text-muted-foreground">Project and schedule risks, tracked with a probability × impact score.</p>
        </div>
        <Select value={filterProject} onValueChange={setFilterProject}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="Select a project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Select a project…</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filterProject === "all" ? (
        <p className="text-sm text-muted-foreground text-center py-16">Select a project to view its risks.</p>
      ) : (
        <RisksCard projectId={Number(filterProject)} token={token} milestones={milestones} canWrite={canWrite} />
      )}
    </div>
  );
}
