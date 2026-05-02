import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import ComingSoon from "./pages/ComingSoon";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/coming-soon" replace />} />
      <Route path="/coming-soon" element={<ComingSoon />} />
      <Route path="*" element={<ComingSoon />} />
    </Routes>
  );
}

