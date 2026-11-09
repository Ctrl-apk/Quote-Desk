import type { Metadata } from "next";
import { RatesView } from "@/components/rates/RatesView";
import { can } from "@/lib/auth";
import { todayIst } from "@/lib/format/dates";
import { requirePageUser } from "@/server/guard";
import { listAllRates, listRateAuthors } from "@/server/repositories/rates";

export const metadata: Metadata = { title: "Rate masters" };
export const dynamic = "force-dynamic";

export default async function RatesPage() {
  const user = await requirePageUser("rates:view");
  const [rates, authors] = await Promise.all([listAllRates(), listRateAuthors()]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rate masters</h1>
        <p className="mt-1 text-sm text-muted-foreground">Material, machine and overhead rates by effective date. Quotes use the rate in force on the quote date.</p>
      </div>
      <RatesView rates={rates} authors={authors} today={todayIst()} canAdd={can(user.role, "rates:add")} />
    </div>
  );
}
