"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { SELECT_CLASS } from "@/components/costing/fields";
import { decideQuoteAction, markOutcomeAction, sendQuoteAction } from "@/server/actions/quotes";

type Mode = "approve" | "reject" | "won" | "lost" | null;

export function QuoteActions({ quoteId, canDecide, canSend, canClose, canPdf }: { quoteId: string; canDecide: boolean; canSend: boolean; canClose: boolean; canPdf: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const close = () => { setMode(null); setText(""); setError(null); };

  function run(work: () => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      const res = await work();
      if (res.ok) { close(); router.refresh(); } else setError(res.error ?? "Something went wrong.");
    });
  }
  const confirm = () => {
    if (mode === "approve" || mode === "reject") run(() => decideQuoteAction({ quoteId, action: mode, comment: text }));
    else if (mode === "won" || mode === "lost") run(() => markOutcomeAction({ quoteId, outcome: mode, reason: text }));
  };

  const copy: Record<Exclude<Mode, null>, { title: string; hint: string; label: string; needsText: boolean }> = {
    approve: { title: "Approve this quote", hint: "It can then be sent to the customer. A note is optional.", label: "Note (optional)", needsText: false },
    reject: { title: "Reject this quote", hint: "The estimator will see your reason and can save a new version.", label: "Reason", needsText: true },
    won: { title: "Mark as won", hint: "The RFQ will be closed as won.", label: "Note (optional)", needsText: false },
    lost: { title: "Mark as lost", hint: "Record why, so the next quote can learn from it.", label: "Reason", needsText: true },
  };
  const c = mode ? copy[mode] : null;

  return (
    <div className="flex flex-wrap gap-2">
      {canPdf ? <Button asChild variant="outline"><a href={`/api/quotes/${quoteId}/pdf`}><Download /> Customer PDF</a></Button> : null}
      {canDecide ? <><Button onClick={() => setMode("approve")}>Approve</Button><Button variant="outline" onClick={() => setMode("reject")}>Reject</Button></> : null}
      {canSend ? <Button disabled={pending} onClick={() => run(() => sendQuoteAction({ quoteId }))}>{pending ? "Sending…" : "Send quote"}</Button> : null}
      {canClose ? <><Button variant="secondary" onClick={() => setMode("won")}>Mark won</Button><Button variant="outline" onClick={() => setMode("lost")}>Mark lost</Button></> : null}
      {error && !mode ? <p role="alert" className="basis-full text-sm text-destructive">{error}</p> : null}

      <Dialog open={mode !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          {c ? (
            <>
              <DialogHeader><DialogTitle>{c.title}</DialogTitle><DialogDescription>{c.hint}</DialogDescription></DialogHeader>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="note">{c.label}</Label>
                <textarea id="note" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={500} className={`${SELECT_CLASS} h-auto py-2`} />
              </div>
              {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
              <DialogFooter>
                <Button variant="outline" onClick={close}>Cancel</Button>
                <Button variant={mode === "reject" || mode === "lost" ? "destructive" : "default"} onClick={confirm} disabled={pending || (c.needsText && text.trim().length < 3)}>{pending ? "Working…" : c.title.split(" ")[0] === "Mark" ? "Confirm" : c.title.split(" ")[0]}</Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
