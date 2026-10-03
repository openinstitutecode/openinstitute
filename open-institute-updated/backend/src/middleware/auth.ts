import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { resolveJwtSecret } from "../lib/jwt-secret.js";

export type AuthedRequest = Request & {
  user?: { id: string; role: string; email: string; mustChangePassword?: boolean };
};

// Batch 66 — throws in production when JWT_SECRET is missing or a placeholder (lib/jwt-secret.ts).
const JWT_SECRET = resolveJwtSecret();

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing or malformed Authorization header." });
  }
  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      sub: string;
      role: string;
      email: string;
      mustChangePassword?: boolean;
    };
    req.user = { id: payload.sub, role: payload.role, email: payload.email, mustChangePassword: payload.mustChangePassword };
    if (payload.mustChangePassword && req.path !== "/change-password") {
      return res.status(403).json({ message: "Change your temporary password before continuing.", code: "PASSWORD_CHANGE_REQUIRED" });
    }
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: "Not authenticated." });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "You don't have permission to do that." });
    }
    next();
  };
}

export { JWT_SECRET };
