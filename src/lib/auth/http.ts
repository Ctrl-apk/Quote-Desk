import { AuthError } from "./authorize";

/** Turns an AuthError into a JSON 401/403 response for API routes; returns null for other errors. */
export function authErrorToResponse(error: unknown): Response | null {
  if (!(error instanceof AuthError)) return null;
  return Response.json({ error: error.message }, { status: error.status });
}
