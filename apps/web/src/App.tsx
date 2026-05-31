import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { RequirePermission } from "./components/RequirePermission";
import { PanelLayout } from "./components/PanelShell";
import LoginPage from "./pages/LoginPage";
import WorkspaceSelectPage from "./pages/WorkspaceSelectPage";
import PanelIndex from "./pages/PanelIndex";
import OpsDashboard from "./pages/OpsDashboard";
import CoopRequests from "./pages/CoopRequests";
import EmployerNeed from "./pages/EmployerNeed";
import EmployerInbox from "./pages/EmployerInbox";
import MissionBoard from "./pages/MissionBoard";
import WeighbridgePage from "./pages/WeighbridgePage";
import WalletSummary from "./pages/WalletSummary";
import SettlementPage from "./pages/SettlementPage";
import MembersTransparencyPage from "./pages/MembersTransparencyPage";
import KycInbox from "./pages/KycInbox";
import PaymentControlPage from "./pages/PaymentControlPage";
import ConsultantHourlyInbox from "./pages/ConsultantHourlyInbox";
import AdminUsers from "./pages/AdminUsers";
import RateCards from "./pages/RateCards";
import RuleEnginePage from "./pages/RuleEngine";
import JobsMonitor from "./pages/JobsMonitor";
import ReconciliationPage from "./pages/ReconciliationPage";
import AuditViewer from "./pages/AuditViewer";
import AdminFinance from "./pages/AdminFinance";
import FinanceByLoadPage from "./pages/FinanceByLoadPage";
import AdminKpi from "./pages/AdminKpi";
import PeriodStatementPage from "./pages/PeriodStatementPage";
import ApprovalsInbox from "./pages/ApprovalsInbox";
import FleetOwnerDashboard from "./pages/FleetOwnerDashboard";
import DispatchBoard from "./pages/DispatchBoard";

function G({
  permission,
  permissions,
  children,
}: {
  permission?: string;
  permissions?: string[];
  children: React.ReactNode;
}) {
  return (
    <RequirePermission permission={permission} permissions={permissions}>
      {children}
    </RequirePermission>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/panel" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/workspace-select" element={<WorkspaceSelectPage />} />
      <Route path="/panel" element={<PanelLayout />}>
        <Route index element={<PanelIndex />} />
        <Route
          path="ops"
          element={
            <G permissions={["ops:*", "users:manage"]}>
              <OpsDashboard />
            </G>
          }
        />
        <Route
          path="coop"
          element={
            <G permission="coop:manage">
              <CoopRequests />
            </G>
          }
        />
        <Route
          path="employer"
          element={
            <G permission="needs:create">
              <EmployerNeed />
            </G>
          }
        />
        <Route
          path="employer/inbox"
          element={
            <G permissions={["needs:read_own", "ops:*", "users:manage"]}>
              <EmployerInbox />
            </G>
          }
        />
        <Route
          path="dispatch-board"
          element={
            <G permission="dispatch:create">
              <DispatchBoard />
            </G>
          }
        />
        <Route
          path="missions"
          element={
            <G permissions={["dispatch:create", "members:read"]}>
              <MissionBoard />
            </G>
          }
        />
        <Route
          path="missions/:missionId"
          element={
            <G permissions={["dispatch:create", "members:read"]}>
              <MissionBoard />
            </G>
          }
        />
        <Route
          path="rate-cards"
          element={
            <G permissions={["coop:manage", "settlement:execute"]}>
              <RateCards />
            </G>
          }
        />
        <Route
          path="admin/rules"
          element={
            <G permission="users:manage">
              <RuleEnginePage />
            </G>
          }
        />
        <Route
          path="weighbridge"
          element={
            <G permission="weighbridge:submit">
              <WeighbridgePage />
            </G>
          }
        />
        <Route
          path="payments"
          element={
            <G permissions={["hold:create", "hourly:verify"]}>
              <PaymentControlPage />
            </G>
          }
        />
        <Route
          path="consultant/hourly"
          element={
            <G permissions={["hourly:verify", "audit:read"]}>
              <ConsultantHourlyInbox />
            </G>
          }
        />
        <Route path="hourly" element={<Navigate to="/panel/consultant/hourly" replace />} />
        <Route
          path="settlement"
          element={
            <G permission="settlement:read">
              <SettlementPage />
            </G>
          }
        />
        <Route
          path="members"
          element={
            <G permission="members:read">
              <MembersTransparencyPage />
            </G>
          }
        />
        <Route
          path="approvals"
          element={
            <G permissions={["coop:manage", "settlement:approve"]}>
              <ApprovalsInbox />
            </G>
          }
        />
        <Route
          path="kyc"
          element={
            <G permissions={["kyc:approve", "kyc:review"]}>
              <KycInbox />
            </G>
          }
        />
        <Route
          path="wallet"
          element={
            <G permission="wallet:read_own">
              <WalletSummary />
            </G>
          }
        />
        <Route
          path="fleet-owner"
          element={
            <G permissions={["wallet:read_own", "vehicles:read_own"]}>
              <FleetOwnerDashboard />
            </G>
          }
        />
        <Route
          path="admin/users"
          element={
            <G permission="users:manage">
              <AdminUsers />
            </G>
          }
        />
        <Route
          path="admin/jobs"
          element={
            <G permissions={["settlement:execute", "ops:*"]}>
              <JobsMonitor />
            </G>
          }
        />
        <Route
          path="admin/reconciliation"
          element={
            <G permission="users:manage">
              <ReconciliationPage />
            </G>
          }
        />
        <Route
          path="admin/audit"
          element={
            <G permission="audit:read">
              <AuditViewer />
            </G>
          }
        />
        <Route
          path="admin/finance"
          element={
            <G permission="users:manage">
              <AdminFinance />
            </G>
          }
        />
        <Route
          path="admin/finance/by-load"
          element={
            <G permission="users:manage">
              <FinanceByLoadPage />
            </G>
          }
        />
        <Route
          path="admin/period-statement"
          element={
            <G permissions={["users:manage", "settlement:read", "coop:manage"]}>
              <PeriodStatementPage />
            </G>
          }
        />
        <Route
          path="admin/kpi"
          element={
            <G permissions={["settlement:execute", "ops:*"]}>
              <AdminKpi />
            </G>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/panel" replace />} />
    </Routes>
  );
}
