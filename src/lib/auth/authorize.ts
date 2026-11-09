import { can, isRole, type Permission, type Role } from "./permissions";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/** 401 = not signed in, 403 = signed in but not allowed. */
export class AuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * The server-side gate. Every server action and API route passes the current user
 * (or null) and the permission it needs, and gets the user back or an AuthError.
 * Unknown roles are denied, so a corrupted session can never gain access.
 */
export function authorize(user: SessionUser | null | undefined, permission: Permission): SessionUser {
  if (!user) throw new AuthError(401, "Sign in to continue");
  if (!isRole(user.role) || !can(user.role, permission)) {
    throw new AuthError(403, "You do not have permission to do this");
  }
  return user;
}
