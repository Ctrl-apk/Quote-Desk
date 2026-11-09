import type { IsoDate } from "@/lib/rates/types";

export type RfqStatusValue = "estimating" | "sent" | "won" | "lost";

/**
 * An RFQ is overdue when it is still being estimated and its due date is before today
 * (assumption O-01). Once sent, won or lost it is never overdue. Due today is not overdue.
 */
export function isOverdue(status: RfqStatusValue, dueDate: IsoDate, today: IsoDate): boolean {
  return status === "estimating" && dueDate < today;
}
