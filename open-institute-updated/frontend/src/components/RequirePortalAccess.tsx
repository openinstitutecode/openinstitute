import { Navigate, Outlet, useLocation } from "react-router-dom";
import { canAccessPath, portalHomeForRole } from "../lib/role-access";
import { getRole } from "../lib/api";

export default function RequirePortalAccess() {
  const location = useLocation();
  const role = getRole();
  if (!role) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!canAccessPath(role, location.pathname)) {
    return <Navigate to={portalHomeForRole(role)} replace />;
  }
  return <Outlet />;
}
