import type { Metadata } from "next";
import Link from "next/link";
import { QuoteStatusBadge } from "@/components/quotes/QuoteStatusBadge";
import { EmptyState } from "@/components/ui/StateMessage";
import { formatRupees } from "@/lib/format/currency";
import { formatDateTimeIst } from "@/lib/format/dates";
import type { QuoteStatusValue } from "@/lib/quote/submit";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/guard";
import { listQuotes } from "@/server/repositories/quotes";

export const metadata: Metadata = { title: "Quotes" };
export const dynamic = "force-dynamic";

const TABS: { key: string; label: string; statuses: QuoteStatusValue[] | null }[] = [
  { key: "pending", label: "Needs approval", statuses: ["pending_approval"] },
  { key: "tosend", label: "Ready to send", statuses: ["approved", "ready_to_send"] },
  { key: "sent", label: "Sent", statuses: ["sent"] },
  { key: "rejected", label: "Rejected", statuses: ["rejected"] },
  { key: "all", label: "All", statuses: null },
];

export default async function QuotesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageUser("rfq:view");
  const raw = (await searchParams).status;
  const requested = typeof raw === "string" ? raw : undefined;
  const active = TABS.find((t) => t.key === requested) ?? (user.role === "sales_head" ? TABS[0]! : TABS[4]!);
  const rows = await listQuotes(active.statuses);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Quotes</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every saved quote version. The sales head approves the ones above ₹25,00,000 and sends every quote from here.</p>
      </div>
      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link key={t.key} href={`/quotes?status=${t.key}`} aria-current={t.key === active.key ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1 text-sm", t.key === active.key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>
            {t.label}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState title="No quotes here" description="Quotes appear when an estimator saves a version from the costing screen." />
      ) : (
        <div className="relative overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[40rem] text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">RFQ</th><th className="px-4 py-2.5 font-medium">Customer</th><th className="px-4 py-2.5 font-medium">Part</th>
              <th className="px-4 py-2.5 text-right font-medium">Annual value (excl. GST)</th><th className="px-4 py-2.5 font-medium">Status</th><th className="px-4 py-2.5 font-medium">Saved</th>
            </tr></thead>
            <tbody>
              {rows.map((q) => (
                <tr key={q.id} className="border-b last:border-0 hover:bg-accent/40">
                  <td className="px-4 py-3"><Link href={`/quotes/${q.id}`} className="font-medium text-primary underline-offset-4 hover:underline">{q.rfqNo} v{q.version}</Link></td>
                  <td className="px-4 py-3">{q.customer}</td>
                  <td className="px-4 py-3">{q.partName}</td>
                  <td className="num px-4 py-3 text-right">{formatRupees(q.annualValue)}</td>
                  <td className="px-4 py-3"><QuoteStatusBadge status={q.status} /></td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDateTimeIst(q.createdAt)} · {q.createdBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
