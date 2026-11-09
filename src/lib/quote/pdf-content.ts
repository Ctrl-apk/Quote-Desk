import { D } from "@/lib/cost-engine";
import type { SerializedTier } from "@/lib/costing/form";
import { formatNumberIndian } from "@/lib/format/currency";
import { addDaysIso, formatDate } from "@/lib/format/dates";

/** Assumption Q-02: a quote is valid for 30 days from the quote date. */
export const QUOTE_VALIDITY_DAYS = 30;
export const SELLER_NAME = "Company A";
export const SELLER_PLACE = "Chakan, Pune, India";

export interface PdfQuoteInput {
  rfqNo: string;
  version: number;
  customer: string;
  partName: string;
  materialCode: string;
  quotedOn: string;
  gstPercent: string;
  tiers: SerializedTier[];
  preparedBy: string;
}

export interface PdfContent {
  reference: string;
  issuedOn: string;
  validUntil: string;
  customer: string;
  part: string;
  material: string;
  gstLabel: string;
  rows: { volume: string; price: string; gst: string; priceWithGst: string; annual: string; base: boolean }[];
  /** Per-piece cost breakup, one column per volume tier (assumption Q-04). Every figure is copied from the saved snapshot. */
  breakup: { columns: { volume: string; base: boolean }[]; lines: { label: string; values: string[]; strong?: boolean }[]; note: string };
  terms: string[];
  preparedBy: string;
}

/**
 * What the customer sees: a per-piece cost breakup, prices, GST and annual value per volume, all read from the
 * saved quote snapshot (nothing is recalculated). Markup percentage, machine hour rates, scrap and recovery,
 * approval notes and audit information are deliberately absent (assumptions Q-01 and Q-04).
 */
export function buildPdfContent(q: PdfQuoteInput): PdfContent {
  return {
    reference: `${q.rfqNo}-v${q.version}`,
    issuedOn: formatDate(q.quotedOn),
    validUntil: formatDate(addDaysIso(q.quotedOn, QUOTE_VALIDITY_DAYS)),
    customer: q.customer,
    part: q.partName,
    material: q.materialCode,
    gstLabel: `GST ${Number(q.gstPercent)}%`,
    rows: q.tiers.map((t) => ({
      volume: `${formatNumberIndian(t.volume).replace(/\.00$/, "")} pcs per year`,
      price: formatNumberIndian(t.pricePerUnit),
      gst: formatNumberIndian(t.gst),
      priceWithGst: formatNumberIndian(D(t.pricePerUnit).plus(t.gst).toFixed(2)),
      annual: formatNumberIndian(t.annualValue),
      base: t.factor === "1",
    })),
    breakup: {
      columns: q.tiers.map((t) => ({ volume: `${formatNumberIndian(t.volume).replace(/\.00$/, "")} pcs per year`, base: t.factor === "1" })),
      lines: [
        { label: "Material", values: q.tiers.map((t) => formatNumberIndian(t.material)) },
        { label: "Conversion", values: q.tiers.map((t) => formatNumberIndian(t.conversion)) },
        { label: "Setup and tooling", values: q.tiers.map((t) => formatNumberIndian(t.setupTooling)) },
        { label: "Overheads", values: q.tiers.map((t) => formatNumberIndian(t.overhead)) },
        { label: "Packing and freight", values: q.tiers.map((t) => formatNumberIndian(D(t.packing).plus(t.freight).toFixed(2))) },
        { label: "Quoted unit price", values: q.tiers.map((t) => formatNumberIndian(t.pricePerUnit)), strong: true },
        { label: `${`GST ${Number(q.gstPercent)}%`} (separate)`, values: q.tiers.map((t) => formatNumberIndian(t.gst)) },
        { label: "Unit price including GST", values: q.tiers.map((t) => formatNumberIndian(D(t.pricePerUnit).plus(t.gst).toFixed(2))), strong: true },
        { label: "Annual quotation value (excl. GST)", values: q.tiers.map((t) => formatNumberIndian(t.annualValue)), strong: true },
      ],
      note: "Cost lines are per piece in INR. The quoted unit price also includes our commercial margin, which is not itemised.",
    },
    terms: [
      "Prices are in Indian rupees, per piece, excluding GST. GST is shown separately.",
      "Prices include packing and freight as quoted.",
      `This quotation is valid for ${QUOTE_VALIDITY_DAYS} days from the date of issue.`,
      "Each price applies to the annual volume shown beside it.",
    ],
    preparedBy: q.preparedBy,
  };
}
