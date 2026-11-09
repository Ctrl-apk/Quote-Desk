import type { Metadata } from "next";
import Link from "next/link";
import { NewRfqForm } from "@/components/rfq/NewRfqForm";
import { todayIst } from "@/lib/format/dates";
import { requirePageUser } from "@/server/guard";
import { listCustomerNames } from "@/server/repositories/intake";
import { listAllRates } from "@/server/repositories/rates";

export const metadata: Metadata = { title: "New RFQ" };
export const dynamic = "force-dynamic";

export default async function NewRfqPage() {
  await requirePageUser("rfq:create");
  const [customers, rates] = await Promise.all([listCustomerNames(), listAllRates()]);
  const materials = [...new Set(rates.materials.map((m) => m.materialCode))].sort();
  return (
    <div className="space-y-4">
      <Link href="/rfqs" className="text-sm text-muted-foreground hover:text-foreground">← All RFQs</Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New RFQ</h1>
        <p className="mt-1 text-sm text-muted-foreground">Enter the customer and its parts by hand. To start from an email, use the <Link href="/intake" className="underline">intake desk</Link>.</p>
      </div>
      <NewRfqForm customers={customers} materials={materials} today={todayIst()} />
    </div>
  );
}
