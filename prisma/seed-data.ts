/**
 * Demo data, as pure definitions (no database). prisma/seed.ts writes it; tests check it.
 *
 * Values the brief gives are marked GIVEN. Everything else is invented to be plausible
 * and is marked ASSUMPTION; docs/assumptions.md section 7 lists them all.
 * Dates are relative to the day the seed runs, so "overdue" is always true to life.
 */
import { addDaysIso } from "../src/lib/format/dates";
import { pastQuoteImportKey } from "../src/lib/import/import-key";

type IsoDate = string;
export type DemoRole = "estimator" | "sales_head";
export type DemoStatus = "estimating" | "sent" | "won" | "lost";
export type DemoSource = "email" | "excel" | "title_block" | "manual";

// ---- Users (fake emails; passwords are demo-only and documented in deployment.md) ----
export const DEMO_USERS: { email: string; name: string; role: DemoRole; password: string }[] = [
  { email: "estimator@quotedesk.example", name: "Asha Estimator", role: "estimator", password: "Estimator#2611" },
  { email: "saleshead@quotedesk.example", name: "Vikram Sales Head", role: "sales_head", password: "SalesHead#2611" },
];

export const DEMO_CUSTOMERS = ["Company B", "Company C", "Company D", "Company E", "Company G"] as const;

// ---- Rate masters (ASSUMPTION: all rates). Two versions where noted, to show effective dating. ----
export const FIRST_RATE_DATE: IsoDate = "2026-04-01";
export const SECOND_RATE_DATE: IsoDate = "2026-10-01";

export const MATERIAL_RATES = [
  { materialCode: "EN8", ratePerKg: "70.0000", scrapRecoveryPerKg: "25.0000", effectiveFrom: FIRST_RATE_DATE },
  { materialCode: "EN8", ratePerKg: "76.0000", scrapRecoveryPerKg: "27.0000", effectiveFrom: SECOND_RATE_DATE }, // v2: price rise
  { materialCode: "40Cr4", ratePerKg: "84.0000", scrapRecoveryPerKg: "26.0000", effectiveFrom: FIRST_RATE_DATE },
  { materialCode: "20MnCr5", ratePerKg: "78.0000", scrapRecoveryPerKg: "26.0000", effectiveFrom: FIRST_RATE_DATE },
];

// Hour rates for the three sample machines are GIVEN (850, 1450, 950). Efficiency 1.0 on those
// makes the brief's own check reproduce exactly (3.2 min at 850/hr = 45.33). CNC-T3 uses 0.85 to
// show efficiency at work. Everything else ASSUMPTION.
export const MACHINE_RATES = [
  { machineCode: "CNC-T1", hourRate: "850.00", efficiency: "1.0000", effectiveFrom: FIRST_RATE_DATE }, // GIVEN rate
  { machineCode: "VMC-1", hourRate: "1450.00", efficiency: "1.0000", effectiveFrom: FIRST_RATE_DATE }, // GIVEN rate
  { machineCode: "CNC-T2", hourRate: "950.00", efficiency: "1.0000", effectiveFrom: FIRST_RATE_DATE }, // GIVEN rate
  { machineCode: "CNC-T3", hourRate: "700.00", efficiency: "0.8500", effectiveFrom: FIRST_RATE_DATE },
  { machineCode: "CNC-T3", hourRate: "740.00", efficiency: "0.8500", effectiveFrom: SECOND_RATE_DATE }, // v2: rate rise
  { machineCode: "DRL-1", hourRate: "400.00", efficiency: "0.9000", effectiveFrom: FIRST_RATE_DATE },
  { machineCode: "GRD-1", hourRate: "600.00", efficiency: "0.9000", effectiveFrom: FIRST_RATE_DATE },
];

export const OVERHEAD_RATES = [
  { category: "STANDARD", percent: "11.000", effectiveFrom: FIRST_RATE_DATE },
  { category: "STANDARD", percent: "12.000", effectiveFrom: SECOND_RATE_DATE }, // v2
];

// ---- RFQs ----
export interface DemoField {
  source: DemoSource;
  accepted: boolean;
}
export interface DemoPart {
  name: string;
  materialCode: string;
  grossWeightKg: string;
  netWeightKg: string;
  annualVolume: number;
  setupCost: string;
  toolingCost: string;
  routing: { operation: string; machineCode: string; cycleTimeMin: string }[];
  fields: { materialCode: DemoField; grossWeightKg: DemoField; netWeightKg: DemoField; annualVolume: DemoField };
}
export interface DemoRfq {
  rfqNo: string;
  customer: (typeof DEMO_CUSTOMERS)[number];
  status: DemoStatus;
  lostReason?: string;
  /** Days from the seed date; negative means in the past. */
  dueInDays: number;
  sourceEmail?: string;
  part: DemoPart;
}

const accepted = (source: DemoSource): DemoField => ({ source, accepted: true });
const unaccepted = (source: Exclude<DemoSource, "manual">): DemoField => ({ source, accepted: false });

export const DEMO_RFQS: DemoRfq[] = [
  {
    // GIVEN: part, material, gross 0.61, volume 180000, 3.2 min, 850/hr. ASSUMPTION: net weight, setup, tooling, due date.
    rfqNo: "RFQ-2611-014",
    customer: "Company B",
    status: "estimating",
    dueInDays: 6,
    sourceEmail:
      "Subject: RFQ for rear wheel spindle\n\nPlease quote the rear wheel spindle, EN8, gross weight 0.61 kg, annual volume 180000 pieces. Quote needed within a week.",
    part: {
      name: "Rear wheel spindle",
      materialCode: "EN8",
      grossWeightKg: "0.6100",
      netWeightKg: "0.5200",
      annualVolume: 180000,
      setupCost: "50000.00",
      toolingCost: "150000.00",
      routing: [{ operation: "Turning", machineCode: "CNC-T1", cycleTimeMin: "3.200" }],
      fields: {
        materialCode: accepted("excel"),
        grossWeightKg: accepted("excel"),
        netWeightKg: accepted("manual"),
        annualVolume: accepted("excel"),
      },
    },
  },
  {
    // GIVEN: part, material, 4.60 kg, 24000, 11.5 min, 1450/hr. OVERDUE on purpose. Two values from the email are not yet accepted.
    rfqNo: "RFQ-2611-019",
    customer: "Company C",
    status: "estimating",
    dueInDays: -4,
    sourceEmail:
      "Subject: Quote request: hydraulic lift arm\n\nWe need a price for the hydraulic lift arm, 40Cr4 forging, about 24000 per year. Weight per drawing 4.6 kg. Please revert urgently.",
    part: {
      name: "Hydraulic lift arm",
      materialCode: "40Cr4",
      grossWeightKg: "4.6000",
      netWeightKg: "3.9000",
      annualVolume: 24000,
      setupCost: "120000.00",
      toolingCost: "450000.00",
      routing: [{ operation: "Machining", machineCode: "VMC-1", cycleTimeMin: "11.500" }],
      fields: {
        materialCode: unaccepted("email"),
        grossWeightKg: accepted("excel"),
        netWeightKg: accepted("manual"),
        annualVolume: unaccepted("email"),
      },
    },
  },
  {
    // GIVEN: part, material, 1.48 kg, 60000, 4.8 min, 950/hr. ASSUMPTION: net weight (from title block), setup, tooling.
    rfqNo: "RFQ-2611-023",
    customer: "Company D",
    status: "estimating",
    dueInDays: 12,
    part: {
      name: "Gear blank",
      materialCode: "20MnCr5",
      grossWeightKg: "1.4800",
      netWeightKg: "1.2000",
      annualVolume: 60000,
      setupCost: "80000.00",
      toolingCost: "200000.00",
      routing: [{ operation: "Turning", machineCode: "CNC-T2", cycleTimeMin: "4.800" }],
      fields: {
        materialCode: accepted("excel"),
        grossWeightKg: accepted("excel"),
        netWeightKg: accepted("title_block"),
        annualVolume: accepted("excel"),
      },
    },
  },
  {
    // ASSUMPTION: entirely invented. Small on purpose: stays well under Rs 25,00,000 a year, so the no-approval path can be shown.
    rfqNo: "RFQ-2611-027",
    customer: "Company E",
    status: "estimating",
    dueInDays: 9,
    part: {
      name: "Throttle cable bracket",
      materialCode: "EN8",
      grossWeightKg: "0.1800",
      netWeightKg: "0.1500",
      annualVolume: 6000,
      setupCost: "15000.00",
      toolingCost: "25000.00",
      routing: [{ operation: "Turning", machineCode: "CNC-T3", cycleTimeMin: "2.100" }],
      fields: {
        materialCode: accepted("manual"),
        grossWeightKg: accepted("manual"),
        netWeightKg: accepted("manual"),
        annualVolume: accepted("manual"),
      },
    },
  },
  {
    // ASSUMPTION: invented. Past due but already sent, so not overdue.
    rfqNo: "RFQ-2610-031",
    customer: "Company B",
    status: "sent",
    dueInDays: -10,
    part: {
      name: "Brake pedal pin",
      materialCode: "EN8",
      grossWeightKg: "0.3400",
      netWeightKg: "0.2900",
      annualVolume: 90000,
      setupCost: "30000.00",
      toolingCost: "60000.00",
      routing: [{ operation: "Turning", machineCode: "CNC-T1", cycleTimeMin: "2.400" }],
      fields: {
        materialCode: accepted("excel"),
        grossWeightKg: accepted("excel"),
        netWeightKg: accepted("manual"),
        annualVolume: accepted("excel"),
      },
    },
  },
  {
    // ASSUMPTION: invented.
    rfqNo: "RFQ-2610-008",
    customer: "Company C",
    status: "won",
    dueInDays: -25,
    part: {
      name: "Axle shaft",
      materialCode: "40Cr4",
      grossWeightKg: "3.2000",
      netWeightKg: "2.7000",
      annualVolume: 36000,
      setupCost: "90000.00",
      toolingCost: "300000.00",
      routing: [{ operation: "Machining", machineCode: "VMC-1", cycleTimeMin: "9.000" }],
      fields: {
        materialCode: accepted("excel"),
        grossWeightKg: accepted("excel"),
        netWeightKg: accepted("manual"),
        annualVolume: accepted("excel"),
      },
    },
  },
  {
    // ASSUMPTION: invented, including the reason.
    rfqNo: "RFQ-2609-044",
    customer: "Company G",
    status: "lost",
    lostReason: "Lost on price: competitor quoted about 6% lower",
    dueInDays: -45,
    part: {
      name: "Transmission gear blank",
      materialCode: "20MnCr5",
      grossWeightKg: "1.9000",
      netWeightKg: "1.5500",
      annualVolume: 48000,
      setupCost: "70000.00",
      toolingCost: "180000.00",
      routing: [{ operation: "Turning", machineCode: "CNC-T2", cycleTimeMin: "5.200" }],
      fields: {
        materialCode: accepted("excel"),
        grossWeightKg: accepted("excel"),
        netWeightKg: accepted("manual"),
        annualVolume: accepted("excel"),
      },
    },
  },
];

export function rfqDueDate(rfq: DemoRfq, today: IsoDate): IsoDate {
  return addDaysIso(today, rfq.dueInDays);
}

/** Pre-filled values (any source but manual) are AI-filled and must be accepted (assumption I-07). */
export function isAiFilled(source: DemoSource): boolean {
  return source !== "manual";
}

// ---- Past quotes (ASSUMPTION: all invented). Used for routing suggestions and search. ----
export interface PastQuoteRow {
  customer: string;
  partName: string;
  materialCode: string;
  grossWeightKg: string;
  routing: { operation: string; machineCode: string; cycleTimeMin: string }[];
  pricePerUnit: string;
  quoteRef: string;
  quotedOn: IsoDate;
}

interface Family {
  material: string;
  names: string[];
  baseWeight: number;
  weightStep: number;
  ops: { operation: string; machineCode: string; baseMin: number; minStep: number }[];
  /** Rough price per kg of finished weight, to keep prices plausible. */
  pricePerKg: number;
}

const FAMILIES: Family[] = [
  {
    material: "EN8",
    names: ["Rear wheel spindle", "Front axle pin", "Brake cam shaft", "Clutch lever pin", "Kick shaft", "Gear shift spindle", "Wheel hub spindle", "Steering stem pin", "Rocker arm pin", "Cam follower pin"],
    baseWeight: 0.52, weightStep: 0.03,
    ops: [
      { operation: "Turning", machineCode: "CNC-T1", baseMin: 2.8, minStep: 0.1 },
      { operation: "Drilling", machineCode: "DRL-1", baseMin: 0.6, minStep: 0.05 },
    ],
    pricePerKg: 175,
  },
  {
    material: "40Cr4",
    names: ["Hydraulic lift arm", "Lift link arm", "Draft control arm", "Steering knuckle arm", "Axle housing arm", "Hitch support arm", "Tie rod arm", "Pivot lever arm"],
    baseWeight: 4.1, weightStep: 0.2,
    ops: [
      { operation: "Machining", machineCode: "VMC-1", baseMin: 10.2, minStep: 0.5 },
      { operation: "Drilling", machineCode: "DRL-1", baseMin: 1.2, minStep: 0.1 },
    ],
    pricePerKg: 150,
  },
  {
    material: "20MnCr5",
    names: ["Gear blank", "Pinion blank", "Crown gear blank", "Transmission gear blank", "Counter gear blank", "Idler gear blank", "Sprocket blank", "Cluster gear blank"],
    baseWeight: 1.3, weightStep: 0.08,
    ops: [
      { operation: "Turning", machineCode: "CNC-T2", baseMin: 4.2, minStep: 0.2 },
      { operation: "Grinding", machineCode: "GRD-1", baseMin: 1.0, minStep: 0.1 },
    ],
    pricePerKg: 160,
  },
  {
    material: "EN8",
    names: ["Throttle cable bracket", "Mirror stay bracket", "Chain guard bracket", "Footrest bracket"],
    baseWeight: 0.15, weightStep: 0.03,
    ops: [{ operation: "Turning", machineCode: "CNC-T3", baseMin: 1.8, minStep: 0.15 }],
    pricePerKg: 300,
  },
];

const CUSTOMERS_FOR_PAST = ["Company B", "Company C", "Company D", "Company E", "Company G"];

function buildPastQuotes(): PastQuoteRow[] {
  const rows: PastQuoteRow[] = [];
  let n = 0;
  for (const family of FAMILIES) {
    family.names.forEach((partName, k) => {
      n += 1;
      const weight = family.baseWeight + k * family.weightStep;
      const routing = family.ops.map((op) => ({
        operation: op.operation,
        machineCode: op.machineCode,
        cycleTimeMin: (op.baseMin + k * op.minStep).toFixed(3),
      }));
      const month = 1 + ((n * 5) % 12); // spread over Jan 2025 .. Sep 2026 without randomness
      const year = 2025 + Number(n % 3 === 0 && month <= 9);
      const quotedOn = `${year}-${String(month).padStart(2, "0")}-${String(1 + ((n * 7) % 27)).padStart(2, "0")}`;
      rows.push({
        customer: CUSTOMERS_FOR_PAST[n % CUSTOMERS_FOR_PAST.length] as string,
        partName,
        materialCode: family.material,
        grossWeightKg: weight.toFixed(4),
        routing,
        pricePerUnit: (weight * family.pricePerKg).toFixed(2),
        quoteRef: `Q-${String(year).slice(2)}${String(month).padStart(2, "0")}-${String(100 + n)}`,
        quotedOn,
      });
    });
  }
  return rows;
}

export const PAST_QUOTES: PastQuoteRow[] = buildPastQuotes();

export function pastQuoteKey(row: PastQuoteRow): string {
  return pastQuoteImportKey({ customer: row.customer, partName: row.partName, materialCode: row.materialCode, quoteRef: row.quoteRef, quotedOn: row.quotedOn });
}

// ---- Demo import file: every valid past quote plus a few deliberately broken rows ----
export const PAST_QUOTE_CSV_HEADER = "customer,part_name,material,gross_weight_kg,routing,price_per_unit,quote_ref,quoted_on";

/** Row format for routing: operation:machine:minutes, steps separated by ";" (assumption I-06). */
export function routingToCell(routing: PastQuoteRow["routing"]): string {
  return routing.map((r) => `${r.operation}:${r.machineCode}:${r.cycleTimeMin}`).join(";");
}

/** Raw lines that the importer must reject, each with the reason it should be given. */
export const MALFORMED_CSV_ROWS: { line: string; reason: string }[] = [
  { line: "Company B,Brake lever pin,,0.4100,Turning:CNC-T1:2.5,72.10,Q-2602-901,2026-02-10", reason: "material is missing" },
  { line: "Company C,Lift pivot arm,40Cr4,heavy,Machining:VMC-1:10.5,640.00,Q-2603-902,2026-03-12", reason: "gross weight is not a number" },
  { line: "Company D,Idler gear blank,20MnCr5,1.3500,Turning:CNC-T2:4.4,-215.00,Q-2604-903,2026-04-09", reason: "price is negative" },
  { line: "Company E,Footrest pin,EN8,0.2200,Turning:CNC-T3:2.0,66.00,Q-2605-904,31/02/2026", reason: "quoted_on is not a valid date" },
  { line: "Company G,Kick starter shaft,EN8,0.6100,Turning-CNC-T1-3.0,106.00,Q-2606-905,2026-06-18", reason: "routing is not operation:machine:minutes" },
];

/** The demo file: valid rows with the broken ones spread through them. */
export function pastQuotesCsv(): string {
  const valid = PAST_QUOTES.map((r) =>
    [r.customer, r.partName, r.materialCode, r.grossWeightKg, routingToCell(r.routing), r.pricePerUnit, r.quoteRef, r.quotedOn].join(","),
  );
  const lines = [...valid];
  MALFORMED_CSV_ROWS.forEach((bad, i) => lines.splice(6 + i * 7, 0, bad.line));
  return `${PAST_QUOTE_CSV_HEADER}\n${lines.join("\n")}\n`;
}
