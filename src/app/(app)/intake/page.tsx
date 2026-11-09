import type { Metadata } from "next";
import { IntakeDesk } from "@/components/intake/IntakeDesk";
import { addDaysIso, todayIst } from "@/lib/format/dates";
import { requirePageUser } from "@/server/guard";
import { listCustomerNames } from "@/server/repositories/intake";

export const metadata: Metadata = { title: "Intake desk" };
export const dynamic = "force-dynamic";

export default async function IntakePage() {
  await requirePageUser("rfq:create");
  const customers = await listCustomerNames();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Intake desk</h1>
        <p className="mt-1 text-sm text-muted-foreground">Turn an RFQ email into an RFQ. Every extracted value is a suggestion you review, and anything extracted must be accepted before a quote can be submitted.</p>
      </div>
      <IntakeDesk customers={customers} defaultDue={addDaysIso(todayIst(), 7)} />
    </div>
  );
}
