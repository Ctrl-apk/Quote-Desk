"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { NumField } from "@/components/costing/fields";
import { PartListImport } from "@/components/rfq/PartListImport";
import { EMPTY_PART, PartEditor, type PartErrors } from "@/components/rfq/PartEditor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { addDaysIso } from "@/lib/format/dates";
import { MAX_PARTS_PER_RFQ, createRfqSchema, type PartDraft } from "@/lib/rfq/manage";
import { createRfqManualAction } from "@/server/actions/rfqs";

/** Zod issues -> messages keyed by "parts.0.name", "customer" and so on. */
export function issueMap(error: { issues: { message: string; path: PropertyKey[] }[] }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of error.issues) {
    const key = i.path.filter((p) => typeof p !== "symbol").join(".");
    if (!(key in out)) out[key] = i.message;
  }
  return out;
}

export function NewRfqForm({ customers, materials, today }: { customers: string[]; materials: string[]; today: string }) {
  const router = useRouter();
  const [customer, setCustomer] = useState("");
  const [dueDate, setDueDate] = useState(addDaysIso(today, 14));
  const [parts, setParts] = useState<PartDraft[]>([{ ...EMPTY_PART }]);
  const [fromFile, setFromFile] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = createRfqSchema.safeParse({ customer, dueDate, parts, source: fromFile ? "excel" : "manual" });
    if (!parsed.success) {
      setErrors(issueMap(parsed.error));
      setFormError("Fix the highlighted fields and try again.");
      return;
    }
    setErrors({});
    startTransition(async () => {
      const res = await createRfqManualAction(parsed.data);
      if (res.ok) router.push(`/rfqs/${res.rfqId}`);
      else setFormError(res.error);
    });
  }

  const partErrors = (i: number): PartErrors => ({
    name: errors[`parts.${i}.name`], partNumber: errors[`parts.${i}.partNumber`], drawingRef: errors[`parts.${i}.drawingRef`], grossWeightKg: errors[`parts.${i}.grossWeightKg`], netWeightKg: errors[`parts.${i}.netWeightKg`], annualVolume: errors[`parts.${i}.annualVolume`],
  });

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {formError ? <Alert variant="destructive" role="alert"><AlertDescription>{formError}</AlertDescription></Alert> : null}
      <Card className="space-y-4 p-5">
        <h2 className="font-medium">RFQ details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <NumField label="Customer" inputMode="text" value={customer} onChange={setCustomer} list="customers" error={errors.customer} hint="Pick an existing customer or type a new one." />
            <datalist id="customers">{customers.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <NumField label="Quote due date" inputMode="text" value={dueDate} onChange={setDueDate} error={errors.dueDate} hint="YYYY-MM-DD" />
        </div>
      </Card>
      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-medium">Parts</h2>
          <span className="text-xs text-muted-foreground">{parts.length} of {MAX_PARTS_PER_RFQ}</span>
        </div>
        <PartListImport onUse={(list) => { setParts(list); setFromFile(true); setErrors({}); }} />
        <p className="text-sm text-muted-foreground">Weights and volume can be left blank and filled in on the costing screen.</p>
        {errors.parts ? <p role="alert" className="text-sm text-destructive">{errors.parts}</p> : null}
        {parts.map((p, i) => (
          <PartEditor key={i} index={i} value={p} errors={partErrors(i)} materials={materials}
            onChange={(next) => setParts((all) => all.map((x, idx) => (idx === i ? next : x)))}
            onRemove={parts.length > 1 ? () => setParts((all) => all.filter((_, idx) => idx !== i)) : undefined} />
        ))}
        <Button type="button" variant="outline" size="sm" disabled={parts.length >= MAX_PARTS_PER_RFQ} onClick={() => setParts((all) => [...all, { ...EMPTY_PART }])}>
          <Plus /> Add another part
        </Button>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create RFQ"}</Button>
        <Button type="button" variant="outline" onClick={() => router.push("/rfqs")} disabled={pending}>Cancel</Button>
      </div>
    </form>
  );
}
