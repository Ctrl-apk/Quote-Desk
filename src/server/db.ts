import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/** Builds a Prisma client over the pg driver adapter (Rust-free client, see schema.prisma). */
export function createPrismaClient(connectionString: string | undefined = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// One client per server process; reused across hot reloads in development.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getDb(): PrismaClient {
  globalForPrisma.prisma ??= createPrismaClient();
  return globalForPrisma.prisma;
}
