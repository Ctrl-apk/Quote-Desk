import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadSessionUser } from "@/server/auth-service";
import { AuthError, authorize, isRole, type Permission, type SessionUser } from "@/lib/auth";

/** The signed-in user from the verified session, or null. Role is validated, never assumed. */
export async function currentUser(): Promise<SessionUser | null> {
  const user = (await auth())?.user;
  if (!user?.id || !isRole(user.role)) return null;
  return loadSessionUser(user.id); // role comes from the database, not from the token
}

/**
 * For server actions and API routes: returns the user or throws AuthError (401/403).
 * Every action and route calls this first. Roles are enforced here, not only in the UI.
 */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  return authorize(await currentUser(), permission);
}

/** For pages: sends signed-out users to sign in and users without the permission to /forbidden. */
export async function requirePageUser(permission: Permission): Promise<SessionUser> {
  try {
    return await requirePermission(permission);
  } catch (error) {
    if (error instanceof AuthError) redirect(error.status === 401 ? "/sign-in" : "/forbidden");
    throw error;
  }
}
