import { Navigate, Outlet } from "react-router-dom";

// Minimal client-side gate — the real authorization boundary is the backend's
// requireAuth/requireRole middleware. This just avoids flashing a portal to a
// signed-out visitor before the API call fails.
export default function RequireToken() {
  const token = localStorage.getItem("kvbdtc_token");
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}
