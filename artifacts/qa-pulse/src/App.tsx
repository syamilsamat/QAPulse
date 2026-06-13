import {
  Switch,
  Route,
  Router as WouterRouter,
  Redirect,
} from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { Loader2 } from "lucide-react";

import Login from "@/pages/Login";
import Main2 from "@/pages/Main2";
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
import PmoReport from "@/pages/PmoReport";
import AiFeatures from "@/pages/AiFeatures";
import ReportDashboard from "@/pages/ReportDashboard";
import TestExecutionDetails from "@/pages/TestExecutionDetail";
import TestCasesExecution from "@/pages/TestCasesExecution";
import TestCasesExecutionProgressPage from "@/pages/TestCasesExecutionProgressPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({
  component: Component,
  roles,
}: {
  component: React.ComponentType;
  roles?: string[];
}) {
  const { user, isLoading } = useAuth();

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

  if (roles && !roles.includes(user.role)) {
    if (user.role === "pmo") {
      return <Redirect to="/pmo-report" />;
    }
    return <Redirect to="/dashboard" />;
  }

  if (user.role === "pmo") {
    return <PmoReport />;
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
      {/* NEW LANDING PAGE ROUTE 
        If logged in, go to the app. If logged out, show Main2 landing page!
      */}
      <Route path="/">
        {user ? (
          user.role === "pmo" ? (
            <Redirect to="/pmo-report" />
          ) : (
            <Redirect to="/dashboard" />
          )
        ) : (
          <Main2 />
        )}
      </Route>

      <Route path="/login">
        {user ? (
          user.role === "pmo" ? (
            <Redirect to="/pmo-report" />
          ) : (
            <Redirect to="/dashboard" />
          )
        ) : (
          <Login />
        )}
      </Route>

      <Route path="/dashboard">
        <ProtectedRoute
          component={Dashboard}
          roles={["qa_member", "qa_lead", "admin"]}
        />
      </Route>

      <Route path="/requirements">
        <ProtectedRoute
          component={Requirements}
          roles={["qa_member", "qa_lead", "admin"]}
        />
      </Route>

      <Route path="/test-cases/execution-details">
        <ProtectedRoute
          component={TestExecutionDetails}
          roles={["qa_member", "qa_lead", "admin"]}
        />
      </Route>

      <Route path="/test-cases/execution">
        <ProtectedRoute
          component={TestCasesExecution}
          roles={["qa_member", "qa_lead", "admin"]}
        />
      </Route>

      <Route path="/test-cases/execution/:id">
        <ProtectedRoute
          component={TestCasesExecutionProgressPage}
          roles={["qa_member", "qa_lead", "admin"]}
        />
      </Route>

      <Route path="/test-cases">
        <ProtectedRoute
          component={TestCases}
          roles={["qa_member", "qa_lead", "admin"]}
        />
      </Route>

      <Route path="/tasks">
        <ProtectedRoute
          component={Tasks}
          roles={["qa_member", "qa_lead", "admin"]}
        />
      </Route>

      <Route path="/history-trail">
        <ProtectedRoute
          component={HistoryTrail}
          roles={["qa_member", "qa_lead", "admin"]}
        />
      </Route>

      <Route path="/team">
        <ProtectedRoute component={Team} roles={["qa_lead", "admin"]} />
      </Route>

      <Route path="/admin/search">
        <ProtectedRoute component={AdminSearch} roles={["admin"]} />
      </Route>

      <Route path="/settings">
        <ProtectedRoute
          component={Settings}
          roles={["qa_member", "qa_lead", "admin"]}
        />
      </Route>

      <Route path="/inbox">
        <ProtectedRoute
          component={Inbox}
          roles={["qa_member", "qa_lead", "admin"]}
        />
      </Route>

      <Route path="/team-hangouts">
        <ProtectedRoute
          component={TeamHangouts}
          roles={["qa_member", "qa_lead", "admin"]}
        />
      </Route>

      <Route path="/ai-features">
        <ProtectedRoute
          component={AiFeatures}
          roles={["qa_member", "qa_lead", "admin"]}
        />
      </Route>

      <Route path="/report">
        <ProtectedRoute
          component={ReportDashboard}
          roles={["qa_member", "qa_lead", "admin"]}
        />
      </Route>

      <Route path="/pmo-report">
        {!user ? (
          <Redirect to="/login" />
        ) : user.role === "pmo" ? (
          <PmoReport />
        ) : (
          <Layout>
            <PmoReport />
          </Layout>
        )}
      </Route>

      <Route>
        {user ? (
          user.role === "pmo" ? (
            <PmoReport />
          ) : (
            <Layout>
              <NotFound />
            </Layout>
          )
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