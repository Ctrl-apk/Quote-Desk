"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

/** Re-mounts on every navigation: a short fade with a few pixels of lift. Disabled movement under reduced-motion. */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}
