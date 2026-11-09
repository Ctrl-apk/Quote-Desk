"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { formatNumberIndian } from "@/lib/format/currency";

/**
 * Shows an exact 2-decimal string and tweens briefly between values (about 250 ms).
 * The tween is cosmetic: it always ends on the exact string, and with reduced motion
 * it never runs. Screen readers get the final value only.
 */
export function AnimatedNumber({ value }: { value: string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(Number(value));

  useEffect(() => {
    const to = Number(value);
    if (reduce || from.current === to) {
      from.current = to;
      setShown(value);
      return;
    }
    const controls = animate(from.current, to, {
      duration: 0.25,
      ease: "easeOut",
      onUpdate: (v) => {
        from.current = v;
        setShown(v.toFixed(2));
      },
      onComplete: () => {
        from.current = to;
        setShown(value);
      },
    });
    return () => controls.stop();
  }, [value, reduce]);

  return (
    <>
      <span aria-hidden="true">{formatNumberIndian(shown)}</span>
      <span className="sr-only">{formatNumberIndian(value)}</span>
    </>
  );
}
