/**
 * Routing suggestions come from one past quote of a similar part (same material, gross weight
 * within 10%, closest weight first). They are never applied on their own: the estimator reads the
 * reference, chooses to use it, and can then change every value like any other input.
 * Pure: no database, no AI.
 */
export interface SuggestedStep {
  operation: string;
  machineCode: string;
  cycleTimeMin: string;
}

export interface RoutingReference {
  partName: string;
  partNumber: string | null;
  customer: string;
  quoteRef: string;
  quotedOn: string;
  materialCode: string;
  grossWeightKg: string;
}

export interface RoutingSuggestion {
  reference: RoutingReference;
  steps: SuggestedStep[];
}

/**
 * Turns suggested steps into form rows. A machine that has no rate today is left blank (not guessed)
 * and reported, so the estimator picks one; costing cannot run on a machine without a rate anyway.
 */
export function stepsToFormRows(steps: readonly SuggestedStep[], knownMachines: readonly string[]): { rows: SuggestedStep[]; unknownMachines: string[] } {
  const known = new Set(knownMachines);
  const unknown = new Set<string>();
  const rows = steps.map((s) => {
    if (known.has(s.machineCode)) return { ...s };
    unknown.add(s.machineCode);
    return { ...s, machineCode: "" };
  });
  return { rows, unknownMachines: [...unknown] };
}
