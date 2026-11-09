"use client";

import { useId, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SOURCE_LABELS, type FieldSource } from "@/lib/costing/fields";

interface NumFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  suffix?: string;
  prefix?: string;
  readOnly?: boolean;
  error?: string;
  hint?: ReactNode;
  inputMode?: "decimal" | "numeric" | "text";
  extra?: ReactNode;
  list?: string;
}

/** Labelled input with optional unit, hint, error and a slot (used for the source tag). */
export function NumField({ label, value, onChange, onBlur, suffix, prefix, readOnly, error, hint, inputMode = "decimal", extra, list }: NumFieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {extra}
      </div>
      <div className="relative">
        {prefix ? <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">{prefix}</span> : null}
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          readOnly={readOnly}
          inputMode={inputMode}
          autoComplete="off"
          list={list}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? noteId : undefined}
          className={`num ${prefix ? "pl-7" : ""} ${suffix ? "pr-9" : ""} ${readOnly ? "bg-muted/50" : ""}`}
        />
        {suffix ? <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">{suffix}</span> : null}
      </div>
      {error ? <p id={noteId} role="alert" className="text-xs text-destructive">{error}</p> : hint ? <p id={noteId} className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:bg-muted/50";

export function SelectField({ label, value, onChange, options, disabled, onBlur, extra, placeholder = "Choose…" }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; disabled?: boolean; onBlur?: () => void; extra?: ReactNode; placeholder?: string;
}) {
  const id = useId();
  const list = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {extra}
      </div>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} disabled={disabled} className={SELECT_CLASS}>
        <option value="">{placeholder}</option>
        {list.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

export { SELECT_CLASS };

/** Where a value came from, and the Accept button while an AI-filled value is unreviewed. */
export function SourceTag({ source, aiFilled, accepted, canEdit, onAccept, pending }: {
  source: FieldSource; aiFilled: boolean; accepted: boolean; canEdit: boolean; onAccept: () => void; pending: boolean;
}) {
  const needsReview = aiFilled && !accepted;
  return (
    <span className="flex items-center gap-1.5">
      <Badge variant={needsReview ? "warning" : "outline"}>{SOURCE_LABELS[source]}{needsReview ? ", unreviewed" : ""}</Badge>
      {needsReview && canEdit ? (
        <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={onAccept} disabled={pending}>Accept</Button>
      ) : null}
    </span>
  );
}
