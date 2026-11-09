-- Part number and drawing reference. Both optional, so existing rows and files stay valid.
-- Needed so historical quotes can be searched by part number and so intake can keep the drawing reference it read.
ALTER TABLE "Part" ADD COLUMN "partNumber" TEXT;
ALTER TABLE "Part" ADD COLUMN "drawingRef" TEXT;
ALTER TABLE "Part" ADD CONSTRAINT "Part_partNumber_len_chk" CHECK ("partNumber" IS NULL OR char_length("partNumber") BETWEEN 1 AND 40);
ALTER TABLE "Part" ADD CONSTRAINT "Part_drawingRef_len_chk" CHECK ("drawingRef" IS NULL OR char_length("drawingRef") BETWEEN 1 AND 60);

ALTER TABLE "PastQuote" ADD COLUMN "partNumber" TEXT;
ALTER TABLE "PastQuote" ADD CONSTRAINT "PastQuote_partNumber_len_chk" CHECK ("partNumber" IS NULL OR char_length("partNumber") BETWEEN 1 AND 40);
CREATE INDEX "PastQuote_partNumber_idx" ON "PastQuote"("partNumber");
CREATE INDEX "PastQuote_quotedOn_idx" ON "PastQuote"("quotedOn");
CREATE INDEX "PastQuote_quoteRef_idx" ON "PastQuote"("quoteRef");
