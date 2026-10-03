import { prisma } from "./prisma.js";

// AD027 — Dynamic role-based permissions on top of the fixed Role enum.
// RolePermission rows are restrictions, not grants: the base Role enum
// (via requireRole) already decides what a role can do by default, so the
// absence of a row means "no override configured" and this resolves to
// allowed. A row with isGranted=false is how SUPER_ADMIN narrows a role's
// access to a specific resource/action without touching code or the enum.
//
// resourceType/action are free-form strings (e.g. "AI"/"USE_TUTOR",
// "FINANCE"/"APPROVE") so new call sites can introduce their own pairs
// without a schema change — AI005 is the first consumer (see ai.ts).
export async function hasPermission(roleName: string, resourceType: string, action: string): Promise<boolean> {
  const override = await prisma.rolePermission.findUnique({
    where: { roleName_resourceType_action: { roleName, resourceType, action } },
  });
  if (!override) return true; // no explicit restriction configured — default allow
  return override.isGranted;
}
