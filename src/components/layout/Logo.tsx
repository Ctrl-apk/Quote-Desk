import { cn } from "@/lib/utils";

/** Plain wordmark tile. No decorative artwork. */
export function Logo({ showName = false, className }: { showName?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden="true"
        className="flex size-9 items-center justify-center rounded-lg bg-primary font-mono text-sm font-semibold tracking-tight text-primary-foreground"
      >
        QD
      </span>
      {showName ? <span className="font-semibold">Quote desk</span> : <span className="sr-only">Quote desk</span>}
    </span>
  );
}
