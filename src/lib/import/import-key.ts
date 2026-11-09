import { createHash } from "node:crypto";

export interface ImportKeyParts {
  customer: string;
  partName: string;
  materialCode: string;
  quoteRef: string;
  /** YYYY-MM-DD */
  quotedOn: string;
}

/**
 * Stable identity of an imported past-quote row (PastQuote.importKey).
 * Same row uploaded twice gives the same key, so re-uploading is idempotent.
 * Text is trimmed, collapsed and lower-cased so cosmetic differences do not create duplicates.
 */
export function pastQuoteImportKey(parts: ImportKeyParts): string {
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  const canonical = [parts.customer, parts.partName, parts.materialCode, parts.quoteRef, parts.quotedOn].map(norm).join("|");
  return createHash("sha256").update(canonical).digest("hex");
}
