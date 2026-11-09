"use client";

import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { StatusBadge } from "@/components/rfq/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format/dates";
import { type RfqFilters, type RfqSortKey } from "@/lib/rfq/filters";
import { isOverdue } from "@/lib/rfq/overdue";
import type { RfqRow } from "@/server/repositories/rfqs";

const MotionRow = motion.create(TableRow);

/** Rows ease in with a very small stagger on first load and fade as filters change. Nothing bounces. */
function SortHead({ label, k, filters, onSort }: { label: string; k: RfqSortKey; filters: RfqFilters; onSort: (k: RfqSortKey) => void }) {
  const active = filters.sort === k;
  const Icon = filters.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead aria-sort={active ? (filters.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(k)} className="-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
        {label}
        {active ? <Icon aria-hidden="true" className="size-3.5" /> : null}
        <span className="sr-only">{active ? `, sorted ${filters.dir === "asc" ? "ascending" : "descending"}. Activate to reverse.` : ", activate to sort"}</span>
      </button>
    </TableHead>
  );
}

export function RfqTable({ rows, today, filters, onSort }: { rows: RfqRow[]; today: string; filters: RfqFilters; onSort: (k: RfqSortKey) => void }) {
  return (
    <Table className="min-w-[62rem]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <SortHead label="RFQ no" k="rfq" filters={filters} onSort={onSort} />
          <SortHead label="Customer" k="customer" filters={filters} onSort={onSort} />
          <TableHead>Part</TableHead>
          <SortHead label="Received" k="received" filters={filters} onSort={onSort} />
          <SortHead label="Due date" k="due" filters={filters} onSort={onSort} />
          <TableHead>Owner</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-28 text-right">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <AnimatePresence initial mode="popLayout">
          {rows.map((r, i) => {
            const overdue = isOverdue(r.status, r.dueDate, today);
            return (
              <MotionRow
                key={r.id}
                layout="position"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.18, delay: Math.min(i, 8) * 0.025 } }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
              >
                <TableCell className="whitespace-nowrap font-medium">{r.rfqNo}</TableCell>
                <TableCell>{r.customer}</TableCell>
                <TableCell>
                  {r.firstPart?.name ?? <span className="text-muted-foreground">No parts</span>}
                  {r.partCount > 1 ? <span className="ml-1 text-muted-foreground">+{r.partCount - 1} more</span> : null}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(r.receivedOn)}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(r.dueDate)} {overdue ? <Badge variant="warning" className="ml-1">Overdue</Badge> : null}
                </TableCell>
                <TableCell className="whitespace-nowrap">{r.owner}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={r.status} />
                    {r.lostReason ? <span className="text-sm text-muted-foreground">{r.lostReason}</span> : null}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/rfqs/${r.id}`} aria-label={`Open ${r.rfqNo}`}>
                      Open
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                </TableCell>
              </MotionRow>
            );
          })}
        </AnimatePresence>
      </TableBody>
    </Table>
  );
}
