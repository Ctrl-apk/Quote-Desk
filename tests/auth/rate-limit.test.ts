import { describe, expect, it } from "vitest";
import { SIGN_IN_LIMIT, createRateLimiter } from "@/lib/auth";

function setup(max = 3, windowMs = 1000) {
  let t = 0;
  const limiter = createRateLimiter({ max, windowMs, now: () => t });
  return { limiter, advance: (ms: number) => (t += ms) };
}

describe("sign-in rate limiter", () => {
  it("allows attempts until the limit of failures is reached", () => {
    const { limiter } = setup(3);
    for (let i = 0; i < 3; i++) {
      expect(limiter.check("a@x.test").allowed).toBe(true);
      limiter.recordFailure("a@x.test");
    }
    expect(limiter.check("a@x.test").allowed).toBe(false);
  });

  it("reports how long until the oldest failure leaves the window", () => {
    const { limiter, advance } = setup(2, 1000);
    limiter.recordFailure("k");
    advance(300);
    limiter.recordFailure("k");
    advance(200); // t = 500
    expect(limiter.check("k")).toEqual({ allowed: false, retryAfterMs: 500 });
  });

  it("recovers once failures age out of the window", () => {
    const { limiter, advance } = setup(2, 1000);
    limiter.recordFailure("k");
    limiter.recordFailure("k");
    expect(limiter.check("k").allowed).toBe(false);
    advance(1001);
    expect(limiter.check("k").allowed).toBe(true);
  });

  it("keys are independent", () => {
    const { limiter } = setup(1);
    limiter.recordFailure("a");
    expect(limiter.check("a").allowed).toBe(false);
    expect(limiter.check("b").allowed).toBe(true);
  });

  it("reset clears a key after a successful sign-in", () => {
    const { limiter } = setup(1);
    limiter.recordFailure("a");
    limiter.reset("a");
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("production limit is 5 failures per 15 minutes", () => {
    expect(SIGN_IN_LIMIT).toEqual({ max: 5, windowMs: 900_000 });
  });
});
