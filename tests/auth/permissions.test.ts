import { describe, expect, it } from "vitest";
import { AuthError, PERMISSIONS, authorize, can, isRole, type Permission, type SessionUser } from "@/lib/auth";

const estimator: SessionUser = { id: "u1", email: "e@example.test", name: "E", role: "estimator" };
const salesHead: SessionUser = { id: "u2", email: "s@example.test", name: "S", role: "sales_head" };

const statusOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof AuthError ? e.status : "OTHER";
  }
  return "OK";
};

describe("permissions", () => {
  it("only sales_head can approve quotes", () => {
    expect(can("sales_head", "quote:approve")).toBe(true);
    expect(can("estimator", "quote:approve")).toBe(false);
  });

  it("estimators create RFQs and cost parts; sales_head does not", () => {
    for (const p of ["rfq:create", "rfq:update", "quote:save", "quote:submit"] as Permission[]) {
      expect(can("estimator", p), p).toBe(true);
      expect(can("sales_head", p), p).toBe(false);
    }
  });

  it("only sales_head adds rates, both can view them", () => {
    expect(can("sales_head", "rates:add")).toBe(true);
    expect(can("estimator", "rates:add")).toBe(false);
    expect(can("estimator", "rates:view") && can("sales_head", "rates:view")).toBe(true);
  });

  it("both roles can see RFQs", () => {
    expect(can("estimator", "rfq:view") && can("sales_head", "rfq:view")).toBe(true);
  });

  it("every permission is granted to at least one role", () => {
    for (const p of PERMISSIONS) expect(can("estimator", p) || can("sales_head", p), p).toBe(true);
  });

  it("isRole accepts only known roles", () => {
    expect(isRole("estimator")).toBe(true);
    expect(isRole("admin")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});

describe("authorize", () => {
  it("returns the user when allowed", () => {
    expect(authorize(salesHead, "quote:approve")).toBe(salesHead);
  });

  it("401 when nobody is signed in", () => {
    expect(statusOf(() => authorize(null, "rfq:view"))).toBe(401);
    expect(statusOf(() => authorize(undefined, "rfq:view"))).toBe(401);
  });

  it("403 when the role lacks the permission", () => {
    expect(statusOf(() => authorize(estimator, "quote:approve"))).toBe(403);
    expect(statusOf(() => authorize(estimator, "rates:add"))).toBe(403);
    expect(statusOf(() => authorize(salesHead, "rfq:create"))).toBe(403);
  });

  it("403 for an unknown or tampered role", () => {
    expect(statusOf(() => authorize({ ...estimator, role: "admin" as never }, "rfq:view"))).toBe(403);
  });
});
