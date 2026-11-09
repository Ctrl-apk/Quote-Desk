import {
  CostInputError, calculateQuoteCost, operationCostPerPiece, roundPaise, type Dec, type QuoteCost,
} from "@/lib/cost-engine";
import {
  InvalidDateError, RateNotFoundError, buildRatesSnapshot, lookupMachineRate, lookupMaterialRate, lookupOverheadRate,
  type IsoDate, type MachineRateRow, type MaterialRateRow, type OverheadRateRow, type RateRowIds, type RatesSnapshot,
} from "@/lib/rates";
import { DEFAULT_COSTING_INPUTS, OVERHEAD_CATEGORY } from "./defaults";

export interface RoutingRowForm {
  operation: string;
  machineCode: string;
  cycleTimeMin: string;
}

/**
 * Everything a costing depends on, as the strings a form holds. This is also exactly what is
 * stored in Quote.inputs, so a saved quote carries the part values it was priced on.
 */
export interface CostingForm {
  quotedOn: IsoDate;
  materialCode: string;
  grossWeightKg: string;
  netWeightKg: string;
  annualVolume: string;
  setupCost: string;
  toolingCost: string;
  routing: RoutingRowForm[];
  scrapPercent: string;
  overheadPercent: string;
  packingPerUnit: string;
  freightPerUnit: [string, string, string];
  markupPercent: string;
  gstPercent: string;
}

export interface RateTables {
  materials: readonly MaterialRateRow[];
  machines: readonly MachineRateRow[];
  overhead: readonly OverheadRateRow[];
}

export interface RoutingLine {
  hourRate: string;
  efficiency: string;
  /** Per piece, rounded to paise for display. The conversion total is rounded once, not summed from these. */
  costPerPiece: Dec;
}

export type CostingResult =
  | {
      ok: true;
      cost: QuoteCost;
      routingLines: RoutingLine[];
      materialRate: MaterialRateRow;
      overheadMaster: OverheadRateRow;
      overheadOverridden: boolean;
      machineRates: MachineRateRow[];
    }
  | { ok: false; message: string; field?: string };

/**
 * Prices a costing form against dated rate tables. Never throws for bad input:
 * the screen shows `message` and keeps working. Used by the live screen and, again,
 * by the server when a quote version is saved, so the two can never disagree.
 */
export function computeCosting(form: CostingForm, rates: RateTables): CostingResult {
  try {
    const materialRate = lookupMaterialRate(rates.materials, form.materialCode, form.quotedOn);
    const overheadMaster = lookupOverheadRate(rates.overhead, OVERHEAD_CATEGORY, form.quotedOn);
    const machineRates = form.routing.map((row) => lookupMachineRate(rates.machines, row.machineCode, form.quotedOn));
    const operations = form.routing.map((row, i) => ({
      cycleTimeMin: row.cycleTimeMin,
      hourRate: machineRates[i]!.hourRate,
      efficiency: machineRates[i]!.efficiency,
    }));

    const cost = calculateQuoteCost({
      annualVolume: form.annualVolume,
      material: {
        grossWeightKg: form.grossWeightKg,
        netWeightKg: form.netWeightKg,
        ratePerKg: materialRate.ratePerKg,
        scrapRecoveryPerKg: materialRate.scrapRecoveryPerKg,
        scrapPercent: form.scrapPercent,
      },
      routing: operations,
      setupCost: form.setupCost,
      toolingCost: form.toolingCost,
      overheadPercent: form.overheadPercent,
      packingPerUnit: form.packingPerUnit,
      freightPerUnit: form.freightPerUnit,
      markupPercent: form.markupPercent,
      gstPercent: form.gstPercent,
    });

    const routingLines = operations.map((op, i) => ({
      hourRate: op.hourRate,
      efficiency: op.efficiency,
      costPerPiece: roundPaise(operationCostPerPiece(op, i)),
    }));
    const overheadOverridden = Number(form.overheadPercent) !== Number(overheadMaster.percent);
    return { ok: true, cost, routingLines, materialRate, overheadMaster, overheadOverridden, machineRates };
  } catch (error) {
    if (error instanceof CostInputError) return { ok: false, message: error.message, field: error.field };
    if (error instanceof RateNotFoundError || error instanceof InvalidDateError) return { ok: false, message: error.message };
    throw error; // a real bug must surface, not be shown as "invalid input"
  }
}

/** Plain strings for JSON storage (Quote.volumeTiers). Decimals never pass through floats. */
export function serializeTiers(cost: QuoteCost) {
  return cost.tiers.map((t) => ({
    factor: t.factor,
    volume: t.volume.toString(),
    material: t.material.toFixed(2),
    conversion: t.conversion.toFixed(2),
    setupTooling: t.setupTooling.toFixed(2),
    overhead: t.overhead.toFixed(2),
    packing: t.packing.toFixed(2),
    freight: t.freight.toFixed(2),
    totalCost: t.totalCost.toFixed(2),
    markup: t.markup.toFixed(2),
    pricePerUnit: t.pricePerUnit.toFixed(2),
    gst: t.gst.toFixed(2),
    annualValue: t.annualValue.toFixed(2),
  }));
}
export type SerializedTier = ReturnType<typeof serializeTiers>[number];

/** The rate evidence stored with a quote version: row ids plus a copy of their values. */
export function snapshotFor(result: Extract<CostingResult, { ok: true }>, quotedOn: IsoDate): { rateRowIds: RateRowIds; ratesSnapshot: RatesSnapshot } {
  return buildRatesSnapshot({ materials: [result.materialRate], machines: result.machineRates, overhead: [result.overheadMaster] }, quotedOn);
}

export interface PartValues {
  materialCode: string | null;
  grossWeightKg: string | null;
  netWeightKg: string | null;
  annualVolume: number | null;
  setupCost: string;
  toolingCost: string;
  routing: RoutingRowForm[];
}

/**
 * Starting form for a part. A saved quote's inputs win (so reopening shows the last work);
 * otherwise the part's own values plus defaults, with overhead taken from the rate master.
 * The quote date is always today unless a saved quote says otherwise (assumption R-05).
 */
export function initialForm(part: PartValues, latest: CostingForm | null, rates: RateTables, today: IsoDate): CostingForm {
  const quotedOn = latest?.quotedOn ?? today;
  const master = rates.overhead.length ? safeOverheadPercent(rates.overhead, quotedOn) : "";
  const freight = DEFAULT_COSTING_INPUTS.freightPerUnit;
  return {
    quotedOn,
    materialCode: part.materialCode ?? "",
    grossWeightKg: part.grossWeightKg ?? "",
    netWeightKg: part.netWeightKg ?? "",
    annualVolume: part.annualVolume === null ? "" : String(part.annualVolume),
    setupCost: part.setupCost,
    toolingCost: part.toolingCost,
    routing: part.routing.length ? part.routing : [{ operation: "", machineCode: "", cycleTimeMin: "" }],
    scrapPercent: latest?.scrapPercent ?? DEFAULT_COSTING_INPUTS.scrapPercent,
    overheadPercent: latest?.overheadPercent ?? master,
    packingPerUnit: latest?.packingPerUnit ?? DEFAULT_COSTING_INPUTS.packingPerUnit,
    freightPerUnit: latest?.freightPerUnit ?? [freight, freight, freight],
    markupPercent: latest?.markupPercent ?? DEFAULT_COSTING_INPUTS.markupPercent,
    gstPercent: latest?.gstPercent ?? DEFAULT_COSTING_INPUTS.gstPercent,
  };
}

function safeOverheadPercent(rows: readonly OverheadRateRow[], on: IsoDate): string {
  try {
    return String(Number(lookupOverheadRate(rows, OVERHEAD_CATEGORY, on).percent));
  } catch {
    return "";
  }
}
