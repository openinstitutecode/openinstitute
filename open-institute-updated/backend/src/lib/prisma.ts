import { PrismaClient } from "@prisma/client";
import { withPoolParams } from "./prisma-url.js";

// KPERF-012 — bound the connection pool per instance. Prisma's default is (cpus*2+1) which, times N
// API instances, can exceed Postgres max_connections. DB_POOL_SIZE / DB_POOL_TIMEOUT_S are applied only
// when the DATABASE_URL does not already set connection_limit / pool_timeout explicitly.
// Reused across hot reloads in dev to avoid exhausting DB connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const pooledUrl = withPoolParams(process.env.DATABASE_URL);
export const prisma =
  globalForPrisma.prisma ?? new PrismaClient(pooledUrl && pooledUrl !== process.env.DATABASE_URL ? { datasources: { db: { url: pooledUrl } } } : undefined);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
