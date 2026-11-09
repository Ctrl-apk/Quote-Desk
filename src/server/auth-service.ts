import {
  SIGN_IN_LIMIT, createRateLimiter, signInSchema, verifyPassword, type SessionUser,
} from "@/lib/auth";
import { findUserByEmail, findUserById } from "@/server/repositories/users";

const limiter = createRateLimiter(SIGN_IN_LIMIT);

export type SignInResult =
  | { ok: true; user: SessionUser }
  | { ok: false; reason: "invalid" | "rate_limited"; retryAfterMinutes?: number };

/**
 * Checks credentials. Wrong email and wrong password give the same answer, an unknown
 * email still costs a full password hash, and repeated failures are throttled per email.
 * Never logs the password.
 */
export async function signInWithPassword(raw: unknown): Promise<SignInResult> {
  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { email, password } = parsed.data;

  const status = limiter.check(email);
  if (!status.allowed) {
    return { ok: false, reason: "rate_limited", retryAfterMinutes: Math.max(1, Math.ceil(status.retryAfterMs / 60000)) };
  }

  const user = await findUserByEmail(email);
  const valid = await verifyPassword(password, user?.passwordHash ?? null);
  if (!user || !valid) {
    limiter.recordFailure(email);
    return { ok: false, reason: "invalid" };
  }

  limiter.reset(email);
  return { ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
}

/**
 * The session token only says who signed in. The role and the right to be here are read from the
 * database on every request, so a token cannot carry a role the database does not give that user.
 */
export async function loadSessionUser(tokenUserId: string | undefined | null): Promise<SessionUser | null> {
  if (!tokenUserId) return null;
  const user = await findUserById(tokenUserId);
  return user ? { id: user.id, email: user.email, name: user.name, role: user.role } : null;
}
