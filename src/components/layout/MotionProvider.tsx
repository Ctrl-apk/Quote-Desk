"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/**
 * One switch for motion across the app. "user" follows the operating system's
 * reduced-motion setting: movement and scaling are dropped, simple fades remain.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
