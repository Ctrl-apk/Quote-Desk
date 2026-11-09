import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RfqDetailView } from "@/components/rfq/RfqDetailView";
import { can } from "@/lib/auth";
import { todayIst } from "@/lib/format/dates";
import { requirePageUser } from "@/server/guard";
import { getRfqDetail } from "@/server/repositories/rfq-manage";
import { listAllRates } from "@/server/repositories/rates";

export const metadata: Metadata = { title: "RFQ" };
export const dynamic = "force-dynamic";

export default async function RfqPage({ params }: { params: Promise<{ rfqId: string }> }) {
  const user = await requirePageUser("rfq:view");
  const { rfqId } = await params;
  const [rfq, rates] = await Promise.all([getRfqDetail(rfqId), listAllRates()]);
  if (!rfq) notFound();
  const materials = [...new Set(rates.materials.map((m) => m.materialCode))].sort();
  return (
    <div className="space-y-4">
      <Link href="/rfqs" className="text-sm text-muted-foreground hover:text-foreground">← All RFQs</Link>
      <RfqDetailView rfq={rfq} today={todayIst()} canEdit={can(user.role, "rfq:update")} canCost={can(user.role, "quote:save")} materials={materials} />
    </div>
  );
}
