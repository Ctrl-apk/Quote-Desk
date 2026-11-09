-- Database-level protection for the audit trail, quote snapshots and workflow states.
-- The application enforces the same rules; these triggers make a bug or a manual SQL slip unable to break them.

-- 1. Audit records are append-only: no update, no delete, no truncate.
CREATE FUNCTION reject_audit_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only: % is not allowed.', TG_OP USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_append_only"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION reject_audit_change();

CREATE TRIGGER "AuditLog_no_truncate"
  BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_change();

-- 2. A material rate whose recovery exceeds the buying rate could produce a negative material cost.
ALTER TABLE "RateMaterial" ADD CONSTRAINT "RateMaterial_recovery_le_rate_chk"
  CHECK ("scrapRecoveryPerKg" <= "ratePerKg");

-- 3. Decision fields must agree with the status.
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_decision_chk" CHECK (
  ("status" NOT IN ('approved', 'rejected') OR ("approverId" IS NOT NULL AND "decidedAt" IS NOT NULL))
  AND ("status" <> 'rejected' OR ("approvalComment" IS NOT NULL AND length(btrim("approvalComment")) > 0))
);

-- 4. A saved quote version is a historical record: its inputs, rates and results never change,
--    and it is never deleted. Only the workflow columns (status, approver, comment, decision time) may move,
--    and only along the allowed transitions.
CREATE FUNCTION guard_quote_change() RETURNS trigger AS $$
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
      OR (OLD."status" = 'draft' AND NEW."status" = 'sent' AND NOT OLD."requiresApproval")
      OR (OLD."status" = 'pending_approval' AND NEW."status" IN ('approved', 'rejected'))
      OR (OLD."status" = 'approved' AND NEW."status" = 'sent')
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

CREATE TRIGGER "Quote_guard_change"
  BEFORE UPDATE OR DELETE ON "Quote"
  FOR EACH ROW EXECUTE FUNCTION guard_quote_change();

-- 5. RFQ status only moves forward: estimating -> sent -> won or lost.
CREATE FUNCTION guard_rfq_status() RETURNS trigger AS $$
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
    (OLD."status" = 'estimating' AND NEW."status" = 'sent')
    OR (OLD."status" = 'sent' AND NEW."status" IN ('won', 'lost'))
  ) THEN
    RAISE EXCEPTION 'RFQ status cannot change from % to %.', OLD."status", NEW."status" USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Rfq_guard_status"
  BEFORE UPDATE ON "Rfq"
  FOR EACH ROW EXECUTE FUNCTION guard_rfq_status();
