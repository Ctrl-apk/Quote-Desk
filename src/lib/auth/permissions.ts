export const ROLES = ["estimator", "sales_head"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "rfq:view",
  "rfq:create",
  "rfq:update",
  "quote:save",
  "quote:submit",
  "quote:send",
  "quote:approve",
  "rates:view",
  "rates:add",
  "import:run",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * The single place that says who may do what (assumption A-04). Everything
 * server-side asks `can` or `authorize`; the UI uses the same map only to hide controls.
 *
 * - estimator: creates RFQs, costs parts, submits quotes. Cannot approve or send.
 * - sales_head: sees everything, approves or rejects, sends every quote, and is the only role that adds rates.
 */
const GRANTS: Record<Role, ReadonlySet<Permission>> = {
  estimator: new Set<Permission>(["rfq:view", "rfq:create", "rfq:update", "quote:save", "quote:submit", "rates:view", "import:run"]),
  sales_head: new Set<Permission>(["rfq:view", "quote:send", "quote:approve", "rates:view", "rates:add"]),
};

export function can(role: Role, permission: Permission): boolean {
  return GRANTS[role].has(permission);
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
