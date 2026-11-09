"use client";

import { Upload } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MAX_PARTS_PER_RFQ, type PartDraft } from "@/lib/rfq/manage";
import type { PartListReport } from "@/lib/intake/part-list";
import { previewPartListAction } from "@/server/actions/rfqs";

/**
 * Reads a customer's Excel/CSV part list and offers its valid rows as parts. Nothing is saved here and
 * nothing is guessed: the parts land in the form below for the estimator to review and edit.
 */
export function PartListImport({ onUse }: { onUse: (parts: PartDraft[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<PartListReport | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [used, setUsed] = useState(false);
  const [pending, start] = useTransition();

  function choose(f: File | null) {
    setReport(null); setError(null); setUsed(false);
    if (!f) return;
    setName(f.name);
    const fd = new FormData(); fd.set("file", f);
    start(async () => {
      const res = await previewPartListAction(fd);
      if (res.ok) setReport(res.report); else setError(res.error);
    });
  }

  function use() {
    if (!report) return;
    onUse(report.parts.map((p) => p.part));
    setUsed(true);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-4">
      <div>
        <h3 className="text-sm font-medium">Start from a customer&apos;s part list</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          CSV or Excel (.xlsx), up to 2 MB, at most {MAX_PARTS_PER_RFQ} parts. Columns: part_name (required), part_number, material, gross_weight_kg, net_weight_kg, annual_volume, drawing_ref.
          Column names are matched ignoring case, spaces and punctuation. Cells are copied as written, never guessed. Imported values stay marked unreviewed until you accept them on the costing screen.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="part-list-file">Part list file</Label>
        <input ref={input} id="part-list-file" type="file" accept=".csv,.xlsx,text/csv" onChange={(e) => choose(e.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-sm" />
      </div>
      {pending ? <p role="status" className="text-sm text-muted-foreground">Reading the file…</p> : null}
      {error ? <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert> : null}
      {used ? <Alert role="status"><AlertDescription>Parts from {name} are in the form below. Review them before creating the RFQ.</AlertDescription></Alert> : null}
      {report && !used ? (
        <div className="space-y-3">
          <p className="text-sm" role="status">
            <span className="font-medium">{name}</span>: {report.parts.length} part{report.parts.length === 1 ? "" : "s"} ready
            {report.problems.length ? <>, <span className="font-medium text-warning">{report.problems.length} row{report.problems.length === 1 ? "" : "s"} skipped</span></> : null}.
          </p>
          {report.problems.length || report.warnings.length ? (
            <ul className="max-h-40 space-y-1 overflow-auto rounded-md border p-3 text-sm">
              {report.problems.map((p) => <li key={`p${p.line}`}><span className="num font-medium">Line {p.line}:</span> {p.reason}. Row skipped.</li>)}
              {report.warnings.map((w) => <li key={`w${w.line}`} className="text-muted-foreground"><span className="num font-medium">Line {w.line}:</span> {w.text}</li>)}
            </ul>
          ) : null}
          <Button type="button" size="sm" onClick={use} disabled={report.parts.length === 0}><Upload /> Use {report.parts.length} part{report.parts.length === 1 ? "" : "s"}</Button>
        </div>
      ) : null}
    </div>
  );
}
