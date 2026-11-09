"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { NumField } from "@/components/costing/fields";
import { EMPTY_PART, PartEditor, type PartErrors } from "@/components/rfq/PartEditor";
import { issueMap } from "@/components/rfq/NewRfqForm";
import { StatusBadge } from "@/components/rfq/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatNumberIndian } from "@/lib/format/currency";
import { formatDate } from "@/lib/format/dates";
import { MAX_PARTS_PER_RFQ, addPartSchema, updateRfqSchema, type PartDraft } from "@/lib/rfq/manage";
import { isOverdue } from "@/lib/rfq/overdue";
import type { RfqDetail } from "@/server/repositories/rfq-manage";
import { addPartAction, removePartAction, renamePartAction, updateRfqAction } from "@/server/actions/rfqs";

interface Props { rfq: RfqDetail; today: string; canEdit: boolean; canCost: boolean; materials: string[] }

const VERSION_LABEL: Record<string, string> = { draft: "Draft", pending_approval: "Pending approval", approved: "Approved", rejected: "Rejected", ready_to_send: "Ready to send", sent: "Sent" };

export function RfqDetailView({ rfq, today, canEdit, canCost, materials }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const editable = canEdit && rfq.status === "estimating";
  const overdue = isOverdue(rfq.status, rfq.dueDate, today);

  function run(work: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await work();
      if (res.ok) router.refresh();
      else setError(res.error ?? "Something went wrong.");
    });
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Owner {rfq.owner}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{rfq.rfqNo} · {rfq.customer}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge status={rfq.status} />
            {overdue ? <Badge variant="warning">Overdue</Badge> : null}
            <span className="text-muted-foreground">Due {formatDate(rfq.dueDate)}</span>
            {rfq.status === "lost" && rfq.lostReason ? <span className="text-muted-foreground">Lost: {rfq.lostReason}</span> : null}
          </div>
        </div>
        {editable ? <EditRfqDialog rfq={rfq} onDone={() => router.refresh()} /> : null}
      </header>

      {!editable && canEdit ? <p className="text-sm text-muted-foreground">This RFQ is {rfq.status}, so its details and parts are locked.</p> : null}
      {error ? <p role="alert" className="rounded-lg border border-destructive/30 px-4 py-3 text-sm text-destructive">{error}</p> : null}

      <Card className="p-0">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
          <h2 className="font-medium">Parts ({rfq.parts.length})</h2>
          {editable ? <AddPartDialog rfqId={rfq.id} materials={materials} disabled={rfq.parts.length >= MAX_PARTS_PER_RFQ} onDone={() => router.refresh()} /> : null}
        </div>
        <ul className="divide-y">
          {rfq.parts.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="font-medium">{p.name}{p.partNumber ? <span className="num ml-2 text-sm font-normal text-muted-foreground">{p.partNumber}</span> : null}</p>
                {p.drawingRef ? <p className="text-xs text-muted-foreground">Drawing {p.drawingRef}</p> : null}
                <p className="num text-sm text-muted-foreground">
                  {p.materialCode ?? "Material not set"} · gross {p.grossWeightKg ?? "–"} kg · net {p.netWeightKg ?? "–"} kg · {p.annualVolume === null ? "volume not set" : `${formatNumberIndian(p.annualVolume).replace(/\.00$/, "")} pcs/yr`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {p.latest ? <>Version {p.latest.version}, {VERSION_LABEL[p.latest.status] ?? p.latest.status} · ₹ {formatNumberIndian(p.latest.annualValue)} a year{p.latest.requiresApproval ? " · needs approval" : ""}</> : "No quote saved yet"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {editable ? <RenamePartDialog name={p.name} onSave={(name) => run(() => renamePartAction({ partId: p.id, name }))} /> : null}
                {editable ? (
                  <Button variant="ghost" size="icon" aria-label={`Remove ${p.name}`} disabled={pending || p.quoteCount > 0 || rfq.parts.length <= 1} title={p.quoteCount > 0 ? "Has saved quote versions" : rfq.parts.length <= 1 ? "An RFQ needs a part" : undefined}
                    onClick={() => run(() => removePartAction({ partId: p.id }))}><Trash2 /></Button>
                ) : null}
                {p.latest ? <Button asChild variant="outline" size="sm"><Link href={`/quotes/${p.latest.id}`}>Latest quote</Link></Button> : null}
                <Button asChild size="sm"><Link href={`/rfqs/${rfq.id}/parts/${p.id}`} aria-label={`${canCost && rfq.status === "estimating" ? "Cost" : "Open"} ${p.name}`}>{canCost && rfq.status === "estimating" ? "Cost" : "Open"}</Link></Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function EditRfqDialog({ rfq, onDone }: { rfq: RfqDetail; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [customer, setCustomer] = useState(rfq.customer);
  const [dueDate, setDueDate] = useState(rfq.dueDate);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setFormError(null);
    const parsed = updateRfqSchema.safeParse({ rfqId: rfq.id, customer, dueDate });
    if (!parsed.success) return setErrors(issueMap(parsed.error));
    setErrors({});
    startTransition(async () => {
      const res = await updateRfqAction(parsed.data);
      if (res.ok) { setOpen(false); onDone(); } else setFormError(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline"><Pencil /> Edit RFQ</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit RFQ</DialogTitle><DialogDescription>Change the customer or the quote due date.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <NumField label="Customer" inputMode="text" value={customer} onChange={setCustomer} error={errors.customer} />
          <NumField label="Quote due date" inputMode="text" value={dueDate} onChange={setDueDate} error={errors.dueDate} hint="YYYY-MM-DD" />
          {formError ? <p role="alert" className="text-sm text-destructive">{formError}</p> : null}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddPartDialog({ rfqId, materials, disabled, onDone }: { rfqId: string; materials: string[]; disabled: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [part, setPart] = useState<PartDraft>({ ...EMPTY_PART });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setFormError(null);
    const parsed = addPartSchema.safeParse({ rfqId, part });
    if (!parsed.success) return setErrors(issueMap(parsed.error));
    setErrors({});
    startTransition(async () => {
      const res = await addPartAction(parsed.data);
      if (res.ok) { setOpen(false); setPart({ ...EMPTY_PART }); onDone(); } else setFormError(res.error);
    });
  }
  const partErrors: PartErrors = { name: errors["part.name"], grossWeightKg: errors["part.grossWeightKg"], netWeightKg: errors["part.netWeightKg"], annualVolume: errors["part.annualVolume"], partNumber: errors["part.partNumber"], drawingRef: errors["part.drawingRef"] };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" size="sm" disabled={disabled}><Plus /> Add part</Button></DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader><DialogTitle>Add a part</DialogTitle><DialogDescription>Weights and volume can be filled in later on the costing screen.</DialogDescription></DialogHeader>
        <PartEditor index={0} value={part} errors={partErrors} materials={materials} onChange={setPart} />
        {formError ? <p role="alert" className="text-sm text-destructive">{formError}</p> : null}
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={pending}>{pending ? "Adding…" : "Add part"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenamePartDialog({ name, onSave }: { name: string; onSave: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(name);
  const empty = value.trim() === "";
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setValue(name); }}>
      <DialogTrigger asChild><Button variant="ghost" size="icon" aria-label={`Rename ${name}`}><Pencil /></Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Rename part</DialogTitle><DialogDescription>Only the name changes. Saved quotes keep their values.</DialogDescription></DialogHeader>
        <NumField label="Part name" inputMode="text" value={value} onChange={setValue} error={empty ? "Part name is required" : undefined} />
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={empty} onClick={() => { setOpen(false); onSave(value.trim()); }}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
