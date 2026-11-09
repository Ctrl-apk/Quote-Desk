import type { Metadata } from "next";
import { ImportCard } from "@/components/past-quotes/ImportCard";
import { EmptyState } from "@/components/ui/StateMessage";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SELECT_CLASS } from "@/components/costing/fields";
import { can } from "@/lib/auth";
import { formatNumberIndian } from "@/lib/format/currency";
import { formatDate } from "@/lib/format/dates";
import { SEARCH_LIMIT, SIMILAR_WEIGHT_TOLERANCE, parsePastQuoteQuery } from "@/lib/import/search";
import { requirePageUser } from "@/server/guard";
import { distinctMaterials, searchPastQuotes } from "@/server/repositories/past-quotes";

export const metadata: Metadata = { title: "Past quotes" };
export const dynamic = "force-dynamic";

export default async function PastQuotesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageUser("rfq:view");
  const query = parsePastQuoteQuery(await searchParams);
  const [{ rows, total }, materials] = await Promise.all([searchPastQuotes(query), distinctMaterials()]);
  const filtered = Boolean(query.q || query.material || query.weight || query.from || query.to);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Past quotes</h1>
        <p className="mt-1 text-sm text-muted-foreground">Find what similar parts were quoted at. Similar means the same material and a gross weight within {SIMILAR_WEIGHT_TOLERANCE * 100}%. These are for reference only and never change a price.</p>
      </div>

      <Card className="p-5">
        <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_auto] lg:items-end">
          <div className="flex flex-col gap-1.5"><Label htmlFor="q">Customer, part, part no. or RFQ / quote ref</Label><Input id="q" name="q" defaultValue={query.q} maxLength={80} /></div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="material">Material</Label>
            <select id="material" name="material" defaultValue={query.material} className={SELECT_CLASS}><option value="">Any</option>{materials.map((m) => <option key={m} value={m}>{m}</option>)}</select>
          </div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="weight">Gross weight (kg)</Label><Input id="weight" name="weight" inputMode="decimal" defaultValue={query.weight ?? ""} placeholder="e.g. 0.61" /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="from">Quoted from</Label><Input id="from" name="from" type="date" defaultValue={query.from ?? ""} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="to">Quoted to</Label><Input id="to" name="to" type="date" defaultValue={query.to ?? ""} /></div>
          <div className="flex gap-2"><Button type="submit">Search</Button>{filtered ? <Button asChild variant="outline"><a href="/past-quotes">Clear</a></Button> : null}</div>
        </form>
      </Card>

      {rows.length === 0 ? (
        <EmptyState title={filtered ? "No past quotes match" : "No past quotes yet"} description={filtered ? "Try a wider weight, another material, or fewer words." : "Import a file below to build the reference set."} />
      ) : (
        <section aria-label="Results">
          <p className="mb-2 text-sm text-muted-foreground">{rows.length} shown{rows.length === SEARCH_LIMIT ? ` (first ${SEARCH_LIMIT}; narrow the search for more)` : ""} of {total} on file.{query.weight ? " Closest weight first." : ""}</p>
          <div className="relative overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[46rem] text-sm">
              <thead><tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Part</th><th className="px-4 py-2.5 font-medium">Customer</th><th className="px-4 py-2.5 font-medium">Material</th>
                <th className="px-4 py-2.5 text-right font-medium">Gross kg</th><th className="px-4 py-2.5 font-medium">Routing</th><th className="px-4 py-2.5 text-right font-medium">Price ₹/unit</th><th className="px-4 py-2.5 font-medium">Quote</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 align-top">
                    <td className="px-4 py-3 font-medium">{r.partName}{r.partNumber ? <span className="block text-xs font-normal text-muted-foreground">{r.partNumber}</span> : null}</td><td className="px-4 py-3">{r.customer}</td><td className="px-4 py-3">{r.materialCode}</td>
                    <td className="num px-4 py-3 text-right">{Number(r.grossWeightKg)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.routing.map((s) => `${s.operation} ${Number(s.cycleTimeMin)} min`).join(", ")}</td>
                    <td className="num px-4 py-3 text-right font-medium">{formatNumberIndian(r.pricePerUnit)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.quoteRef}<span className="block text-xs">{formatDate(r.quotedOn)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {can(user.role, "import:run") ? <ImportCard /> : <p className="text-sm text-muted-foreground">Importing past quotes is done by estimators.</p>}
    </div>
  );
}
