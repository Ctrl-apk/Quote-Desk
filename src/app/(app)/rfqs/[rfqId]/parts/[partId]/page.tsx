import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CostingWorkspace } from "@/components/costing/CostingWorkspace";
import { can } from "@/lib/auth";
import { todayIst } from "@/lib/format/dates";
import { requirePageUser } from "@/server/guard";
import { getPartForCosting } from "@/server/repositories/parts";
import { listAllRates } from "@/server/repositories/rates";

export const metadata: Metadata = { title: "Costing" };
export const dynamic = "force-dynamic";

export default async function CostingPage({ params }: { params: Promise<{ rfqId: string; partId: string }> }) {
  const user = await requirePageUser("rfq:view");
  const { rfqId, partId } = await params;
  const [part, rates] = await Promise.all([getPartForCosting(rfqId, partId), listAllRates()]);
  if (!part) notFound();

  return (
    <div className="space-y-4">
      <Link href={`/rfqs/${rfqId}`} className="text-sm text-muted-foreground hover:text-foreground">← {part.rfq.rfqNo} and its parts</Link>
      <CostingWorkspace part={part} rates={rates} today={todayIst()} canEdit={can(user.role, "quote:save")} canSubmit={can(user.role, "quote:submit")} />
    </div>
  );
}
