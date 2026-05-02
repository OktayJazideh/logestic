import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { PanelLayout } from "./components/PanelShell";
import PanelHome from "./pages/PanelHome";
import CoopRequests from "./pages/CoopRequests";
import EmployerNeed from "./pages/EmployerNeed";
import MissionBoard from "./pages/MissionBoard";
import WeighbridgePage from "./pages/WeighbridgePage";
import WalletSummary from "./pages/WalletSummary";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/panel" replace />} />
      <Route path="/panel" element={<PanelLayout />}>
        <Route index element={<PanelHome />} />
        <Route path="coop" element={<CoopRequests />} />
        <Route path="employer" element={<EmployerNeed />} />
        <Route path="missions" element={<MissionBoard />} />
        <Route path="weighbridge" element={<WeighbridgePage />} />
        <Route path="wallet" element={<WalletSummary />} />
      </Route>
      <Route path="*" element={<Navigate to="/panel" replace />} />
    </Routes>
  );
}
