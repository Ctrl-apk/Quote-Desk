import { addDaysIso } from "@/lib/format/dates";
import { INTAKE_FIELDS, type Extraction, type ExtractionContext, type IntakeField } from "./types";

const DECIMAL = /^\d{1,8}(\.\d{1,4})?$/;
const INTEGER = /^\d{1,9}$/;
/** A part number or drawing reference: letters, digits and . _ - / only, at least one digit, within the column limits (40 / 60). */
const IDENTIFIER = /^(?=.*\d)[A-Za-z0-9][A-Za-z0-9._\-/]{2,39}$/;
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export interface Verified {
  extraction: Extraction;
  warnings: string[];
}

const LABEL: Record<IntakeField, string> = {
  partName: "part name", partNumber: "part number", drawingRef: "drawing reference", materialCode: "material", grossWeightKg: "gross weight", netWeightKg: "net weight", annualVolume: "annual volume", dueDate: "due date",
};

/**
 * Whatever a provider returns is untrusted. A value is kept only if its evidence really appears in the
 * email and the value has the right shape. A model that invents a number cannot get it past this.
 * Nothing here is saved: the person reviews every value, and each stays "unaccepted" until they accept it.
 */
export function verifyExtraction(email: string, raw: Extraction, ctx: ExtractionContext): Verified {
  const text = norm(email);
  const out: Extraction = {};
  const warnings: string[] = [];

  for (const field of INTAKE_FIELDS) {
    const f = raw[field];
    if (!f) continue;
    const value = String(f.value ?? "").trim();
    const evidence = String(f.evidence ?? "").trim();
    if (!value) continue;
    if (!evidence || !text.includes(norm(evidence))) { warnings.push(`Dropped ${LABEL[field]}: the quoted evidence is not in the email.`); continue; }
    if ((field === "grossWeightKg" || field === "netWeightKg") && (!DECIMAL.test(value) || Number(value) <= 0)) { warnings.push(`Dropped ${LABEL[field]}: "${value}" is not a usable weight in kg.`); continue; }
    if ((field === "partNumber" || field === "drawingRef") && !IDENTIFIER.test(value)) { warnings.push(`Dropped ${LABEL[field]}: "${value}" does not look like a reference.`); continue; }
    if (field === "annualVolume" && (!INTEGER.test(value) || Number(value) <= 0)) { warnings.push(`Dropped annual volume: "${value}" is not a whole number.`); continue; }
    if (field === "dueDate") {
      const valid = /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
      if (!valid) { warnings.push("Dropped due date: not a real date."); continue; }
      if (value < ctx.today || value > addDaysIso(ctx.today, 366)) { warnings.push(`Dropped due date ${value}: it is in the past or more than a year away.`); continue; }
    }
    out[field] = { value: field === "materialCode" ? value : value, evidence };
  }

  const gross = out.grossWeightKg ? Number(out.grossWeightKg.value) : null;
  const net = out.netWeightKg ? Number(out.netWeightKg.value) : null;
  if (gross !== null && net !== null && net > gross) {
    warnings.push("Dropped net weight: it is larger than the gross weight.");
    delete out.netWeightKg;
  }
  if (out.materialCode && !ctx.knownMaterials.some((m) => m.toLowerCase() === out.materialCode!.value.toLowerCase())) {
    warnings.push(`Material "${out.materialCode.value}" has no rate in Rate masters yet. Costing will need one.`);
  }
  if (out.materialCode) {
    const known = ctx.knownMaterials.find((m) => m.toLowerCase() === out.materialCode!.value.toLowerCase());
    if (known) out.materialCode = { ...out.materialCode, value: known };
  }
  return { extraction: out, warnings };
}
