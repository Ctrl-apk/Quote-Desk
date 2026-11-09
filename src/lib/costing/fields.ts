import type { EditablePartField } from "./schemas";

/** Human wording for part fields, used in messages and labels. */
export const FIELD_LABELS: Record<EditablePartField, string> = {
  materialCode: "material",
  grossWeightKg: "gross weight",
  netWeightKg: "net weight",
  annualVolume: "annual volume",
};

export type FieldSource = "email" | "excel" | "title_block" | "manual";

export const SOURCE_LABELS: Record<FieldSource, string> = {
  email: "Email",
  excel: "Excel",
  title_block: "Title block",
  manual: "Manual",
};
