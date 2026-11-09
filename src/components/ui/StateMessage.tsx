import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

function Frame({ title, description, action, className, role }: StateProps & { role?: "alert" }) {
  return (
    <div role={role} className={cn("rounded-xl border border-dashed bg-card px-6 py-14 text-center", className)}>
      <p className="font-medium">{title}</p>
      {description ? <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export const EmptyState = (props: StateProps) => <Frame {...props} />;
export const ErrorState = (props: StateProps) => <Frame {...props} role="alert" />;

/** Generic page-level loading state: a title bar and a few rows, announced once to screen readers. */
export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="space-y-6">
      <Skeleton className="h-7 w-40" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}
