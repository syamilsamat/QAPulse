import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  listRequirements, getListRequirementsQueryKey,
  listTestCases, getListTestCasesQueryKey,
  listTasks, getListTasksQueryKey,
  listUsers, getListUsersQueryKey,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, FileText, TestTube, CheckSquare, Users } from "lucide-react";
import { format } from "date-fns";

type SearchResult = {
  type: "requirement" | "test_case" | "task" | "user";
  id: number;
  title: string;
  subtitle?: string;
  badge?: string;
  badgeColor?: string;
  meta?: string;
};

export default function AdminSearch() {
  const [query, setQuery] = useState("");

  const { data: requirements = [] } = useQuery({
    queryKey: getListRequirementsQueryKey(),
    queryFn: () => listRequirements(),
  });

  const { data: testCases = [] } = useQuery({
    queryKey: getListTestCasesQueryKey(),
    queryFn: () => listTestCases(),
  });

  const { data: tasks = [] } = useQuery({
    queryKey: getListTasksQueryKey(),
    queryFn: () => listTasks(),
  });

  const { data: users = [] } = useQuery({
    queryKey: getListUsersQueryKey(),
    queryFn: () => listUsers(),
  });

  const results: SearchResult[] = [];

  if (query.trim().length >= 2) {
    const q = query.toLowerCase();

    requirements
      .filter((r) => r.title.toLowerCase().includes(q) || (r.description ?? "").toLowerCase().includes(q) || (r.module ?? "").toLowerCase().includes(q))
      .forEach((r) => results.push({
        type: "requirement",
        id: r.id,
        title: r.title,
        subtitle: r.projectName ?? undefined,
        badge: r.status.replace("_", " "),
        badgeColor: "bg-slate-100 text-slate-700",
        meta: r.priority,
      }));

    testCases
      .filter((t) => t.title.toLowerCase().includes(q) || (t.objective ?? "").toLowerCase().includes(q))
      .forEach((t) => results.push({
        type: "test_case",
        id: t.id,
        title: t.title,
        subtitle: t.projectName ?? undefined,
        badge: t.type.replace("_", " "),
        badgeColor: "bg-blue-100 text-blue-700",
        meta: t.priority,
      }));

    tasks
      .filter((t) => t.name.toLowerCase().includes(q) || (t.notes ?? "").toLowerCase().includes(q))
      .forEach((t) => results.push({
        type: "task",
        id: t.id,
        title: t.name,
        subtitle: t.assigneeName ?? undefined,
        badge: t.status.replace("_", " "),
        badgeColor: "bg-green-100 text-green-700",
        meta: t.dueDate ? `Due ${format(new Date(t.dueDate), "MMM d")}` : undefined,
      }));

    users
      .filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.team ?? "").toLowerCase().includes(q))
      .forEach((u) => results.push({
        type: "user",
        id: u.id,
        title: u.name,
        subtitle: u.email,
        badge: u.role.replace("_", " "),
        badgeColor: "bg-purple-100 text-purple-700",
        meta: u.team ?? undefined,
      }));
  }

  const typeIcons: Record<string, React.ReactNode> = {
    requirement: <FileText className="w-4 h-4 text-blue-500" />,
    test_case: <TestTube className="w-4 h-4 text-emerald-500" />,
    task: <CheckSquare className="w-4 h-4 text-orange-500" />,
    user: <Users className="w-4 h-4 text-purple-500" />,
  };

  const typeLabels: Record<string, string> = {
    requirement: "Requirement",
    test_case: "Test Case",
    task: "Task",
    user: "User",
  };

  const counts = {
    requirements: requirements.filter((r) => query.length >= 2 && r.title.toLowerCase().includes(query.toLowerCase())).length,
    test_cases: testCases.filter((t) => query.length >= 2 && t.title.toLowerCase().includes(query.toLowerCase())).length,
    tasks: tasks.filter((t) => query.length >= 2 && t.name.toLowerCase().includes(query.toLowerCase())).length,
    users: users.filter((u) => query.length >= 2 && (u.name.toLowerCase().includes(query.toLowerCase()) || u.email.toLowerCase().includes(query.toLowerCase()))).length,
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Search className="w-7 h-7 text-primary" /> Admin Search
        </h1>
        <p className="text-muted-foreground mt-1">Search across all requirements, test cases, tasks, and users</p>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input
          className="pl-12 h-12 text-base"
          placeholder="Search everything..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      {query.length > 0 && query.length < 2 && (
        <p className="text-sm text-muted-foreground text-center">Type at least 2 characters to search</p>
      )}

      {query.length >= 2 && (
        <>
          {results.length === 0 ? (
            <div className="text-center py-12">
              <Search className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground font-medium">No results for "{query}"</p>
              <p className="text-sm text-muted-foreground mt-1">Try different keywords</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{results.length} result{results.length !== 1 ? "s" : ""} for "{query}"</p>
              {results.map((r, i) => (
                <Card key={`${r.type}-${r.id}-${i}`} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className="mt-0.5 p-2 rounded-md bg-muted">{typeIcons[r.type]}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{typeLabels[r.type]}</span>
                        {r.badge && (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${r.badgeColor}`}>{r.badge}</span>
                        )}
                      </div>
                      <p className="font-medium mt-0.5 truncate">{r.title}</p>
                      <div className="flex items-center gap-3 mt-1">
                        {r.subtitle && <span className="text-xs text-muted-foreground">{r.subtitle}</span>}
                        {r.meta && <span className="text-xs text-muted-foreground">· {r.meta}</span>}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">#{r.id}</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {!query && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4">
          <Card className="text-center">
            <CardContent className="p-5">
              <FileText className="w-8 h-8 mx-auto mb-2 text-blue-500" />
              <div className="text-2xl font-bold">{requirements.length}</div>
              <div className="text-xs text-muted-foreground mt-1">Requirements</div>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="p-5">
              <TestTube className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
              <div className="text-2xl font-bold">{testCases.length}</div>
              <div className="text-xs text-muted-foreground mt-1">Test Cases</div>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="p-5">
              <CheckSquare className="w-8 h-8 mx-auto mb-2 text-orange-500" />
              <div className="text-2xl font-bold">{tasks.length}</div>
              <div className="text-xs text-muted-foreground mt-1">Tasks</div>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="p-5">
              <Users className="w-8 h-8 mx-auto mb-2 text-purple-500" />
              <div className="text-2xl font-bold">{users.length}</div>
              <div className="text-xs text-muted-foreground mt-1">Users</div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
