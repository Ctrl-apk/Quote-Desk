"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatRupees } from "@/lib/format/currency";
import { formatDateTimeIst } from "@/lib/format/dates";
import type { QuoteSummary } from "@/server/repositories/parts";

export function VersionsDialog({ versions }: { versions: QuoteSummary[] }) {
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="outline">Versions ({versions.length})</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Saved versions</DialogTitle>
          <DialogDescription>Every save is a new version. Earlier versions are never changed.</DialogDescription>
        </DialogHeader>
        {versions.length === 0 ? <p className="text-sm text-muted-foreground">Nothing saved yet.</p> : (
          <ul className="divide-y text-sm">
            {versions.map((v) => (
              <li key={v.id} className="flex items-start justify-between gap-3 py-3">
                <div>
                  <p className="font-medium"><Link href={`/quotes/${v.id}`} className="text-primary underline-offset-4 hover:underline">Version {v.version}</Link> <Badge variant="outline" className="ml-1">{v.status.replace("_", " ")}</Badge></p>
                  <p className="text-xs text-muted-foreground">{formatDateTimeIst(v.createdAt)} · {v.createdBy}</p>
                </div>
                <div className="text-right">
                  <p className="num">{formatRupees(v.annualValue)}</p>
                  <p className="text-xs text-muted-foreground">{v.requiresApproval ? "Needs approval" : "No approval needed"}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function SubmitDialog({ blockers, requiresApproval, version, onSubmit }: {
  blockers: string[]; requiresApproval: boolean; version: number;
  onSubmit: () => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = requiresApproval ? "Submit for approval" : "Submit quote";

  async function confirm() {
    setBusy(true);
    setError(null);
    const res = await onSubmit();
    setBusy(false);
    if (res.ok) setOpen(false);
    else setError(res.error);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(null); }}>
      <DialogTrigger asChild><Button variant="secondary">{label}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            {requiresApproval ? `Version ${version} is above the approval threshold, so the sales head must approve it and then send it.` : `Version ${version} is within the approval threshold, so no approval is needed. The sales head will send it to the customer.`}
          </DialogDescription>
        </DialogHeader>
        {blockers.length ? (
          <div role="alert" className="rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
            <p className="font-medium">Not ready yet</p>
            <ul className="mt-1 list-disc pl-5">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
          </div>
        ) : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={confirm} disabled={busy || blockers.length > 0}>{busy ? "Working…" : label}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
