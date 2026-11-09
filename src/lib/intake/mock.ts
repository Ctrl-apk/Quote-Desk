import { D } from "@/lib/cost-engine";
import { addDaysIso } from "@/lib/format/dates";
import type { Extraction, ExtractionContext, ExtractionProvider } from "./types";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function weight(text: string, label: RegExp): { value: string; evidence: string } | undefined {
  const re = new RegExp(`${label.source}\\s*(?:weight|wt\\.?)?\\s*(?:of|is|=|:)?\\s*(\\d+(?:\\.\\d+)?)\\s*(kg|kgs|g|gm|gms|grams?)\\b`, "gi");
  const found = [...text.matchAll(re)].map((m) => ({
    value: /^g/i.test(m[2]!) ? D(m[1]!).div(1000).toFixed(4).replace(/\.?0+$/, "") : m[1]!.replace(/\.?0+$/, (z) => (m[1]!.includes(".") ? "" : z)),
    evidence: m[0],
  }));
  // Two different figures for the same thing is a conflict, not a choice: say nothing and let a person decide.
  if (found.length === 0 || new Set(found.map((f) => Number(f.value))).size > 1) return undefined;
  return found[0];
}

/**
 * A rule-based stand-in for the AI model. It reads the email with patterns, quotes its evidence, and
 * has the same interface as the real provider. It is not intelligent: unusual wording is simply missed,
 * and the screen always says "Mock extractor". It exists so the whole flow runs without an API key.
 */
export const mockProvider: ExtractionProvider = {
  info: { id: "mock", label: "Mock extractor", description: "Pattern matching, not an AI model. No data leaves this server." },
  async extract(email: string, ctx: ExtractionContext): Promise<Extraction> {
    const out: Extraction = {};

    const subject = /^subject:\s*(?:rfq|quote|quotation|enquiry)?\s*(?:for|:)?\s*(.+)$/im.exec(email);
    const inBody = /(?:quote|quotation|price)\s+(?:for\s+)?(?:the\s+)?([a-z][a-z0-9 \-/]{2,40}?)(?:\s*[,.]|\s+(?:in|made|of|with|per)\b)/i.exec(email);
    const name = subject?.[1]?.trim() ?? inBody?.[1]?.trim();
    if (name) out.partName = { value: name.charAt(0).toUpperCase() + name.slice(1), evidence: subject ? subject[1]!.trim() : inBody![1]!.trim() };

    // A part number or drawing reference is taken only when it is labelled as one. "Weight per drawing 4.6 kg" is not a reference.
    const partNo = /\bpart\s*(?:no\.?|number|#)\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9._\-/]{2,39})/i.exec(email);
    if (partNo && /\d/.test(partNo[1]!)) out.partNumber = { value: partNo[1]!.replace(/[.]+$/, ""), evidence: partNo[0].replace(/[.]+$/, "") };
    const drawingNo = /\b(?:drawing|drg)\s*(?:no\.?|number|ref(?:erence)?|#)\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9._\-/]{2,39})/i.exec(email);
    if (drawingNo && /\d/.test(drawingNo[1]!)) out.drawingRef = { value: drawingNo[1]!.replace(/[.]+$/, ""), evidence: drawingNo[0].replace(/[.]+$/, "") };

    for (const code of ctx.knownMaterials) {
      const esc = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const m = new RegExp(`(?<![A-Za-z0-9])${esc}(?![A-Za-z0-9])`, "i").exec(email);
      if (m) { out.materialCode = { value: code, evidence: m[0] }; break; }
    }
    if (!out.materialCode) {
      const generic = /\b(EN\s?\d{1,2}[A-Z]?|\d{2}Mn[A-Z][a-z]?\d?|SS\s?\d{3}[A-Z]?|C\d{2})\b/.exec(email);
      if (generic) out.materialCode = { value: generic[1]!.replace(/\s/g, ""), evidence: generic[1]! };
    }

    const gross = weight(email, /gross/);
    const net = weight(email, /(?:net|finished|finish)/);
    if (gross) out.grossWeightKg = gross;
    if (net) out.netWeightKg = net;

    const lakh = /(\d+(?:\.\d+)?)\s*lakh\s*(?:pcs|pieces|nos|units)?(?:\s*(?:per year|annually|a year|\/year|p\.a\.))?/i.exec(email);
    const vol =
      /(?:annual|yearly)\s+(?:volume|requirement|demand|quantity)\s*(?:of|is|=|:)?\s*(\d[\d,]*)/i.exec(email) ??
      /(\d[\d,]*)\s*(?:pcs|pieces|nos|units)\s*(?:per year|annually|a year|\/year|p\.a\.)/i.exec(email);
    if (vol) out.annualVolume = { value: vol[1]!.replace(/,/g, ""), evidence: vol[0] };
    else if (lakh && /(per year|annual|a year|\/year|p\.a\.)/i.test(email)) out.annualVolume = { value: D(lakh[1]!).times(100000).toFixed(0), evidence: lakh[0] };

    const within = /within\s+(?:a|an|one|(\d+))\s*(day|week|month)s?/i.exec(email);
    const by = /\bby\s+(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?(?:\s+(\d{4}))?/i.exec(email);
    if (within) {
      const n = within[1] ? Number(within[1]) : 1;
      const days = /week/i.test(within[2]!) ? n * 7 : /month/i.test(within[2]!) ? n * 30 : n;
      out.dueDate = { value: addDaysIso(ctx.today, days), evidence: within[0] };
    } else if (by) {
      const mi = MONTHS.indexOf(by[2]!.slice(0, 3).toLowerCase());
      if (mi >= 0) {
        const year = by[3] ? Number(by[3]) : Number(ctx.today.slice(0, 4));
        let iso = `${year}-${String(mi + 1).padStart(2, "0")}-${by[1]!.padStart(2, "0")}`;
        if (!by[3] && iso < ctx.today) iso = `${year + 1}${iso.slice(4)}`;
        out.dueDate = { value: iso, evidence: by[0] };
      }
    }
    return out;
  },
};
