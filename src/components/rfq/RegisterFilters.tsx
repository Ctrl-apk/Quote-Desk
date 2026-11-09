"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RFQ_STATUSES, clearedFilters, rfqFiltersToQuery, type RfqFilters } from "@/lib/rfq/filters";
import type { RfqStatusValue } from "@/lib/rfq/overdue";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<RfqStatusValue, string> = { estimating: "Estimating", sent: "Sent", won: "Won", lost: "Lost" };
const SEARCH_DELAY_MS = 250;

/**
 * Filters live in the URL, so a view can be bookmarked or shared and the back button works.
 * Search waits briefly after typing; while the server answers, the table dims instead of jumping.
 */
export function RegisterFilters({ filters, onPendingChange }: { filters: RfqFilters; onPendingChange: (pending: boolean) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(filters.q);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Keep the box in step when the URL changes from elsewhere (back button, Clear filters).
  const [seenQ, setSeenQ] = useState(filters.q);
  if (filters.q !== seenQ) {
    setSeenQ(filters.q);
    setText(filters.q);
  }

  useEffect(() => onPendingChange(pending), [pending, onPendingChange]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const go = (next: RfqFilters) => startTransition(() => router.replace(`${pathname}${rfqFiltersToQuery(next)}`, { scroll: false }));

  function onSearch(value: string) {
    setText(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => go({ ...filters, q: value.replace(/\s+/g, " ").trim() }), SEARCH_DELAY_MS);
  }

  const hasFilters = filters.mine || filters.status !== null || filters.q !== "";
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={filters.mine ? "mine" : "all"} onValueChange={(v) => go({ ...filters, mine: v === "mine" })}>
          <TabsList aria-label="Whose RFQs">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="mine">Mine</TabsTrigger>
          </TabsList>
        </Tabs>
        <div role="group" aria-label="Status" className="flex flex-wrap gap-1.5">
          {RFQ_STATUSES.map((s) => {
            const active = filters.status === s;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={active}
                onClick={() => go({ ...filters, status: active ? null : s })}
                className={cn(
                  "h-8 rounded-full border px-3 text-sm transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                  active ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {STATUS_LABEL[s]}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative w-full lg:w-72">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={text}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search RFQ, customer or part"
            aria-label="Search RFQs"
            maxLength={80}
            className="pl-9"
          />
        </div>
        {hasFilters ? (
          <button
            type="button"
            onClick={() => { setText(""); go(clearedFilters(filters)); }}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <X aria-hidden="true" className="size-4" />
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}
