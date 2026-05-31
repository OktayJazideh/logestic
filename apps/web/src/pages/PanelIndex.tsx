import { Navigate } from "react-router-dom";
import { useAuthMe } from "../hooks/useAuthMe";
import PanelHome from "./PanelHome";

/** WF-OPS-DASH-1: OPERATION_ADMIN default landing → ops dashboard. */
export default function PanelIndex() {
  const { me, ready, can } = useAuthMe();
  if (!ready) return null;
  if (me?.role === "OPERATION_ADMIN" && can("ops:*")) {
    return <Navigate to="/panel/ops" replace />;
  }
  if (me?.role === "CONSULTANT" && can("hourly:verify")) {
    return <Navigate to="/panel/consultant/hourly" replace />;
  }
  return <PanelHome />;
}
