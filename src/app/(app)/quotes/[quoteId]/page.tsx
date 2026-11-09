import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QuoteActions } from "@/components/quotes/QuoteActions";
import { QuoteStatusBadge } from "@/components/quotes/QuoteStatusBadge";
import { QuoteTiers } from "@/components/quotes/QuoteTiers";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { can } from "@/lib/auth";
import { APPROVAL_THRESHOLD_INR } from "@/lib/cost-engine";
import { formatNumberIndian, formatRupees } from "@/lib/format/currency";
import { formatDate, formatDateTimeIst } from "@/lib/format/dates";
import { canIssuePdf } from "@/lib/quote/workflow";
import { requirePageUser } from "@/server/guard";
import { getQuoteDetail } from "@/server/repositories/quotes";

export const metadata: Metadata = { title: "Quote" };
export const dynamic = "force-dynamic";

const ACTIONS: Record<string, string> = {
  "quote.save": "Saved", "quote.submit": "Submitted", "quote.approve": "Approved", "quote.reject": "Rejected", "quote.send": "Sent to customer",
};

export default async function QuotePage({ params }: { params: Promise<{ quoteId: string }> }) {
  const user = await requirePageUser("rfq:view");
  const q = await getQuoteDetail((await params).quoteId);
  if (!q) notFound();

  const { ratesSnapshot: r, inputs } = q;
  const canDecide = can(user.role, "quote:approve") && q.status === "pending_approval";
  const canSend = can(user.role, "quote:send") && (q.status === "approved" || q.status === "ready_to_send") && q.isLatest;
  const canClose = can(user.role, "rfq:update") && q.status === "sent" && q.rfq.status === "sent";

  return (
    <div className="space-y-5">
      <Link href="/quotes" className="text-sm text-muted-foreground hover:text-foreground">← All quotes</Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{q.rfq.rfqNo} · {q.rfq.customer} · due {formatDate(q.rfq.dueDate)}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{q.part.name} <span className="text-muted-foreground">v{q.version}</span></h1>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <QuoteStatusBadge status={q.status} />
            {q.requiresApproval ? <Badge variant="outline">Above threshold</Badge> : null}
            {!q.isLatest ? <Badge variant="secondary">Superseded by a newer version</Badge> : null}
            {q.rfq.status === "won" || q.rfq.status === "lost" ? <Badge variant={q.rfq.status === "won" ? "success" : "secondary"}>RFQ {q.rfq.status}</Badge> : null}
          </div>
        </div>
        <QuoteActions quoteId={q.id} canDecide={canDecide} canSend={canSend} canClose={canClose} canPdf={canIssuePdf(q.status)} />
      </header>

      {(q.status === "approved" || q.status === "ready_to_send") && !canSend ? <p role="status" className="rounded-lg border bg-muted/50 px-4 py-3 text-sm">{q.status === "approved" ? "Approved. " : "No approval needed. "}Waiting for the sales head to send it. The customer PDF is available once it is sent.</p> : null}
      {q.status === "pending_approval" && !canDecide ? <p role="status" className="rounded-lg border bg-muted/50 px-4 py-3 text-sm">Waiting for the sales head. Base annual value {formatRupees(q.annualValue)} is above {formatRupees(APPROVAL_THRESHOLD_INR)} before GST.</p> : null}
      {q.status === "rejected" && q.approvalComment ? <p role="status" className="rounded-lg border border-destructive/30 bg-warning-soft px-4 py-3 text-sm"><span className="font-medium">Rejected by {q.approver}:</span> {q.approvalComment}. Save a new version from the costing screen.</p> : null}
      {q.rfq.status === "lost" && q.rfq.lostReason ? <p role="status" className="rounded-lg border bg-muted/50 px-4 py-3 text-sm"><span className="font-medium">Lost:</span> {q.rfq.lostReason}</p> : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="space-y-3 p-5">
          <h2 className="font-medium">Price, as saved</h2>
          <QuoteTiers tiers={q.tiers} />
          <p className="text-xs text-muted-foreground">Markup is on cost, not gross margin. Annual value excludes GST; approval uses the 1× annual value, {formatRupees(q.annualValue)}.</p>
        </Card>

        <div className="space-y-5">
          <Card className="space-y-2 p-5 text-sm">
            <h2 className="font-medium">Inputs</h2>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">Quote date</dt><dd>{formatDate(q.quotedOn)}</dd>
              <dt className="text-muted-foreground">Material</dt><dd>{inputs.materialCode}</dd>
              <dt className="text-muted-foreground">Gross / net weight</dt><dd className="num">{inputs.grossWeightKg} / {inputs.netWeightKg} kg</dd>
              <dt className="text-muted-foreground">Annual volume</dt><dd className="num">{inputs.annualVolume}</dd>
              <dt className="text-muted-foreground">Scrap allowance</dt><dd className="num">{inputs.scrapPercent}%</dd>
              <dt className="text-muted-foreground">Overhead</dt><dd className="num">{inputs.overheadPercent}%</dd>
              <dt className="text-muted-foreground">Markup / GST</dt><dd className="num">{inputs.markupPercent}% / {inputs.gstPercent}%</dd>
              <dt className="text-muted-foreground">Setup / tooling</dt><dd className="num">₹ {formatNumberIndian(inputs.setupCost)} / ₹ {formatNumberIndian(inputs.toolingCost)}</dd>
            </dl>
            <p className="pt-2 text-muted-foreground">Routing</p>
            <ul className="space-y-0.5">{inputs.routing.map((s, i) => <li key={i}>{s.operation} · {s.machineCode} · {s.cycleTimeMin} min</li>)}</ul>
          </Card>

          <Card className="space-y-2 p-5 text-sm">
            <h2 className="font-medium">Rates used</h2>
            <ul className="space-y-1">
              {r.materials.map((m) => <li key={m.id}>{m.materialCode}: ₹ {formatNumberIndian(m.ratePerKg)}/kg, recovery ₹ {formatNumberIndian(m.scrapRecoveryPerKg)} <span className="text-xs text-muted-foreground">from {formatDate(m.effectiveFrom)}</span></li>)}
              {r.machines.map((m) => <li key={m.id}>{m.machineCode}: ₹ {formatNumberIndian(m.hourRate)}/h, efficiency {Number(m.efficiency)} <span className="text-xs text-muted-foreground">from {formatDate(m.effectiveFrom)}</span></li>)}
              {r.overhead.map((o) => <li key={o.id}>Overhead master {Number(o.percent)}% <span className="text-xs text-muted-foreground">from {formatDate(o.effectiveFrom)}</span></li>)}
            </ul>
          </Card>

          <Card className="space-y-2 p-5 text-sm">
            <h2 className="font-medium">History</h2>
            <ol className="space-y-2">
              {q.trail.map((t, i) => (
                <li key={i}>
                  <p>{ACTIONS[t.action] ?? t.action}{t.by ? ` by ${t.by}` : ""}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTimeIst(t.at)}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
