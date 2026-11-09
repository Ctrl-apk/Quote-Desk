export interface RateLimiterOptions {
  /** Failed attempts allowed inside the window. */
  max: number;
  windowMs: number;
  now?: () => number;
}

export interface RateLimitStatus {
  allowed: boolean;
  retryAfterMs: number;
}

/**
 * Sliding-window limiter for failed sign-ins, held in memory.
 * Limitation: on serverless hosting each instance has its own memory, so this slows
 * guessing but is not a hard global limit. A shared store (Redis) is the next step.
 */
export function createRateLimiter({ max, windowMs, now = Date.now }: RateLimiterOptions) {
  const failures = new Map<string, number[]>();

  const recent = (key: string): number[] => {
    const cutoff = now() - windowMs;
    const kept = (failures.get(key) ?? []).filter((t) => t > cutoff);
    if (kept.length > 0) failures.set(key, kept);
    else failures.delete(key);
    return kept;
  };

  return {
    check(key: string): RateLimitStatus {
      const kept = recent(key);
      if (kept.length < max) return { allowed: true, retryAfterMs: 0 };
      const oldest = kept[0] as number;
      return { allowed: false, retryAfterMs: oldest + windowMs - now() };
    },
    recordFailure(key: string): void {
      failures.set(key, [...recent(key), now()]);
    },
    reset(key: string): void {
      failures.delete(key);
    },
  };
}

/** 5 failed attempts per 15 minutes per email (assumption S-01). */
export const SIGN_IN_LIMIT = { max: 5, windowMs: 15 * 60 * 1000 } as const;
