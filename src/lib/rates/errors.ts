import type { IsoDate, RateKind } from "./types";

/** No rate row is effective on the quote date. The message says what to do about it. */
export class RateNotFoundError extends Error {
  constructor(
    public readonly kind: RateKind,
    public readonly code: string,
    public readonly on: IsoDate,
    public readonly earliest?: IsoDate,
  ) {
    super(
      earliest
        ? `No ${kind} rate for ${code} on or before ${on}. Its first rate starts ${earliest}; change the quote date or add an earlier rate.`
        : `No ${kind} rate exists for ${code}. Add one in Rate masters.`,
    );
    this.name = "RateNotFoundError";
  }
}

/** Adding a rate on a date that already has one for the same code (assumption R-04). */
export class RateDateExistsError extends Error {
  constructor(
    public readonly kind: RateKind,
    public readonly code: string,
    public readonly effectiveFrom: IsoDate,
  ) {
    super(`A ${kind} rate for ${code} already exists from ${effectiveFrom}. Rates are never edited; choose a later effective date.`);
    this.name = "RateDateExistsError";
  }
}

export class InvalidDateError extends Error {
  constructor(value: string) {
    super(`"${value}" is not a valid date. Use YYYY-MM-DD.`);
    this.name = "InvalidDateError";
  }
}
