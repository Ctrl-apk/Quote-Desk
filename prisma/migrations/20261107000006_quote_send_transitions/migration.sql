-- Quote status moves: draft -> pending_approval (needs approval) or ready_to_send (does not).
-- The sales head approves or rejects, and sends. A draft can no longer jump straight to sent.
CREATE OR REPLACE FUNCTION guard_quote_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Quote versions are never deleted.' USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW."partId" IS DISTINCT FROM OLD."partId"
     OR NEW."version" IS DISTINCT FROM OLD."version"
     OR NEW."quotedOn" IS DISTINCT FROM OLD."quotedOn"
     OR NEW."inputs" IS DISTINCT FROM OLD."inputs"
     OR NEW."ratesSnapshot" IS DISTINCT FROM OLD."ratesSnapshot"
     OR NEW."rateRowIds" IS DISTINCT FROM OLD."rateRowIds"
     OR NEW."volumeTiers" IS DISTINCT FROM OLD."volumeTiers"
     OR NEW."annualValue" IS DISTINCT FROM OLD."annualValue"
     OR NEW."requiresApproval" IS DISTINCT FROM OLD."requiresApproval"
     OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'A saved quote version cannot be edited; save a new version instead.' USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF NOT (
      (OLD."status" = 'draft' AND NEW."status" = 'pending_approval' AND OLD."requiresApproval")
      OR (OLD."status" = 'draft' AND NEW."status" = 'ready_to_send' AND NOT OLD."requiresApproval")
      OR (OLD."status" = 'pending_approval' AND NEW."status" IN ('approved', 'rejected'))
      OR (OLD."status" = 'approved' AND NEW."status" = 'sent')
      OR (OLD."status" = 'ready_to_send' AND NEW."status" = 'sent' AND NOT OLD."requiresApproval")
    ) THEN
      RAISE EXCEPTION 'Quote status cannot change from % to % (requires approval: %).', OLD."status", NEW."status", OLD."requiresApproval"
        USING ERRCODE = 'restrict_violation';
    END IF;
  ELSIF NEW."approverId" IS DISTINCT FROM OLD."approverId"
     OR NEW."approvalComment" IS DISTINCT FROM OLD."approvalComment"
     OR NEW."decidedAt" IS DISTINCT FROM OLD."decidedAt" THEN
    RAISE EXCEPTION 'A decision is recorded once, together with the status change.' USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
