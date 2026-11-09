"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { Plus } from "lucide-react";
import { AddRateDialog } from "./AddRateDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNumberIndian } from "@/lib/format/currency";
import { formatDate } from "@/lib/format/dates";
import { rateHistory, type RateStanding } from "@/lib/rates";
import type { AllRates } from "@/server/repositories/rates";

type Kind = "material" | "machine" | "overhead";

const STANDING: Record<RateStanding, { label: string; variant: "success" | "info" | "outline" }> = {
  current: { label: "In force", variant: "success" },
  scheduled: { label: "Scheduled", variant: "info" },
  superseded: { label: "Superseded", variant: "outline" },
};

const COLUMNS: Record<Kind, string[]> = {
  material: ["Rate per kg (₹)", "Scrap recovery per kg (₹)"],
  machine: ["Hour rate (₹)", "Efficiency"],
  overhead: ["Overhead (%)"],
};

export function RatesView({ rates, authors, today, canAdd }: { rates: AllRates; authors: Record<string, string>; today: string; canAdd: boolean }) {
  const [kind, setKind] = useState<Kind>("material");
  const [dialog, setDialog] = useState<{ kind: Kind; code?: string } | null>(null);

  const groups =
    kind === "material"
      ? rateHistory(rates.materials, (r) => r.materialCode, today).map((g) => ({ code: g.code, entries: g.entries.map((e) => ({ id: e.row.id, from: e.row.effectiveFrom, to: e.effectiveTo, standing: e.standing, values: [formatNumberIndian(e.row.ratePerKg), formatNumberIndian(e.row.scrapRecoveryPerKg)] })) }))
      : kind === "machine"
        ? rateHistory(rates.machines, (r) => r.machineCode, today).map((g) => ({ code: g.code, entries: g.entries.map((e) => ({ id: e.row.id, from: e.row.effectiveFrom, to: e.effectiveTo, standing: e.standing, values: [formatNumberIndian(e.row.hourRate), String(Number(e.row.efficiency))] })) }))
        : rateHistory(rates.overhead, (r) => r.category, today).map((g) => ({ code: g.code, entries: g.entries.map((e) => ({ id: e.row.id, from: e.row.effectiveFrom, to: e.effectiveTo, standing: e.standing, values: [String(Number(e.row.percent))] })) }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
          <TabsList>
            <TabsTrigger value="material">Materials</TabsTrigger>
            <TabsTrigger value="machine">Machines</TabsTrigger>
            <TabsTrigger value="overhead">Overhead</TabsTrigger>
          </TabsList>
        </Tabs>
        {canAdd ? <Button onClick={() => setDialog({ kind })}><Plus /> Add rate version</Button> : <Badge variant="secondary">View only. The sales head maintains rates.</Badge>}
      </div>

      {groups.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No rates yet.</Card>
      ) : (
        groups.map((g, gi) => (
          <motion.div key={`${kind}-${g.code}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: Math.min(gi, 6) * 0.03 }}>
            <Card className="gap-0 overflow-hidden p-0">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h2 className="font-medium">{g.code}</h2>
                {canAdd ? <Button variant="ghost" size="sm" onClick={() => setDialog({ kind, code: g.code })}>New version</Button> : null}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[32rem] text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th scope="col" className="px-4 py-2 text-left font-medium">Effective from</th>
                      <th scope="col" className="px-4 py-2 text-left font-medium">Effective to</th>
                      {COLUMNS[kind].map((c) => <th key={c} scope="col" className="px-4 py-2 text-right font-medium">{c}</th>)}
                      <th scope="col" className="px-4 py-2 text-left font-medium">Added by</th>
                      <th scope="col" className="px-4 py-2 text-left font-medium">Standing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.entries.map((e) => (
                      <tr key={e.id} className="border-b last:border-0">
                        <td className="px-4 py-2">{formatDate(e.from)}</td>
                        <td className="px-4 py-2 text-muted-foreground">{e.to ? formatDate(e.to) : "Open-ended"}</td>
                        {e.values.map((v, i) => <td key={i} className="num px-4 py-2 text-right">{v}</td>)}
                        <td className="px-4 py-2 text-muted-foreground">{authors[e.id] ?? "–"}</td>
                        <td className="px-4 py-2"><Badge variant={STANDING[e.standing].variant}>{STANDING[e.standing].label}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </motion.div>
        ))
      )}
      <p className="text-xs text-muted-foreground">Rates are never edited or deleted. A change is a new row with a later date, and every saved quote keeps a copy of the rates it used.</p>
      {dialog ? <AddRateDialog key={`${dialog.kind}-${dialog.code ?? "new"}`} initialKind={dialog.kind} initialCode={dialog.code} today={today} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
