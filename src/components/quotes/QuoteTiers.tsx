import type { SerializedTier } from "@/lib/costing/form";
import { formatNumberIndian } from "@/lib/format/currency";
import { cn } from "@/lib/utils";

const ROWS: { key: keyof SerializedTier; label: string; strong?: boolean }[] = [
  { key: "material", label: "Material" },
  { key: "conversion", label: "Conversion" },
  { key: "setupTooling", label: "Setup + tooling" },
  { key: "overhead", label: "Overhead" },
  { key: "packing", label: "Packing" },
  { key: "freight", label: "Freight" },
  { key: "totalCost", label: "Total cost", strong: true },
  { key: "markup", label: "Markup (on cost)" },
  { key: "pricePerUnit", label: "Price per unit", strong: true },
  { key: "gst", label: "GST (separate)" },
  { key: "annualValue", label: "Annual value (excl. GST)", strong: true },
];

/** The stored result of a saved version, exactly as it was computed. Nothing is recalculated here. */
export function QuoteTiers({ tiers }: { tiers: SerializedTier[] }) {
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[30rem] text-sm">
        <caption className="sr-only">Saved cost per unit in rupees for three annual volumes</caption>
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th scope="col" className="px-3 py-2 text-left font-medium">₹ per unit</th>
            {tiers.map((t, i) => (
              <th key={t.factor} scope="col" className="px-3 py-2 text-right font-medium">
                {t.factor}× volume{i === 1 ? " (base)" : ""}<span className="block font-normal">{t.volume} pcs/yr</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.key} className={cn("border-b last:border-0", r.strong && "font-medium")}>
              <th scope="row" className={cn("px-3 py-2 text-left", !r.strong && "font-normal text-muted-foreground")}>{r.label}</th>
              {tiers.map((t, i) => <td key={t.factor} className={cn("num px-3 py-2 text-right", i === 1 && "bg-muted/50")}>{formatNumberIndian(t[r.key] as string)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
