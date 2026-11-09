-- CreateEnum
CREATE TYPE "Role" AS ENUM ('estimator', 'sales_head');

-- CreateEnum
CREATE TYPE "RfqStatus" AS ENUM ('estimating', 'sent', 'won', 'lost');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('draft', 'pending_approval', 'approved', 'rejected', 'sent');

-- CreateEnum
CREATE TYPE "FieldSource" AS ENUM ('email', 'excel', 'title_block', 'manual');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rfq" (
    "id" TEXT NOT NULL,
    "rfqNo" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" "RfqStatus" NOT NULL DEFAULT 'estimating',
    "lostReason" TEXT,
    "dueDate" DATE NOT NULL,
    "sourceEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rfq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Part" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "materialCode" TEXT,
    "grossWeightKg" DECIMAL(10,4),
    "netWeightKg" DECIMAL(10,4),
    "annualVolume" INTEGER,
    "setupCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "toolingCost" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "Part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartField" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "source" "FieldSource" NOT NULL,
    "aiFilled" BOOLEAN NOT NULL DEFAULT false,
    "accepted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PartField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutingStep" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "operation" TEXT NOT NULL,
    "machineCode" TEXT NOT NULL,
    "cycleTimeMin" DECIMAL(8,3) NOT NULL,
    "suggestedFromPastQuoteId" TEXT,

    CONSTRAINT "RoutingStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateMaterial" (
    "id" TEXT NOT NULL,
    "materialCode" TEXT NOT NULL,
    "ratePerKg" DECIMAL(12,4) NOT NULL,
    "scrapRecoveryPerKg" DECIMAL(12,4) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateMachine" (
    "id" TEXT NOT NULL,
    "machineCode" TEXT NOT NULL,
    "hourRate" DECIMAL(12,2) NOT NULL,
    "efficiency" DECIMAL(5,4) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateMachine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateOverhead" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'STANDARD',
    "percent" DECIMAL(6,3) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateOverhead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'draft',
    "quotedOn" DATE NOT NULL,
    "inputs" JSONB NOT NULL,
    "ratesSnapshot" JSONB NOT NULL,
    "rateRowIds" JSONB NOT NULL,
    "volumeTiers" JSONB NOT NULL,
    "annualValue" DECIMAL(16,2) NOT NULL,
    "requiresApproval" BOOLEAN NOT NULL,
    "approverId" TEXT,
    "approvalComment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PastQuote" (
    "id" TEXT NOT NULL,
    "importKey" TEXT NOT NULL,
    "customer" TEXT NOT NULL,
    "partName" TEXT NOT NULL,
    "materialCode" TEXT NOT NULL,
    "grossWeightKg" DECIMAL(10,4) NOT NULL,
    "routing" JSONB NOT NULL,
    "pricePerUnit" DECIMAL(12,2) NOT NULL,
    "quoteRef" TEXT NOT NULL,
    "quotedOn" DATE NOT NULL,

    CONSTRAINT "PastQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "meta" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_name_key" ON "Customer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Rfq_rfqNo_key" ON "Rfq"("rfqNo");

-- CreateIndex
CREATE INDEX "Rfq_ownerId_status_idx" ON "Rfq"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Rfq_status_dueDate_idx" ON "Rfq"("status", "dueDate");

-- CreateIndex
CREATE INDEX "Rfq_customerId_idx" ON "Rfq"("customerId");

-- CreateIndex
CREATE INDEX "Part_rfqId_idx" ON "Part"("rfqId");

-- CreateIndex
CREATE INDEX "Part_materialCode_idx" ON "Part"("materialCode");

-- CreateIndex
CREATE INDEX "PartField_partId_aiFilled_accepted_idx" ON "PartField"("partId", "aiFilled", "accepted");

-- CreateIndex
CREATE UNIQUE INDEX "PartField_partId_field_key" ON "PartField"("partId", "field");

-- CreateIndex
CREATE UNIQUE INDEX "RoutingStep_partId_seq_key" ON "RoutingStep"("partId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "RateMaterial_materialCode_effectiveFrom_key" ON "RateMaterial"("materialCode", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "RateMachine_machineCode_effectiveFrom_key" ON "RateMachine"("machineCode", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "RateOverhead_category_effectiveFrom_key" ON "RateOverhead"("category", "effectiveFrom");

-- CreateIndex
CREATE INDEX "Quote_status_idx" ON "Quote"("status");

-- CreateIndex
CREATE INDEX "Quote_createdById_idx" ON "Quote"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_partId_version_key" ON "Quote"("partId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PastQuote_importKey_key" ON "PastQuote"("importKey");

-- CreateIndex
CREATE INDEX "PastQuote_materialCode_grossWeightKg_idx" ON "PastQuote"("materialCode", "grossWeightKg");

-- CreateIndex
CREATE INDEX "PastQuote_partName_idx" ON "PastQuote"("partName");

-- CreateIndex
CREATE INDEX "PastQuote_customer_idx" ON "PastQuote"("customer");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- AddForeignKey
ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Part" ADD CONSTRAINT "Part_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartField" ADD CONSTRAINT "PartField_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingStep" ADD CONSTRAINT "RoutingStep_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateMaterial" ADD CONSTRAINT "RateMaterial_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateMachine" ADD CONSTRAINT "RateMachine_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateOverhead" ADD CONSTRAINT "RateOverhead_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
