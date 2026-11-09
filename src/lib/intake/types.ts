/** A value the extractor proposes, with the exact words from the email that support it. */
export interface ExtractedField {
  value: string;
  evidence: string;
}

export const INTAKE_FIELDS = ["partName", "partNumber", "drawingRef", "materialCode", "grossWeightKg", "netWeightKg", "annualVolume", "dueDate"] as const;
export type IntakeField = (typeof INTAKE_FIELDS)[number];
export type Extraction = Partial<Record<IntakeField, ExtractedField>>;

export interface ProviderInfo {
  id: "mock" | "llm";
  /** Always shown in the UI next to the results. */
  label: string;
  description: string;
}

export interface ExtractionContext {
  today: string;
  /** Material codes in the rate masters, so extraction can recognise them. */
  knownMaterials: readonly string[];
}

/** The only thing the app depends on. Real and mock providers both implement it. */
export interface ExtractionProvider {
  info: ProviderInfo;
  extract(email: string, ctx: ExtractionContext): Promise<Extraction>;
}

export class ExtractionError extends Error {}
