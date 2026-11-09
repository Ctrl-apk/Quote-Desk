"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { ImportPreview } from "@/server/services/past-quotes";
import { commitImportAction, previewImportAction } from "@/server/actions/past-quotes";

export function ImportCard() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const body = (f: File) => { const fd = new FormData(); fd.set("file", f); return fd; };
  const reset = () => { setFile(null); setPreview(null); if (input.current) input.current.value = ""; };

  function choose(f: File | null) {
    setFile(f); setPreview(null); setDone(null); setError(null);
    if (!f) return;
    start(async () => {
      const res = await previewImportAction(body(f));
      if (res.ok) setPreview(res.preview); else setError(res.error);
    });
  }

  function commit() {
    if (!file) return;
    start(async () => {
      const res = await commitImportAction(body(file));
      if (res.ok) {
        setDone(`Added ${res.inserted} past quote${res.inserted === 1 ? "" : "s"}. ${res.skippedExisting} already there, ${res.problems} skipped for errors.`);
        reset(); router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="font-medium">Import past quotes</h2>
        <p className="mt-1 text-sm text-muted-foreground">CSV or Excel (.xlsx), up to 2 MB. Columns: customer, part_name, material, gross_weight_kg, routing (operation:machine:minutes, steps separated by ;), price_per_unit, quote_ref, quoted_on (YYYY-MM-DD). Column names are matched ignoring case, spaces and punctuation, and a few common alternatives are accepted (for example “Unit price” or “RFQ No.”). Uploading the same file again adds nothing.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="past-file">File</Label>
        <input ref={input} id="past-file" type="file" accept=".csv,.xlsx,text/csv" onChange={(e) => choose(e.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-sm" />
      </div>
      {pending && !preview ? <p role="status" className="text-sm text-muted-foreground">Checking the file…</p> : null}
      {error ? <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert> : null}
      {done ? <Alert role="status"><AlertDescription>{done}</AlertDescription></Alert> : null}
      <AnimatePresence>
        {preview ? (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
            <p className="text-sm"><span className="font-medium">{preview.fileName}</span>: {preview.totalRows} rows. <span className="font-medium">{preview.newRows} new</span>, {preview.alreadyPresent} already present{preview.repeatedInFile ? `, ${preview.repeatedInFile} repeated in the file` : ""}, <span className={preview.problems.length ? "font-medium text-warning" : ""}>{preview.problems.length} with problems</span>.</p>
            {preview.problems.length ? (
              <div className="max-h-48 overflow-auto rounded-md border text-sm">
                <table className="w-full"><caption className="sr-only">Rows that will be skipped</caption>
                  <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="px-3 py-1.5 font-medium">Line</th><th className="px-3 py-1.5 font-medium">Problem</th></tr></thead>
                  <tbody>{preview.problems.map((p) => <tr key={p.line} className="border-b last:border-0"><td className="num px-3 py-1.5">{p.line}</td><td className="px-3 py-1.5">{p.reason}</td></tr>)}</tbody>
                </table>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button onClick={commit} disabled={pending || preview.newRows === 0}><Upload /> {pending ? "Importing…" : `Import ${preview.newRows} row${preview.newRows === 1 ? "" : "s"}`}</Button>
              <Button variant="outline" onClick={reset} disabled={pending}>Cancel</Button>
            </div>
            {preview.problems.length ? <p className="text-xs text-muted-foreground">Rows with problems are skipped. Fix them in the file and upload again; rows already imported are not duplicated.</p> : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Card>
  );
}
