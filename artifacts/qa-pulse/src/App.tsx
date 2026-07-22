import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { getApiUrl } from "@/lib/api";
import { Loader2 } from "lucide-react";

import Login from "@/pages/Login";
import QMPulseLanding from "@/pages/QMPulseLanding";
import Dashboard from "@/pages/Dashboard";
import Requirements from "@/pages/Requirements";
import TestCases from "@/pages/TestCases";
import Tasks from "@/pages/Tasks";
import HistoryTrail from "@/pages/HistoryTrail";
import Team from "@/pages/Team";
import AdminSearch from "@/pages/AdminSearch";
import Settings from "@/pages/Settings";
import Inbox from "@/pages/Inbox";
import TeamHangouts from "@/pages/TeamHangouts";
import NotFound from "@/pages/not-found";
import VerdictReport from "@/pages/VerdictReport";
import AiFeatures from "@/pages/AiFeatures";
import ReportDashboard from "@/pages/ReportDashboard";
import TestExecutionDetails from "@/pages/TestExecutionDetail";
import TestCasesExecution from "@/pages/TestCasesExecution";
import TestCasesExecutionProgressPage from "@/pages/TestCasesExecutionProgressPage";
import ModuleAndProject from "@/pages/ModuleAndProject";
import Roles from "@/pages/Roles";
import TraceabilityMatrix from "@/pages/TraceabilityMatrix";
import AuditLog from "@/pages/AuditLog";
import Defects from "@/pages/Defects";
import Teams from "@/pages/Teams";
import RequirementDetail from "@/pages/RequirementDetail";
import Milestones from "@/pages/Milestones";
import PmDashboard from "@/pages/PmDashboard";
import RiskRegister from "@/pages/RiskRegister";
import UatSignoffs from "@/pages/UatSignoffs";
import Resources from "@/pages/Resources";
import QAAnalytics from "@/pages/QAAnalytics";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// CR048 — a route's access is decided by the same nav-permission key the
// sidebar uses (`/my-nav-permissions`, backend role_nav_permissions), so a
// visible nav item can never point at a route that then bounces the user.
// The static `roles` array is only a fallback for when that fetch fails or a
// route has no permKey (admin-only pages). `permKey` present + perms loaded
// is authoritative.
function ProtectedRoute({
  component: Component,
  roles,
  permKey,
}: {
  component: React.ComponentType;
  roles?: string[];
  permKey?: string;
}) {
  const { user, isLoading, token } = useAuth();

  const { data: navPermissions, isLoading: permsLoading } = useQuery<string[] | null>({
    queryKey: ["my-nav-permissions"],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/my-nav-permissions`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!user && !!permKey,
  });

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  const denied = (): boolean => {
    if (user.role === "admin") return false;
    if (permKey) {
      // Wait for permissions rather than flash-redirect a user who's allowed.
      if (navPermissions === undefined) return false;
      if (navPermissions) return !navPermissions.includes(permKey);
      // fetch failed → fall through to the static role fallback
    }
    return roles ? !roles.includes(user.role) : false;
  };

  // Block render until permissions resolve for permKey-gated routes.
  if (permKey && user.role !== "admin" && navPermissions === undefined && permsLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (denied()) {
    return <Redirect to="/dashboard" />;
  }

  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Switch>
      {/* QMPulse 3D landing page (previous landing: @/pages/Main2)
        If logged in, go to the app. If logged out, show the landing page.
      */}
      <Route path="/">
        {user ? <Redirect to="/dashboard" /> : <QMPulseLanding />}
      </Route>

      <Route path="/login">
        {user ? <Redirect to="/dashboard" /> : <Login />}
      </Route>

      {/* CR048 — Dashboard is the universal fallback landing (sidebar marks it
        alwaysVisible), so every authenticated role must be able to reach it.
        Previously gated to QA roles, which made the ProtectedRoute fallback
        redirect (→ /dashboard) a self-blocking blank screen for everyone else. */}
      <Route path="/dashboard">
        <ProtectedRoute component={Dashboard} />
      </Route>

      <Route path="/requirements">
        <ProtectedRoute
          component={Requirements}
          permKey="nav:requirements"
          roles={["admin", "cto", "hod_qa", "hod_pm", "hod_fa", "hod_dev", "qa_manager", "qa_lead", "qa_member", "fa_lead", "fa_member", "dev_lead", "dev_member", "pm_lead"]}
        />
      </Route>

      <Route path="/requirements/:id">
        <ProtectedRoute
          component={RequirementDetail}
          permKey="nav:requirements"
          roles={["admin", "cto", "hod_qa", "hod_pm", "hod_fa", "hod_dev", "qa_manager", "qa_lead", "qa_member", "fa_lead", "fa_member", "dev_lead", "dev_member", "pm_lead"]}
        />
      </Route>

      <Route path="/milestones">
        <ProtectedRoute
          component={Milestones}
          permKey="nav:milestones"
          roles={["admin", "cto", "hod_qa", "hod_pm", "hod_fa", "qa_manager", "qa_lead", "qa_member", "fa_lead", "fa_member", "pm_lead", "pm_member"]}
        />
      </Route>

      <Route path="/pm-dashboard">
        <ProtectedRoute
          component={PmDashboard}
          permKey="nav:pm-dashboard"
          roles={["hod_pm", "pm_lead", "admin", "cto", "pm_member"]}
        />
      </Route>

      <Route path="/risk-register">
        <ProtectedRoute
          component={RiskRegister}
          permKey="nav:risk-register"
          roles={["hod_pm", "pm_lead", "qa_lead", "fa_lead", "admin", "cto", "pm_member"]}
        />
      </Route>

      <Route path="/uat-signoffs">
        <ProtectedRoute
          component={UatSignoffs}
          permKey="nav:uat-signoffs"
          roles={["hod_pm", "pm_lead", "pm_member", "qa_manager", "hod_qa", "qa_lead", "admin", "cto"]}
        />
      </Route>

      <Route path="/resources">
        <ProtectedRoute
          component={Resources}
          permKey="nav:resources"
          roles={["qa_lead", "qa_manager", "hod_qa", "fa_lead", "hod_fa", "dev_lead", "hod_dev", "pm_lead", "hod_pm", "admin", "cto"]}
        />
      </Route>

      <Route path="/traceability">
        <ProtectedRoute
          component={TraceabilityMatrix}
          permKey="nav:traceability"
          roles={["admin", "cto", "hod_qa", "hod_pm", "hod_fa", "hod_dev", "qa_manager", "qa_lead", "qa_member", "fa_lead", "fa_member", "pm_lead"]}
        />
      </Route>

      <Route path="/qa-analytics">
        <ProtectedRoute
          component={QAAnalytics}
          permKey="nav:qa-analytics"
          roles={["qa_lead", "qa_manager", "hod_qa", "admin", "cto"]}
        />
      </Route>

      {/* Added Configurations Route */}
      <Route path="/configurations">
        <ProtectedRoute
          component={ModuleAndProject}
          permKey="nav:configurations"
          roles={["admin", "cto", "hod_qa", "hod_pm", "hod_fa", "qa_manager", "qa_lead", "pm_lead"]}
        />
      </Route>

      <Route path="/roles">
        <ProtectedRoute component={Roles} roles={["admin"]} />
      </Route>

      <Route path="/teams">
        <ProtectedRoute component={Teams} roles={["admin"]} />
      </Route>

      <Route path="/audit-log">
        <ProtectedRoute component={AuditLog} permKey="nav:audit-log" roles={["admin", "cto"]} />
      </Route>

      <Route path="/defects">
        {/* CR042 — synced with Layout.tsx's nav roles: this list had never been
          updated since CR030 opened Defects to dev/qa_manager/hod_qa/cto, so
          those roles saw the sidebar link but got redirected on click. */}
        <ProtectedRoute
          component={Defects}
          permKey="nav:defects"
          roles={["qa_member", "qa_lead", "qa_manager", "hod_qa", "dev_member", "dev_lead", "hod_dev", "fa_lead", "fa_member", "admin", "cto"]}
        />
      </Route>

      <Route path="/test-cases/execution-details/:ticketId">
        <ProtectedRoute
          component={TestExecutionDetails}
          permKey="nav:test-cases"
          roles={["admin", "cto", "hod_qa", "hod_pm", "hod_fa", "hod_dev", "qa_manager", "qa_lead", "qa_member", "fa_lead", "fa_member", "dev_lead", "dev_member", "pm_lead"]}
        />
      </Route>

      <Route path="/test-cases/execution-details">
        <ProtectedRoute
          component={TestExecutionDetails}
          permKey="nav:test-cases"
          roles={["admin", "cto", "hod_qa", "hod_pm", "hod_fa", "hod_dev", "qa_manager", "qa_lead", "qa_member", "fa_lead", "fa_member", "dev_lead", "dev_member", "pm_lead"]}
        />
      </Route>

      <Route path="/test-cases/execution">
        <ProtectedRoute
          component={TestCasesExecution}
          permKey="nav:test-cases"
          roles={["admin", "cto", "hod_qa", "hod_pm", "hod_fa", "hod_dev", "qa_manager", "qa_lead", "qa_member", "fa_lead", "fa_member", "dev_lead", "dev_member", "pm_lead"]}
        />
      </Route>

      <Route path="/test-cases/execution/:id">
        <ProtectedRoute
          component={TestCasesExecutionProgressPage}
          permKey="nav:test-cases"
          roles={["admin", "cto", "hod_qa", "hod_pm", "hod_fa", "hod_dev", "qa_manager", "qa_lead", "qa_member", "fa_lead", "fa_member", "dev_lead", "dev_member", "pm_lead"]}
        />
      </Route>

      <Route path="/test-cases">
        <ProtectedRoute
          component={TestCases}
          permKey="nav:test-cases"
          roles={["admin", "cto", "hod_qa", "hod_pm", "hod_fa", "hod_dev", "qa_manager", "qa_lead", "qa_member", "fa_lead", "fa_member", "dev_lead", "dev_member", "pm_lead"]}
        />
      </Route>

      <Route path="/tasks">
        <ProtectedRoute
          component={Tasks}
          permKey="nav:tasks"
          roles={["admin", "cto", "hod_qa", "hod_pm", "hod_fa", "qa_manager", "qa_lead", "qa_member", "fa_lead", "pm_lead"]}
        />
      </Route>

      <Route path="/history-trail">
        <ProtectedRoute
          component={HistoryTrail}
          permKey="nav:tasks"
          roles={["admin", "cto", "hod_qa", "hod_pm", "hod_fa", "qa_manager", "qa_lead", "qa_member", "fa_lead", "pm_lead"]}
        />
      </Route>

      <Route path="/team">
        <ProtectedRoute
          component={Team}
          permKey="nav:team"
          roles={["admin", "cto", "hod_qa", "hod_pm", "hod_fa", "hod_dev", "qa_manager", "qa_lead", "fa_lead", "dev_lead", "pm_lead"]}
        />
      </Route>

      <Route path="/admin/search">
        <ProtectedRoute component={AdminSearch} permKey="nav:admin-search" roles={["admin", "cto"]} />
      </Route>

      {/* Account/Settings — alwaysVisible in the sidebar, reachable by all. */}
      <Route path="/settings">
        <ProtectedRoute component={Settings} />
      </Route>

      <Route path="/inbox">
        <ProtectedRoute
          component={Inbox}
          permKey="nav:inbox"
          roles={["admin", "cto", "hod_qa", "hod_pm", "hod_fa", "hod_dev", "qa_manager", "qa_lead", "qa_member", "fa_lead", "fa_member", "dev_lead", "pm_lead"]}
        />
      </Route>

      <Route path="/team-hangouts">
        <ProtectedRoute
          component={TeamHangouts}
          permKey="nav:team-hangouts"
          roles={["admin", "cto", "hod_qa", "hod_pm", "hod_fa", "hod_dev", "qa_manager", "qa_lead", "qa_member", "fa_lead", "fa_member", "dev_lead", "dev_member", "pm_lead"]}
        />
      </Route>

      <Route path="/ai-features">
        <ProtectedRoute
          component={AiFeatures}
          permKey="nav:ai-hub"
          roles={["admin", "cto", "hod_qa", "hod_fa", "qa_manager", "qa_lead", "qa_member", "fa_lead"]}
        />
      </Route>

      <Route path="/report">
        <ProtectedRoute
          component={ReportDashboard}
          permKey="nav:report"
          roles={["admin", "cto", "hod_qa", "hod_pm", "hod_fa", "hod_dev", "qa_manager", "qa_lead", "qa_member", "fa_lead", "fa_member", "dev_lead", "dev_member", "pm_lead", "pm_member"]}
        />
      </Route>

      <Route path="/verdict-report">
        {!user ? (
          <Redirect to="/login" />
        ) : (
          <Layout>
            <VerdictReport />
          </Layout>
        )}
      </Route>

      <Route>
        {user ? (
          <Layout>
            <NotFound />
          </Layout>
        ) : (
          <NotFound />
        )}
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
