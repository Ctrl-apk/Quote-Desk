"use client";

import Link from "next/link";
import { useState } from "react";
import { RegisterFilters } from "@/components/rfq/RegisterFilters";
import { RfqTable } from "@/components/rfq/RfqTable";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/StateMessage";
import { clearedFilters, rfqFiltersToQuery, toggleSort, type RfqFilters } from "@/lib/rfq/filters";
import type { RfqRow } from "@/server/repositories/rfqs";
import { cn } from "@/lib/utils";
import { usePathname, useRouter } from "next/navigation";

interface Props {
  rows: RfqRow[];
  truncated: boolean;
  filters: RfqFilters;
  today: string;
  canCreate: boolean;
  totalCount: number;
}

export function RegisterView({ rows, truncated, filters, today, canCreate, totalCount }: Props) {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const filtered = filters.mine || filters.status !== null || filters.q !== "";

  return (
    <div className="space-y-4">
      <RegisterFilters filters={filters} onPendingChange={setPending} />
      <div
        aria-busy={pending}
        className={cn("overflow-x-auto rounded-xl border bg-card transition-opacity duration-150", pending && "opacity-60")}
      >
        {rows.length === 0 ? (
          <EmptyState
            className="rounded-none border-0"
            title={filtered ? "No RFQs match these filters" : "No RFQs yet"}
            description={filtered ? `Nothing matches in ${totalCount} RFQs. Try a different search or clear the filters.` : "Create one by hand, or start from an email on the intake desk."}
            action={filtered ? <Button variant="outline" onClick={() => router.replace(`${pathname}${rfqFiltersToQuery(clearedFilters(filters))}`)}>Clear filters</Button> : canCreate ? <Button asChild><Link href="/rfqs/new">New RFQ</Link></Button> : undefined}
          />
        ) : (
          <RfqTable rows={rows} today={today} filters={filters} onSort={(k) => router.replace(`${pathname}${rfqFiltersToQuery(toggleSort(filters, k))}`, { scroll: false })} />
        )}
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {truncated ? `Showing the first ${rows.length} RFQs. Narrow the search to see others.` : `${rows.length} of ${totalCount} RFQs`}
      </p>
    </div>
  );
}
