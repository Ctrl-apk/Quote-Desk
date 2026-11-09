"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { NumField } from "@/components/costing/fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { SELECT_CLASS } from "@/components/costing/fields";
import { MAX_EMAIL_LENGTH, type Extraction, type IntakeField, type ProviderInfo } from "@/lib/intake";
import { createRfqAction, extractAction } from "@/server/actions/intake";

interface Props { customers: string[]; defaultDue: string }

type Values = { customer: string; dueDate: string; name: string; partNumber: string; drawingRef: string; materialCode: string; grossWeightKg: string; netWeightKg: string; annualVolume: string };
const EMPTY: Values = { customer: "", dueDate: "", name: "", partNumber: "", drawingRef: "", materialCode: "", grossWeightKg: "", netWeightKg: "", annualVolume: "" };

const SAMPLE = "Subject: RFQ for rear wheel spindle\n\nPlease quote the rear wheel spindle, EN8, gross weight 0.61 kg, annual volume 180000 pieces. Quote needed within a week.";

export function IntakeDesk({ customers, defaultDue }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [values, setValues] = useState<Values>({ ...EMPTY, dueDate: defaultDue });
  const [extracted, setExtracted] = useState<{ provider: ProviderInfo; extraction: Extraction; warnings: string[] } | null>(null);
  const [suggested, setSuggested] = useState<Partial<Values>>({});
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof Values) => (v: string) => setValues((s) => ({ ...s, [k]: v }));

  function extract() {
    setError(null);
    start(async () => {
      const res = await extractAction({ email });
      if (!res.ok) { setError(res.error); setExtracted(null); return; }
      const e = res.extraction;
      const next: Partial<Values> = { name: e.partName?.value, partNumber: e.partNumber?.value, drawingRef: e.drawingRef?.value, materialCode: e.materialCode?.value, grossWeightKg: e.grossWeightKg?.value, netWeightKg: e.netWeightKg?.value, annualVolume: e.annualVolume?.value, dueDate: e.dueDate?.value };
      setSuggested(next);
      setValues((s) => ({ ...s, ...Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined)) }));
      setExtracted({ provider: res.provider, extraction: e, warnings: res.warnings });
    });
  }

  function create() {
    setError(null); setFieldError(null);
    start(async () => {
      const res = await createRfqAction({
        customer: values.customer, dueDate: values.dueDate, sourceEmail: email || undefined,
        part: { name: values.name, partNumber: values.partNumber, drawingRef: values.drawingRef, materialCode: values.materialCode, grossWeightKg: values.grossWeightKg, netWeightKg: values.netWeightKg, annualVolume: values.annualVolume },
        suggested: { name: suggested.name, materialCode: suggested.materialCode, grossWeightKg: suggested.grossWeightKg, netWeightKg: suggested.netWeightKg, annualVolume: suggested.annualVolume },
      });
      if (res.ok) router.push(`/rfqs/${res.rfqId}/parts/${res.partId}`);
      else { setError(res.error); setFieldError(res.field ?? null); }
    });
  }

  const evidence = (f: IntakeField) => extracted?.extraction[f]?.evidence;
  const note = (f: IntakeField, key: keyof Values) => {
    if (!extracted) return undefined;
    const ev = evidence(f);
    if (!ev) return "Not found in the email. Enter it yourself.";
    if (values[key] !== suggested[key]) return "You changed this value, so it counts as your own.";
    const identifier = f === "partNumber" || f === "drawingRef";
    return <>From the email: “{ev}”. {identifier ? "It does not affect price. Check it against the drawing." : "Stays unreviewed until you accept it on the costing screen."}</>;
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium">1. Paste the RFQ email</h2>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEmail(SAMPLE)}>Use sample</Button>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email text</Label>
          <textarea id="email" value={email} onChange={(e) => setEmail(e.target.value)} rows={12} maxLength={MAX_EMAIL_LENGTH} className={`${SELECT_CLASS} h-auto resize-y py-2 font-mono text-xs`} placeholder="Paste the customer's email here" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={extract} disabled={pending || email.trim().length < 10}>{pending && !extracted ? "Reading…" : "Read email"}</Button>
          <p className="text-xs text-muted-foreground">Nothing is saved until you create the RFQ.</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Reads pasted email text only. Drawing PDFs and images are not read: type a title block&apos;s values in yourself. For a part list in Excel, use <Link href="/rfqs/new" className="underline">New RFQ</Link>.
        </p>
        {error && !extracted ? <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert> : null}
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="font-medium">2. Check the details</h2>
        <AnimatePresence>
          {extracted ? (
            <motion.div key="prov" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={extracted.provider.id === "mock" ? "warning" : "info"}>{extracted.provider.label}</Badge>
                <span className="text-xs text-muted-foreground">{extracted.provider.description}</span>
              </div>
              {extracted.warnings.map((w) => <p key={w} role="status" className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">{w}</p>)}
            </motion.div>
          ) : (
            <p className="text-sm text-muted-foreground">You can also skip reading and fill everything by hand.</p>
          )}
        </AnimatePresence>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customer">Customer</Label>
          <input id="customer" list="customers" value={values.customer} onChange={(e) => set("customer")(e.target.value)} maxLength={80} className={SELECT_CLASS} autoComplete="off" />
          <datalist id="customers">{customers.map((c) => <option key={c} value={c} />)}</datalist>
          <p className="text-xs text-muted-foreground">Pick an existing customer or type a new one.</p>
        </div>
        <NumField label="Part name" inputMode="text" value={values.name} onChange={set("name")} hint={note("partName", "name")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <NumField label="Part number" inputMode="text" value={values.partNumber} onChange={set("partNumber")} hint={note("partNumber", "partNumber") ?? undefined} />
          <NumField label="Drawing reference" inputMode="text" value={values.drawingRef} onChange={set("drawingRef")} hint={note("drawingRef", "drawingRef") ?? undefined} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumField label="Material" inputMode="text" value={values.materialCode} onChange={set("materialCode")} hint={note("materialCode", "materialCode")} />
          <NumField label="Annual volume" inputMode="numeric" suffix="pcs" value={values.annualVolume} onChange={set("annualVolume")} hint={note("annualVolume", "annualVolume")} />
          <NumField label="Gross weight" suffix="kg" value={values.grossWeightKg} onChange={set("grossWeightKg")} hint={note("grossWeightKg", "grossWeightKg")} />
          <NumField label="Net weight" suffix="kg" value={values.netWeightKg} onChange={set("netWeightKg")} hint={note("netWeightKg", "netWeightKg")} error={fieldError === "part.netWeightKg" ? error ?? undefined : undefined} />
        </div>
        <NumField label="Quote due" inputMode="text" value={values.dueDate} onChange={set("dueDate")} hint={note("dueDate", "dueDate") ?? "YYYY-MM-DD"} error={fieldError === "dueDate" ? error ?? undefined : undefined} />
        {error && extracted && fieldError !== "dueDate" && fieldError !== "part.netWeightKg" ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {error && !extracted && values.customer ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button onClick={create} disabled={pending || !values.customer.trim() || !values.name.trim()}>{pending && extracted ? "Creating…" : "Create RFQ and start costing"}</Button>
      </Card>
    </div>
  );
}
