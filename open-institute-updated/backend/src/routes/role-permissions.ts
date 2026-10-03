import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { hasPermission } from "../lib/permissions.js";

// AD027 — Dynamic role permission management. RolePermission already
// existed in the schema before this batch but had no routes anywhere,
// so the "fine-grained control" the model comments described was dead
// data. This file is the CRUD + the read-only check endpoint other
// features (AI005) call before gating a feature.
export const rolePermissionsRouter = Router();

rolePermissionsRouter.get(
  "/",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const { roleName, resourceType } = req.query;
    const where: Record<string, unknown> = {};
    if (typeof roleName === "string") where.roleName = roleName;
    if (typeof resourceType === "string") where.resourceType = resourceType;
    const overrides = await prisma.rolePermission.findMany({
      where,
      orderBy: [{ roleName: "asc" }, { resourceType: "asc" }, { action: "asc" }],
    });
    res.json(overrides);
  }
);

const upsertSchema = z.object({
  roleName: z.string().min(2),
  resourceType: z.string().min(2),
  action: z.string().min(2),
  isGranted: z.boolean(),
});

// Create or update a single override. Idempotent by design (roleName +
// resourceType + action is the real-world identity of a permission row),
// so re-submitting the same form doesn't create duplicates.
rolePermissionsRouter.post(
  "/",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide roleName, resourceType, action and isGranted." });

    const { roleName, resourceType, action, isGranted } = parsed.data;
    const override = await prisma.rolePermission.upsert({
      where: { roleName_resourceType_action: { roleName, resourceType, action } },
      create: { roleName, resourceType, action, isGranted },
      update: { isGranted },
    });
    res.status(201).json(override);
  }
);

// Remove an override — reverts that role/resource/action back to
// "no restriction configured" (i.e. whatever requireRole already allows).
rolePermissionsRouter.delete(
  "/:id",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    try {
      await prisma.rolePermission.delete({ where: { id: req.params.id } });
      res.json({ success: true });
    } catch {
      res.status(404).json({ message: "Permission override not found." });
    }
  }
);

// Any authenticated user can check whether their OWN role has a
// restriction on a given resource/action — used by the frontend to
// grey out a feature it already knows will 403.
rolePermissionsRouter.get(
  "/check",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const { resourceType, action } = req.query;
    if (typeof resourceType !== "string" || typeof action !== "string") {
      return res.status(400).json({ message: "Provide resourceType and action." });
    }
    const granted = await hasPermission(req.user!.role, resourceType, action);
    res.json({ roleName: req.user!.role, resourceType, action, granted });
  }
);
