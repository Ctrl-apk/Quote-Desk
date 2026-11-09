"use client";

import { Trash2 } from "lucide-react";
import { SelectField, NumField } from "@/components/costing/fields";
import { Button } from "@/components/ui/button";
import type { PartDraft } from "@/lib/rfq/manage";

export const EMPTY_PART: PartDraft = { name: "", materialCode: "", grossWeightKg: "", netWeightKg: "", annualVolume: "", partNumber: "", drawingRef: "" };
export type PartErrors = Partial<Record<keyof PartDraft, string>>;

/** One part's specification fields. Used by the New RFQ form and the Add part dialog. */
export function PartEditor({ index, value, errors, materials, onChange, onRemove }: {
  index: number;
  value: PartDraft;
  errors: PartErrors;
  materials: string[];
  onChange: (next: PartDraft) => void;
  onRemove?: () => void;
}) {
  const set = (k: keyof PartDraft) => (v: string) => onChange({ ...value, [k]: v });
  return (
    <fieldset className="space-y-3 rounded-lg border p-4">
      <legend className="flex items-center gap-2 px-1 text-sm font-medium">
        Part {index + 1}
        {onRemove ? (
          <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Remove part ${index + 1}`} onClick={onRemove}>
            <Trash2 />
          </Button>
        ) : null}
      </legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="sm:col-span-2 lg:col-span-2">
          <NumField label="Part name" inputMode="text" value={value.name} onChange={set("name")} error={errors.name} />
        </div>
        <SelectField label="Material" value={value.materialCode ?? ""} onChange={set("materialCode")} options={materials} placeholder="Not known yet" />
        <NumField label="Gross weight" suffix="kg" value={value.grossWeightKg ?? ""} onChange={set("grossWeightKg")} error={errors.grossWeightKg} />
        <NumField label="Net weight" suffix="kg" value={value.netWeightKg ?? ""} onChange={set("netWeightKg")} error={errors.netWeightKg} />
        <NumField label="Annual volume" suffix="pcs" inputMode="numeric" value={value.annualVolume ?? ""} onChange={set("annualVolume")} error={errors.annualVolume} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <NumField label="Part number" inputMode="text" value={value.partNumber ?? ""} onChange={set("partNumber")} error={errors.partNumber} hint="Optional" />
        <NumField label="Drawing reference" inputMode="text" value={value.drawingRef ?? ""} onChange={set("drawingRef")} error={errors.drawingRef} hint="Optional" />
      </div>
    </fieldset>
  );
}
