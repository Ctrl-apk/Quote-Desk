"use client";

import { AnimatedNumber } from "./AnimatedNumber";
import type { CostingResult } from "@/lib/costing/form";
import { APPROVAL_THRESHOLD_INR } from "@/lib/cost-engine";
import { formatNumberIndian, formatRupees } from "@/lib/format/currency";
import { formatDate } from "@/lib/format/dates";
import { cn } from "@/lib/utils";

type Ok = Extract<CostingResult, { ok: true }>;

const ROWS: { key: "material" | "conversion" | "setupTooling" | "overhead" | "packing" | "freight"; label: string }[] = [
  { key: "material", label: "Material" },
  { key: "conversion", label: "Conversion" },
  { key: "setupTooling", label: "Setup + tooling" },
  { key: "overhead", label: "Overhead" },
  { key: "packing", label: "Packing" },
  { key: "freight", label: "Freight" },
];

export function PriceTable({ result, markupPercent, gstPercent }: { result: Ok; markupPercent: string; gstPercent: string }) {
  const { tiers } = result.cost;
  const cell = "px-3 py-2 text-right";
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[30rem] text-sm">
        <caption className="sr-only">Cost per unit in rupees for three annual volumes</caption>
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th scope="col" className="px-3 py-2 text-left font-medium">₹ per unit</th>
            {tiers.map((t, i) => (
              <th key={t.factor} scope="col" className={cn(cell, "font-medium", i === 1 && "text-foreground")}>
                <span className="block">{t.factor}× volume{i === 1 ? " (base)" : ""}</span>
                <span className="block font-normal">{t.volume.toString()} pcs/yr</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.key} className="border-b">
              <th scope="row" className="px-3 py-2 text-left font-normal text-muted-foreground">{row.label}</th>
              {tiers.map((t, i) => (
                <td key={t.factor} className={cn(cell, i === 1 && "bg-muted/50")}><AnimatedNumber value={t[row.key].toFixed(2)} /></td>
              ))}
            </tr>
          ))}
          <tr className="border-b font-medium">
            <th scope="row" className="px-3 py-2 text-left">Total cost</th>
            {tiers.map((t, i) => (
              <td key={t.factor} className={cn(cell, i === 1 && "bg-muted/50")}><AnimatedNumber value={t.totalCost.toFixed(2)} /></td>
            ))}
          </tr>
          <tr className="border-b">
            <th scope="row" className="px-3 py-2 text-left font-normal text-muted-foreground">
              Markup {markupPercent}%<span className="block text-xs">on cost, not gross margin</span>
            </th>
            {tiers.map((t, i) => (
              <td key={t.factor} className={cn(cell, i === 1 && "bg-muted/50")}><AnimatedNumber value={t.markup.toFixed(2)} /></td>
            ))}
          </tr>
          <tr className="border-b text-base font-semibold">
            <th scope="row" className="px-3 py-3 text-left">Price per unit</th>
            {tiers.map((t, i) => (
              <td key={t.factor} className={cn(cell, "py-3", i === 1 && "bg-muted/50")}><AnimatedNumber value={t.pricePerUnit.toFixed(2)} /></td>
            ))}
          </tr>
          <tr className="border-b">
            <th scope="row" className="px-3 py-2 text-left font-normal text-muted-foreground">GST {gstPercent}% (shown separately)</th>
            {tiers.map((t, i) => (
              <td key={t.factor} className={cn(cell, i === 1 && "bg-muted/50")}><AnimatedNumber value={t.gst.toFixed(2)} /></td>
            ))}
          </tr>
          <tr>
            <th scope="row" className="px-3 py-2 text-left font-medium">
              Annual value, ₹<span className="block text-xs font-normal text-muted-foreground">excludes GST</span>
            </th>
            {tiers.map((t, i) => (
              <td key={t.factor} className={cn(cell, "font-medium", i === 1 && "bg-muted/50")}><AnimatedNumber value={t.annualValue.toFixed(2)} /></td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function ThresholdNotice({ baseAnnualValue, requires }: { baseAnnualValue: string; requires: boolean }) {
  if (!requires) {
    return (
      <p className="text-sm text-muted-foreground">
        Base annual value {formatRupees(baseAnnualValue)} is within {formatRupees(APPROVAL_THRESHOLD_INR)}. No approval needed.
      </p>
    );
  }
  return (
    <div role="status" className="rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
      <p className="font-medium">Sales head approval needed</p>
      <p className="mt-0.5">Base annual value {formatRupees(baseAnnualValue)} is above {formatRupees(APPROVAL_THRESHOLD_INR)} (before GST).</p>
    </div>
  );
}

export function RatesUsed({ result, quotedOn }: { result: Ok; quotedOn: string }) {
  const m = result.materialRate;
  const o = result.overheadMaster;
  return (
    <div className="space-y-1 text-sm">
      <p className="text-xs text-muted-foreground">Rates in force on {formatDate(quotedOn)}</p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">{m.materialCode} per kg</dt>
        <dd className="num text-right">₹ {formatNumberIndian(m.ratePerKg)} <span className="text-xs text-muted-foreground">from {formatDate(m.effectiveFrom)}</span></dd>
        <dt className="text-muted-foreground">{m.materialCode} scrap recovery per kg</dt>
        <dd className="num text-right">₹ {formatNumberIndian(m.scrapRecoveryPerKg)}</dd>
        {result.machineRates.map((r, i) => (
          <div key={`${r.machineCode}-${i}`} className="col-span-2 grid grid-cols-subgrid">
            <dt className="text-muted-foreground">{r.machineCode} per hour (efficiency {Math.round(Number(r.efficiency) * 100)}%)</dt>
            <dd className="num text-right">₹ {formatNumberIndian(r.hourRate)} <span className="text-xs text-muted-foreground">from {formatDate(r.effectiveFrom)}</span></dd>
          </div>
        ))}
        <dt className="text-muted-foreground">Overhead (rate master)</dt>
        <dd className="num text-right">{Number(o.percent)}%{result.overheadOverridden ? " (overridden)" : ""}</dd>
      </dl>
    </div>
  );
}
