"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { NumField, SELECT_CLASS } from "@/components/costing/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { addRateAction } from "@/server/actions/rates";

type Kind = "material" | "machine" | "overhead";

export function AddRateDialog({ initialKind, initialCode, today, onClose }: { initialKind: Kind; initialCode?: string; today: string; onClose: () => void }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>(initialKind);
  const [code, setCode] = useState(initialCode ?? (initialKind === "overhead" ? "STANDARD" : ""));
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = kind === "material" ? { kind, code, effectiveFrom, ratePerKg: a, scrapRecoveryPerKg: b }
      : kind === "machine" ? { kind, code, effectiveFrom, hourRate: a, efficiency: b }
      : { kind, code, effectiveFrom, percent: a };
    start(async () => {
      const res = await addRateAction(payload);
      if (res.ok) { router.refresh(); onClose(); } else setError({ text: res.error, field: res.field });
    });
  }

  const labels = kind === "material" ? ["Rate per kg", "Scrap recovery per kg"] : kind === "machine" ? ["Hour rate", "Efficiency (0 to 1)"] : ["Overhead percent"];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Add rate version</DialogTitle>
            <DialogDescription>Adds a new row from the date you choose. Existing rows stay exactly as they are.</DialogDescription>
          </DialogHeader>
          {!initialCode ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rate-kind">Type</Label>
              <select id="rate-kind" className={SELECT_CLASS} value={kind} onChange={(e) => { setKind(e.target.value as Kind); setA(""); setB(""); setError(null); }}>
                <option value="material">Material</option>
                <option value="machine">Machine</option>
                <option value="overhead">Overhead</option>
              </select>
            </div>
          ) : null}
          <NumField label={kind === "material" ? "Material code" : kind === "machine" ? "Machine code" : "Category"} inputMode="text" value={code} onChange={setCode} readOnly={Boolean(initialCode)} hint={initialCode ? undefined : "A new code creates a new material or machine."} />
          <NumField label="Effective from" inputMode="text" value={effectiveFrom} onChange={setEffectiveFrom} error={error?.field === "effectiveFrom" ? error.text : undefined} hint="YYYY-MM-DD. Quotes dated on or after this use the new rate." />
          <div className="grid gap-4 sm:grid-cols-2">
            <NumField label={labels[0]!} prefix={kind === "overhead" ? undefined : "₹"} suffix={kind === "overhead" ? "%" : undefined} value={a} onChange={setA} />
            {labels[1] ? <NumField label={labels[1]} prefix={kind === "material" ? "₹" : undefined} value={b} onChange={setB} /> : null}
          </div>
          {error && error.field !== "effectiveFrom" ? <p role="alert" className="text-sm text-destructive">{error.text}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add rate"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
