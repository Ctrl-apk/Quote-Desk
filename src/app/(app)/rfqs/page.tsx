import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RegisterView } from "@/components/rfq/RegisterView";
import { StatCard } from "@/components/rfq/StatCard";
import { can } from "@/lib/auth";
import { todayIst } from "@/lib/format/dates";
import { parseRfqFilters } from "@/lib/rfq/filters";
import { requirePageUser } from "@/server/guard";
import { listRfqs, rfqStats } from "@/server/repositories/rfqs";

export const metadata: Metadata = { title: "RFQs" };
export const dynamic = "force-dynamic";

export default async function RfqsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageUser("rfq:view");
  const filters = parseRfqFilters(await searchParams);
  const today = todayIst();
  const [{ rows, truncated }, stats] = await Promise.all([listRfqs(filters, user.id), rfqStats(today)]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
       <div>
        <h1 className="text-2xl font-semibold tracking-tight">RFQs</h1>
        <p className="mt-1 text-sm text-muted-foreground">Open an RFQ to see its parts, cost them and send a quote.</p>
       </div>
      {can(user.role, "rfq:create") ? (
        <Button asChild><Link href="/rfqs/new"><Plus /> New RFQ</Link></Button>
      ) : null}
      </div>
      <section aria-label="Summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Estimating" value={stats.estimating} hint="Being costed now" />
        <StatCard label="Overdue" value={stats.overdue} hint="Past due, not yet sent" attention />
        <StatCard label="Sent" value={stats.sent} hint="Waiting on the customer" />
        <StatCard label="Closed" value={stats.closed} hint="Won or lost" />
      </section>
      <RegisterView
        rows={rows}
        truncated={truncated}
        filters={filters}
        today={today}
        canCreate={can(user.role, "rfq:create")}
        totalCount={stats.estimating + stats.sent + stats.closed}
      />
    </div>
  );
}
