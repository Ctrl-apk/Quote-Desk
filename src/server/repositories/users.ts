import type { Role } from "@/lib/auth";
import { getDb } from "@/server/db";

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
}

/** The only place sign-in reads users from the database. */
export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  return getDb().user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, role: true, passwordHash: true },
  });
}

/** Used on every request after sign-in, so a role change or a removed user takes effect immediately. */
export async function findUserById(id: string): Promise<Omit<UserRecord, "passwordHash"> | null> {
  return getDb().user.findUnique({ where: { id }, select: { id: true, email: true, name: true, role: true } });
}
