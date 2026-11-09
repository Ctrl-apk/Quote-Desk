import { describe, expect, it } from "vitest";
import { AuthError, authErrorToResponse, safeCallbackUrl } from "@/lib/auth";

describe("safeCallbackUrl", () => {
  it("keeps same-site paths, including query strings", () => {
    expect(safeCallbackUrl("/rfqs")).toBe("/rfqs");
    expect(safeCallbackUrl("/rfqs/abc/parts/1?tab=routing")).toBe("/rfqs/abc/parts/1?tab=routing");
  });
  it.each([
    ["absolute URL", "https://evil.example/phish"],
    ["protocol-relative", "//evil.example"],
    ["backslash trick", "/\\evil.example"],
    ["no leading slash", "rfqs"],
    ["javascript scheme", "javascript:alert(1)"],
    ["control character", "/rfqs\n//evil.example"],
    ["empty", ""],
  ])("falls back for %s", (_name, value) => {
    expect(safeCallbackUrl(value)).toBe("/rfqs");
  });
  it("falls back for null and undefined, and honours a custom fallback", () => {
    expect(safeCallbackUrl(null)).toBe("/rfqs");
    expect(safeCallbackUrl(undefined, "/home")).toBe("/home");
  });
});

describe("authErrorToResponse", () => {
  it("maps 401 and 403 to JSON responses with that status", async () => {
    const r401 = authErrorToResponse(new AuthError(401, "Sign in to continue"))!;
    const r403 = authErrorToResponse(new AuthError(403, "No"))!;
    expect([r401.status, r403.status]).toEqual([401, 403]);
    expect(await r401.json()).toEqual({ error: "Sign in to continue" });
  });
  it("returns null for other errors so they are not swallowed", () => {
    expect(authErrorToResponse(new Error("boom"))).toBeNull();
  });
});
