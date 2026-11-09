import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/lib/auth";

const findUserByEmail = vi.fn();
vi.mock("@/server/repositories/users", () => ({ findUserByEmail: (email: string) => findUserByEmail(email) }));

let signInWithPassword: typeof import("@/server/auth-service").signInWithPassword;
let passwordHash: string;
beforeEach(async () => {
  // Fresh module per test: the rate limiter keeps state in memory, and tests must not share it.
  vi.resetModules();
  ({ signInWithPassword } = await import("@/server/auth-service"));
  passwordHash ??= await hashPassword("Estimator#2611", 4);
  findUserByEmail.mockReset();
  findUserByEmail.mockImplementation(async (email: string) =>
    email === "estimator@quotedesk.example"
      ? { id: "u1", email, name: "Asha Estimator", role: "estimator", passwordHash }
      : null,
  );
});

describe("signInWithPassword", () => {
  it("signs in with the right credentials and returns the role, never the hash", async () => {
    const r = await signInWithPassword({ email: " Estimator@QuoteDesk.example ", password: "Estimator#2611" });
    expect(r).toEqual({ ok: true, user: { id: "u1", email: "estimator@quotedesk.example", name: "Asha Estimator", role: "estimator" } });
    expect(JSON.stringify(r)).not.toContain("passwordHash");
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const wrongPassword = await signInWithPassword({ email: "estimator@quotedesk.example", password: "nope" });
    const unknownEmail = await signInWithPassword({ email: "nobody@quotedesk.example", password: "Estimator#2611" });
    expect(wrongPassword).toEqual({ ok: false, reason: "invalid" });
    expect(unknownEmail).toEqual(wrongPassword);
  });

  it.each([null, undefined, {}, { email: "x" }, { email: "estimator@quotedesk.example" }, { email: 1, password: 2 }])(
    "rejects malformed input %j without touching the database",
    async (input) => {
      expect(await signInWithPassword(input)).toEqual({ ok: false, reason: "invalid" });
      expect(findUserByEmail).not.toHaveBeenCalled();
    },
  );

  it("throttles after 5 failures, even for the right password, and says how long to wait", async () => {
    const email = "throttle@quotedesk.example";
    for (let i = 0; i < 5; i++) expect(await signInWithPassword({ email, password: "bad" })).toEqual({ ok: false, reason: "invalid" });
    const blocked = await signInWithPassword({ email, password: "bad" });
    expect(blocked).toMatchObject({ ok: false, reason: "rate_limited" });
    expect((blocked as { retryAfterMinutes: number }).retryAfterMinutes).toBeGreaterThanOrEqual(1);
  });

  it("a successful sign-in clears earlier failures", async () => {
    const email = "estimator@quotedesk.example";
    for (let i = 0; i < 4; i++) await signInWithPassword({ email, password: "bad" });
    expect((await signInWithPassword({ email, password: "Estimator#2611" })).ok).toBe(true);
    for (let i = 0; i < 4; i++) expect(await signInWithPassword({ email, password: "bad" })).toEqual({ ok: false, reason: "invalid" });
  });
});
