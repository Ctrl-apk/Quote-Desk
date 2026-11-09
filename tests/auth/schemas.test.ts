import { describe, expect, it } from "vitest";
import { signInSchema } from "@/lib/auth";

describe("signInSchema", () => {
  it("trims and lowercases the email", () => {
    const r = signInSchema.parse({ email: "  Estimator@Quotedesk.Example ", password: "x" });
    expect(r.email).toBe("estimator@quotedesk.example");
  });

  it.each([
    ["not an email", { email: "nope", password: "x" }],
    ["empty email", { email: "", password: "x" }],
    ["empty password", { email: "a@b.test", password: "" }],
    ["missing password", { email: "a@b.test" }],
    ["huge password", { email: "a@b.test", password: "x".repeat(201) }],
    ["non-string email", { email: 5, password: "x" }],
  ])("rejects %s", (_name, input) => {
    expect(signInSchema.safeParse(input).success).toBe(false);
  });
});
