export type QuoteStatusValue = "draft" | "pending_approval" | "approved" | "rejected" | "ready_to_send" | "sent";

export type SubmitDecision =
  | { ok: true; nextStatus: "pending_approval" | "ready_to_send" }
  | { ok: false; reason: "not_draft" | "superseded" | "unaccepted_values"; message: string };

/**
 * What happens when an estimator submits a saved quote version.
 *  - Only a draft can be submitted, and only the latest version of its part.
 *  - Any AI-filled value not yet accepted blocks it (brief: costing cannot be submitted while unaccepted).
 *  - Above the approval threshold it goes to the sales head; at or below it, it is ready for the sales head to send. The estimator never sends.
 */
export function decideSubmit(input: {
  status: QuoteStatusValue;
  /** False when a newer version of the same part exists. */
  isLatest: boolean;
  requiresApproval: boolean;
  unacceptedFields: readonly string[];
}): SubmitDecision {
  if (input.status !== "draft") {
    return { ok: false, reason: "not_draft", message: "This version has already been submitted. Save a new version to change it." };
  }
  if (!input.isLatest) {
    return { ok: false, reason: "superseded", message: "A newer version exists. Submit the latest version instead." };
  }
  if (input.unacceptedFields.length > 0) {
    return { ok: false, reason: "unaccepted_values", message: `Accept or correct ${input.unacceptedFields.join(", ")} before submitting.` };
  }
  return { ok: true, nextStatus: input.requiresApproval ? "pending_approval" : "ready_to_send" };
}
