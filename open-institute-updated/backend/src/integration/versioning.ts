import type { Request, Response, NextFunction } from "express";

// VBI043 — Integration API Versioning. Every response carries the version
// it was served at; a caller MAY pin a version it expects via
// Accept-Version, and an unsupported pin is rejected loudly (400) rather
// than silently served the wrong contract. Only one version exists today
// (v1) — this exists so a future v2 has somewhere to plug in without every
// existing integration silently breaking the day it ships.
export const SUPPORTED_API_VERSIONS = ["v1"];
export const CURRENT_API_VERSION = "v1";

export function versionNegotiation() {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Integration-Api-Version", CURRENT_API_VERSION);
    const requested = req.header("Accept-Version");
    if (requested && !SUPPORTED_API_VERSIONS.includes(requested)) {
      res.status(400).json({
        message: `Unsupported Accept-Version "${requested}". This deployment supports: ${SUPPORTED_API_VERSIONS.join(", ")}.`,
      });
      return;
    }
    next();
  };
}
