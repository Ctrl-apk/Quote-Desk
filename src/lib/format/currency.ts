import { type NumericInput, roundPaise, toDecimal } from "@/lib/cost-engine/money";

/** Groups integer digits Indian style: last three, then pairs (1,25,000). */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const head = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${head},${digits.slice(-3)}`;
}

/** Formats rupees as "₹ 1,25,000.00". Rounds half-up to paise; negatives read "-₹ 1,250.00". */
export function formatRupees(value: NumericInput): string {
  const rounded = roundPaise(toDecimal("amount", value));
  const [whole = "0", paise = "00"] = rounded.abs().toFixed(2).split(".");
  const sign = rounded.isNegative() && !rounded.isZero() ? "-" : "";
  return `${sign}₹ ${groupIndian(whole)}.${paise}`;
}

/** "1,25,000.00": Indian grouping without the symbol, for table cells whose header already says ₹. */
export function formatNumberIndian(value: NumericInput): string {
  return formatRupees(value).replace("₹ ", "");
}
