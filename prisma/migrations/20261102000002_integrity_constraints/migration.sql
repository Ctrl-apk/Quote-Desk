-- Integrity rules that Prisma's schema language cannot express.
-- Prisma does not diff CHECK constraints or triggers, so these never cause drift.

-- A lost RFQ must carry a reason.
ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_lost_requires_reason_chk"
  CHECK ("status" <> 'lost' OR ("lostReason" IS NOT NULL AND length(btrim("lostReason")) > 0));

-- Part inputs: positive weights, net never above gross, positive volume, non-negative one-off costs.
ALTER TABLE "Part" ADD CONSTRAINT "Part_values_chk" CHECK (
  ("grossWeightKg" IS NULL OR "grossWeightKg" > 0)
  AND ("netWeightKg" IS NULL OR "netWeightKg" > 0)
  AND ("grossWeightKg" IS NULL OR "netWeightKg" IS NULL OR "netWeightKg" <= "grossWeightKg")
  AND ("annualVolume" IS NULL OR "annualVolume" > 0)
  AND "setupCost" >= 0
  AND "toolingCost" >= 0
);

ALTER TABLE "RoutingStep" ADD CONSTRAINT "RoutingStep_values_chk"
  CHECK ("seq" >= 1 AND "cycleTimeMin" > 0);

-- Rate sanity.
ALTER TABLE "RateMaterial" ADD CONSTRAINT "RateMaterial_values_chk"
  CHECK ("ratePerKg" > 0 AND "scrapRecoveryPerKg" >= 0);

ALTER TABLE "RateMachine" ADD CONSTRAINT "RateMachine_values_chk"
  CHECK ("hourRate" > 0 AND "efficiency" > 0 AND "efficiency" <= 1);

ALTER TABLE "RateOverhead" ADD CONSTRAINT "RateOverhead_values_chk"
  CHECK ("percent" >= 0 AND "percent" <= 100);

ALTER TABLE "Quote" ADD CONSTRAINT "Quote_values_chk"
  CHECK ("version" >= 1 AND "annualValue" >= 0);

-- Rate tables are append-only. A new rate is a new row with a later effectiveFrom;
-- an existing row can never be changed or removed, so old quotes stay traceable.
CREATE FUNCTION reject_rate_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Rate table % is append-only: add a new row with a later effective date instead of % on an existing row.',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RateMaterial_append_only"
  BEFORE UPDATE OR DELETE ON "RateMaterial"
  FOR EACH ROW EXECUTE FUNCTION reject_rate_change();

CREATE TRIGGER "RateMachine_append_only"
  BEFORE UPDATE OR DELETE ON "RateMachine"
  FOR EACH ROW EXECUTE FUNCTION reject_rate_change();

CREATE TRIGGER "RateOverhead_append_only"
  BEFORE UPDATE OR DELETE ON "RateOverhead"
  FOR EACH ROW EXECUTE FUNCTION reject_rate_change();
