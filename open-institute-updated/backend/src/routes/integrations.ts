import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { federatedLibrarySearch } from "../lib/repositories/federated.js";

// AD031 — Integration Centre. Per-integration status pages already existed
// (library's /library/repository-status, KUCCPS's own batch history) but
// there was no single view an ICT admin could check for "what's connected,
// what last ran, is anything failing" across the institution. This endpoint
// aggregates those real, existing sources — it introduces no new external
// connectors of its own, just a unified read of what's already there.
export const integrationsRouter = Router();

integrationsRouter.get(
  "/status",
  requireAuth,
  requireRole("ICT_ADMIN", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const [libraryStatuses, lastKuccpsExport, lastKuccpsImport, lastDataImport, dataImportCount] = await Promise.all([
      federatedLibrarySearch("").then((r) => r.statuses),
      prisma.kuccpsExportBatch.findFirst({ orderBy: { createdAt: "desc" } }),
      prisma.kuccpsImportBatch.findFirst({ orderBy: { createdAt: "desc" } }),
      prisma.dataImportSession.findFirst({ orderBy: { createdAt: "desc" } }),
      prisma.dataImportSession.count(),
    ]);

    // Configuration presence only — never expose the secret values
    // themselves, just whether the institution has set them.
    const mpesaConfigured = Boolean(
      process.env.DARAJA_CONSUMER_KEY && process.env.DARAJA_CONSUMER_SECRET && process.env.DARAJA_SHORTCODE
    );
    const aiConfigured = Boolean(process.env.ANTHROPIC_API_KEY);

    res.json({
      digitalLibrary: {
        configuredRepositories: libraryStatuses.filter((s) => s.configured).length,
        totalRepositories: libraryStatuses.length,
        repositories: libraryStatuses,
      },
      kuccps: {
        lastExport: lastKuccpsExport
          ? { at: lastKuccpsExport.createdAt, recordCount: lastKuccpsExport.recordCount, status: lastKuccpsExport.status }
          : null,
        lastImport: lastKuccpsImport
          ? { at: lastKuccpsImport.createdAt, recordCount: lastKuccpsImport.recordCount, matchedCount: lastKuccpsImport.matchedCount }
          : null,
      },
      bulkDataTools: {
        totalImportSessions: dataImportCount,
        lastImport: lastDataImport
          ? { at: lastDataImport.createdAt, type: lastDataImport.importType, status: lastDataImport.status, successRows: lastDataImport.successRows, errorRows: lastDataImport.errorRows }
          : null,
      },
      payments: { mpesaConfigured },
      ai: { anthropicApiConfigured: aiConfigured },
    });
  }
);
