"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { NumField, SELECT_CLASS, SelectField, SourceTag } from "./fields";
import { PriceTable, RatesUsed, ThresholdNotice } from "./PriceTable";
import { SubmitDialog, VersionsDialog } from "./Dialogs";
import { computeCosting, initialForm, type CostingForm } from "@/lib/costing/form";
import { FIELD_LABELS } from "@/lib/costing/fields";
import type { EditablePartField } from "@/lib/costing/schemas";
import { stepsToFormRows, type RoutingSuggestion } from "@/lib/costing/routing-suggestion";
import { suggestRoutingAction } from "@/server/actions/past-quotes";
import { formatNumberIndian } from "@/lib/format/currency";
import { formatDate } from "@/lib/format/dates";
import type { PartForCosting } from "@/server/repositories/parts";
import type { AllRates } from "@/server/repositories/rates";
import { acceptPartFieldAction, saveQuoteVersionAction, submitQuoteAction, updatePartFieldAction } from "@/server/actions/costing";

interface Props {
  part: PartForCosting;
  rates: AllRates;
  today: string;
  canEdit: boolean;
  canSubmit: boolean;
}

const PART_FIELDS: EditablePartField[] = ["materialCode", "grossWeightKg", "netWeightKg", "annualVolume"];

/** Fixed key order so "has anything changed since the last save" is a plain string comparison. */
const canon = (f: CostingForm) =>
  JSON.stringify([f.quotedOn, f.materialCode, f.grossWeightKg, f.netWeightKg, f.annualVolume, f.setupCost, f.toolingCost, f.routing.map((r) => [r.operation, r.machineCode, r.cycleTimeMin]), f.scrapPercent, f.overheadPercent, f.packingPerUnit, f.freightPerUnit, f.markupPercent, f.gstPercent]);

export function CostingWorkspace({ part, rates, today, canEdit, canSubmit }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<CostingForm>(() => initialForm(part, part.latestInputs, rates, today));
  const [savedKey, setSavedKey] = useState<string | null>(() => (part.latestInputs ? canon(part.latestInputs) : null));
  const [fieldStates, setFieldStates] = useState(part.fields);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<EditablePartField, string>>>({});
  const [sameFreight, setSameFreight] = useState(() => {
    const f = initialForm(part, part.latestInputs, rates, today).freightPerUnit;
    return f[0] === f[1] && f[1] === f[2];
  });
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [suggestion, setSuggestion] = useState<{ state: "idle" } | { state: "loading" } | { state: "none" } | { state: "error"; text: string } | { state: "ready"; value: RoutingSuggestion }>({ state: "idle" });
  const persisted = useRef<Record<EditablePartField, string>>({
    materialCode: part.materialCode ?? "",
    grossWeightKg: part.grossWeightKg ?? "",
    netWeightKg: part.netWeightKg ?? "",
    annualVolume: part.annualVolume === null ? "" : String(part.annualVolume),
  });

  const result = useMemo(() => computeCosting(form, rates), [form, rates]);
  const dirty = canon(form) !== savedKey;
  const latest = part.versions[0] ?? null;
  const unaccepted = PART_FIELDS.filter((f) => fieldStates[f]?.aiFilled && !fieldStates[f]?.accepted);

  const materials = [...new Set(rates.materials.map((r) => r.materialCode))];
  const machines = [...new Set(rates.machines.map((r) => r.machineCode))];
  async function askForSuggestion() {
    setSuggestion({ state: "loading" });
    const res = await suggestRoutingAction({ materialCode: form.materialCode, grossWeightKg: form.grossWeightKg });
    if (!res.ok) setSuggestion({ state: "error", text: res.error });
    else setSuggestion(res.suggestion ? { state: "ready", value: res.suggestion } : { state: "none" });
  }
  function applySuggestion(value: RoutingSuggestion) {
    const { rows, unknownMachines } = stepsToFormRows(value.steps, machines);
    setForm((f) => ({ ...f, routing: rows }));
    setSuggestion({ state: "idle" });
    setNotice({
      tone: "success",
      text: `Routing copied from ${value.reference.partName} (${value.reference.quoteRef}). Check every operation before saving.${unknownMachines.length ? ` No current rate for ${unknownMachines.join(", ")}; choose a machine.` : ""}`,
    });
  }
  const set = <K extends keyof CostingForm>(key: K, value: CostingForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  function setRouting(i: number, patch: Partial<CostingForm["routing"][number]>) {
    setForm((f) => ({ ...f, routing: f.routing.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) }));
  }

  /** Part values persist as soon as the field is left, and become the person's own (Manual, accepted). */
  function commitField(field: EditablePartField) {
    const value = form[field].trim();
    if (!canEdit || value === persisted.current[field] || value === "") return;
    startTransition(async () => {
      const res = await updatePartFieldAction({ partId: part.id, field, value });
      if (res.ok) {
        persisted.current[field] = value;
        setFieldErrors((e) => ({ ...e, [field]: undefined }));
        setFieldStates((s) => ({ ...s, [field]: { source: "manual", aiFilled: false, accepted: true } }));
      } else {
        setFieldErrors((e) => ({ ...e, [field]: res.error }));
      }
    });
  }

  function accept(field: EditablePartField) {
    startTransition(async () => {
      const res = await acceptPartFieldAction({ partId: part.id, field });
      if (res.ok) setFieldStates((s) => ({ ...s, [field]: { ...s[field]!, accepted: true } }));
      else setNotice({ tone: "error", text: res.error });
    });
  }

  function save() {
    startTransition(async () => {
      const res = await saveQuoteVersionAction({ partId: part.id, form });
      if (res.ok) {
        setSavedKey(canon(form));
        setNotice({ tone: "success", text: `Saved as version ${res.version}.` });
        router.refresh();
      } else {
        setNotice({ tone: "error", text: res.error });
      }
    });
  }

  async function submit() {
    if (!latest) return { ok: false as const, error: "Save a version first." };
    const res = await submitQuoteAction({ quoteId: latest.id });
    if (res.ok) router.refresh();
    return res;
  }

  const sourceTag = (f: EditablePartField) => {
    const s = fieldStates[f];
    return s ? <SourceTag source={s.source} aiFilled={s.aiFilled} accepted={s.accepted} canEdit={canEdit} onAccept={() => accept(f)} pending={pending} /> : null;
  };

  const base = result.ok ? result.cost.tiers[1]! : null;
  const submitBlockers = [
    ...(dirty ? ["You have unsaved changes. Save a version first."] : []),
    ...(!latest ? ["No version saved yet."] : []),
    ...(unaccepted.length ? [`Review and accept: ${unaccepted.map((f) => FIELD_LABELS[f]).join(", ")}.`] : []),
    ...(!result.ok ? [result.message] : []),
    ...(latest && latest.status !== "draft" ? [`Version ${latest.version} is already ${latest.status.replace("_", " ")}. Save a new version to change it.`] : []),
  ];

  return (
    <div className="space-y-5 pb-24 lg:pb-0">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{part.rfq.rfqNo} · {part.rfq.customer} · due {formatDate(part.rfq.dueDate)}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{part.name}</h1>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {latest ? <Badge variant="outline">Version {latest.version}, {latest.status.replace("_", " ")}</Badge> : <Badge variant="outline">No version saved</Badge>}
            {dirty && canEdit ? <Badge variant="warning">Unsaved changes</Badge> : null}
            {!canEdit ? <Badge variant="secondary">View only</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <VersionsDialog versions={part.versions} />
          {canEdit ? <Button onClick={save} disabled={pending || !result.ok || !dirty}>{pending ? "Saving…" : "Save version"}</Button> : null}
          {canSubmit ? <SubmitDialog blockers={submitBlockers} requiresApproval={latest?.requiresApproval ?? false} version={latest?.version ?? 0} onSubmit={submit} /> : null}
        </div>
      </header>

      {notice ? (
        <Alert variant={notice.tone === "error" ? "destructive" : "default"} role={notice.tone === "error" ? "alert" : "status"}>
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <Card className="h-fit space-y-4 p-5">
          <h2 className="font-medium">Part details</h2>
          <SelectField label="Material" value={form.materialCode} onChange={(v) => set("materialCode", v)} options={materials} disabled={!canEdit} extra={sourceTag("materialCode")} onBlur={() => commitField("materialCode")} />
          {fieldErrors.materialCode ? <p role="alert" className="-mt-2 text-xs text-destructive">{fieldErrors.materialCode}</p> : null}
          <NumField label="Gross weight" suffix="kg" value={form.grossWeightKg} onChange={(v) => set("grossWeightKg", v)} onBlur={() => commitField("grossWeightKg")} readOnly={!canEdit} error={fieldErrors.grossWeightKg} extra={sourceTag("grossWeightKg")} />
          <NumField label="Net weight" suffix="kg" value={form.netWeightKg} onChange={(v) => set("netWeightKg", v)} onBlur={() => commitField("netWeightKg")} readOnly={!canEdit} error={fieldErrors.netWeightKg} extra={sourceTag("netWeightKg")} />
          <NumField label="Annual volume" suffix="pcs" inputMode="numeric" value={form.annualVolume} onChange={(v) => set("annualVolume", v)} onBlur={() => commitField("annualVolume")} readOnly={!canEdit} error={fieldErrors.annualVolume} extra={sourceTag("annualVolume")} />
          <NumField label="Setup cost (one-off)" prefix="₹" value={form.setupCost} onChange={(v) => set("setupCost", v)} readOnly={!canEdit} />
          <NumField label="Tooling cost (one-off)" prefix="₹" value={form.toolingCost} onChange={(v) => set("toolingCost", v)} readOnly={!canEdit} hint="Setup and tooling are spread over each tier's volume." />
          {form.materialCode && form.grossWeightKg ? <Link className="text-sm text-primary underline-offset-4 hover:underline" href={`/past-quotes?material=${encodeURIComponent(form.materialCode)}&weight=${encodeURIComponent(form.grossWeightKg)}`}>See similar past quotes</Link> : null}
        </Card>

        <div className="space-y-5">
          <Card className="space-y-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-medium">Routing</h2>
              {canEdit ? (
                <Button type="button" variant="outline" size="sm" onClick={askForSuggestion} disabled={suggestion.state === "loading" || !form.materialCode || !form.grossWeightKg} title={!form.materialCode || !form.grossWeightKg ? "Enter material and gross weight first" : undefined}>
                  {suggestion.state === "loading" ? "Looking…" : "Suggest from past quotes"}
                </Button>
              ) : null}
            </div>
            {suggestion.state === "none" ? <p role="status" className="rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">No past quote of the same material within 10% of this weight. Enter the routing yourself.</p> : null}
            {suggestion.state === "error" ? <p role="alert" className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">{suggestion.text}</p> : null}
            {suggestion.state === "ready" ? (
              <div role="region" aria-label="Routing suggestion" className="space-y-3 rounded-lg border border-accent/60 bg-accent/10 p-4 text-sm">
                <p><span className="font-medium">Suggestion, not applied.</span> Based on <span className="font-medium">{suggestion.value.reference.partName}</span>{suggestion.value.reference.partNumber ? ` (${suggestion.value.reference.partNumber})` : ""} for {suggestion.value.reference.customer}, quote {suggestion.value.reference.quoteRef} of {formatDate(suggestion.value.reference.quotedOn)}, {suggestion.value.reference.materialCode}, {Number(suggestion.value.reference.grossWeightKg)} kg.</p>
                <ul className="space-y-1 text-muted-foreground">{suggestion.value.steps.map((st, k) => <li key={k}>{st.operation} on {st.machineCode}, {Number(st.cycleTimeMin)} min</li>)}</ul>
                <p className="text-xs text-muted-foreground">Cycle times are from that older part, not this one. Review them before use.</p>
                <div className="flex gap-2"><Button type="button" size="sm" onClick={() => applySuggestion(suggestion.value)}>Use as starting routing</Button><Button type="button" size="sm" variant="ghost" onClick={() => setSuggestion({ state: "idle" })}>Dismiss</Button></div>
              </div>
            ) : null}
            <div className="space-y-3">
              {form.routing.map((row, i) => (
                <div key={i} className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[1.3fr_1fr_6rem_6.5rem_auto]">
                  <NumField label={i === 0 ? "Operation" : `Operation ${i + 1}`} inputMode="text" value={row.operation} onChange={(v) => setRouting(i, { operation: v })} readOnly={!canEdit} />
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`machine-${i}`}>Machine</Label>
                    <select id={`machine-${i}`} className={SELECT_CLASS} value={row.machineCode} disabled={!canEdit} onChange={(e) => setRouting(i, { machineCode: e.target.value })}>
                      <option value="">Choose…</option>
                      {machines.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <NumField label="Cycle" suffix="min" value={row.cycleTimeMin} onChange={(v) => setRouting(i, { cycleTimeMin: v })} readOnly={!canEdit} />
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium">₹ per piece</span>
                    <span className="num flex h-9 items-center justify-end text-sm">{result.ok ? formatNumberIndian(result.routingLines[i]!.costPerPiece.toFixed(2)) : "–"}</span>
                  </div>
                  {canEdit ? (
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove operation ${i + 1}`} disabled={form.routing.length === 1} onClick={() => setForm((f) => ({ ...f, routing: f.routing.filter((_, idx) => idx !== i) }))}>
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
            {canEdit ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setForm((f) => ({ ...f, routing: [...f.routing, { operation: "", machineCode: "", cycleTimeMin: "" }] }))}>
                <Plus /> Add operation
              </Button>
            ) : null}
          </Card>

          <Card className="space-y-4 p-5">
            <h2 className="font-medium">Assumptions</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <NumField label="Scrap allowance" suffix="%" value={form.scrapPercent} onChange={(v) => set("scrapPercent", v)} readOnly={!canEdit} hint="Extra material, not applied to conversion." />
              <NumField label="Overhead" suffix="%" value={form.overheadPercent} onChange={(v) => set("overheadPercent", v)} readOnly={!canEdit}
                hint={result.ok && result.overheadOverridden ? `Overridden. Rate master is ${Number(result.overheadMaster.percent)}%.` : "From the rate master."} />
              <NumField label="Packing per unit" prefix="₹" value={form.packingPerUnit} onChange={(v) => set("packingPerUnit", v)} readOnly={!canEdit} />
              <NumField label="Markup on cost" suffix="%" value={form.markupPercent} onChange={(v) => set("markupPercent", v)} readOnly={!canEdit} hint="Markup on cost, not gross margin." />
              <NumField label="GST" suffix="%" value={form.gstPercent} onChange={(v) => set("gstPercent", v)} readOnly={!canEdit} />
              <NumField label="Quote date" inputMode="text" value={form.quotedOn} onChange={(v) => set("quotedOn", v)} readOnly={!canEdit} hint="Rates are looked up for this date (YYYY-MM-DD)." />
            </div>
            <div className="flex items-center gap-3">
              <Switch id="same-freight" checked={sameFreight} disabled={!canEdit} onCheckedChange={(on) => { setSameFreight(on); if (on) set("freightPerUnit", [form.freightPerUnit[1], form.freightPerUnit[1], form.freightPerUnit[1]]); }} />
              <Label htmlFor="same-freight">Same freight for all three volumes</Label>
            </div>
            <div className={`grid gap-4 ${sameFreight ? "sm:grid-cols-3" : "sm:grid-cols-3"}`}>
              {sameFreight ? (
                <NumField label="Freight per unit" prefix="₹" value={form.freightPerUnit[1]} onChange={(v) => set("freightPerUnit", [v, v, v])} readOnly={!canEdit} />
              ) : (
                form.freightPerUnit.map((v, i) => (
                  <NumField key={i} label={`Freight at ${["0.5×", "1×", "1.5×"][i]} volume`} prefix="₹" value={v} readOnly={!canEdit}
                    onChange={(nv) => set("freightPerUnit", form.freightPerUnit.map((x, idx) => (idx === i ? nv : x)) as CostingForm["freightPerUnit"])} />
                ))
              )}
            </div>
          </Card>

          <Card className="space-y-4 p-5">
            <h2 className="font-medium">Price</h2>
            {result.ok ? (
              <>
                <ThresholdNotice baseAnnualValue={result.cost.baseAnnualValue.toFixed(2)} requires={result.cost.requiresApproval} />
                <PriceTable result={result} markupPercent={form.markupPercent} gstPercent={form.gstPercent} />
                <details className="rounded-lg border px-4 py-3">
                  <summary className="cursor-pointer text-sm font-medium">Rates used</summary>
                  <div className="mt-3"><RatesUsed result={result} quotedOn={form.quotedOn} /></div>
                </details>
              </>
            ) : (
              <div role="status" className="rounded-lg border border-dashed px-4 py-8 text-center text-sm">
                <p className="font-medium">Price not ready</p>
                <p className="mt-1 text-muted-foreground">{result.message}</p>
              </div>
            )}
          </Card>
        </div>
      </div>

      {base && result.ok ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">1× price per unit</span>
            <span className="num font-semibold">₹ {formatNumberIndian(base.pricePerUnit.toFixed(2))}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Annual value, excl. GST</span>
            <span className="num">₹ {formatNumberIndian(base.annualValue.toFixed(2))}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
