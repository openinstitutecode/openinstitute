import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { pagedWindow } from "../lib/batch73.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

export const auditRouter = Router();

auditRouter.get(
  "/",
  requireAuth,
  requireRole("ICT_ADMIN", "SUPER_ADMIN", "AUDITOR", "REGULATORY_INSPECTOR"),
  async (req: AuthedRequest, res) => {
    const entityType = typeof req.query.entityType === "string" ? req.query.entityType : undefined;
    const win = pagedWindow(req.query, 200);
    const logs = await prisma.auditLog.findMany({
      where: entityType ? { entityType } : undefined,
      include: { user: { select: { email: true, role: true } } },
      orderBy: { createdAt: "desc" },
      skip: win.skip, take: win.take,
    });
    if (win.paged) res.setHeader("X-Total-Count", String(await prisma.auditLog.count({ where: entityType ? { entityType } : undefined })));
    res.json(logs);
  }
);
