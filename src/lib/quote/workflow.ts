import type { QuoteStatusValue } from "./submit";
import type { RfqStatusValue } from "@/lib/rfq/overdue";

export type WorkflowDecision<T extends object = object> = ({ ok: true } & T) | { ok: false; message: string };

export const MIN_COMMENT_LENGTH = 3;
export const MAX_COMMENT_LENGTH = 500;

/** Sales head approves or rejects. Only a quote waiting for approval can be decided, and a rejection needs a reason. */
export function decideApproval(input: { status: QuoteStatusValue; isLatest: boolean; action: "approve" | "reject"; comment: string }): WorkflowDecision<{ nextStatus: "approved" | "rejected"; comment: string }> {
  if (input.status !== "pending_approval") return { ok: false, message: "This quote is not waiting for approval." };
  // A superseded version can be rejected to clear the queue, but never approved: only the latest version can go out.
  if (!input.isLatest && input.action === "approve") return { ok: false, message: "A newer version exists. Approve the latest version instead, or reject this one." };
  const comment = input.comment.trim();
  if (comment.length > MAX_COMMENT_LENGTH) return { ok: false, message: `Keep the comment under ${MAX_COMMENT_LENGTH} characters.` };
  if (input.action === "reject" && comment.length < MIN_COMMENT_LENGTH) return { ok: false, message: "Give a reason so the estimator knows what to change." };
  return { ok: true, nextStatus: input.action === "approve" ? "approved" : "rejected", comment };
}

/** The sales head sends an approved quote, or a quote that is ready to send because it needs no approval. A quote that needs approval can never be sent without it. */
export function decideSend(input: { status: QuoteStatusValue; requiresApproval: boolean; isLatest: boolean }): WorkflowDecision {
  if (input.status === "sent") return { ok: false, message: "This quote has already been sent." };
  if (input.status === "pending_approval") return { ok: false, message: "This quote is waiting for approval." };
  if (input.status === "rejected") return { ok: false, message: "This quote was rejected. Save a new version." };
  if (input.status === "draft") return { ok: false, message: "Submit this version first." };
  if (!input.isLatest) return { ok: false, message: "A newer version exists. Send the latest version." };
  if (input.requiresApproval && input.status !== "approved") return { ok: false, message: "This quote needs approval before it is sent." };
  if (!input.requiresApproval && input.status !== "ready_to_send") return { ok: false, message: "This quote is not ready to send." };
  return { ok: true };
}

/** The customer PDF exists only once the sales head has sent the quote. */
export function canIssuePdf(status: QuoteStatusValue): boolean {
  return status === "sent";
}

/** Marking the outcome of a sent RFQ. Lost needs a reason (also a database CHECK). */
export function decideOutcome(input: { rfqStatus: RfqStatusValue; outcome: "won" | "lost"; reason: string }): WorkflowDecision<{ reason: string | null }> {
  if (input.rfqStatus !== "sent") return { ok: false, message: "Only a sent quote can be marked won or lost." };
  const reason = input.reason.trim();
  if (input.outcome === "lost" && reason.length < MIN_COMMENT_LENGTH) return { ok: false, message: "Say why it was lost." };
  if (reason.length > MAX_COMMENT_LENGTH) return { ok: false, message: `Keep the reason under ${MAX_COMMENT_LENGTH} characters.` };
  return { ok: true, reason: input.outcome === "lost" ? reason : null };
}
