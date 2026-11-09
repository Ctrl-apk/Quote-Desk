import { renderToBuffer } from "@react-pdf/renderer";
import { authErrorToResponse } from "@/lib/auth";
import { buildPdfContent } from "@/lib/quote/pdf-content";
import { canIssuePdf } from "@/lib/quote/workflow";
import { requirePermission } from "@/server/guard";
import { QuotePdf } from "@/server/pdf/QuotePdf";
import { getQuoteDetail } from "@/server/repositories/quotes";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ quoteId: string }> }) {
  try {
    await requirePermission("rfq:view");
    const q = await getQuoteDetail((await params).quoteId);
    if (!q) return Response.json({ error: "Quote not found." }, { status: 404 });
    if (!canIssuePdf(q.status)) return Response.json({ error: "The PDF is available once the sales head has sent the quote." }, { status: 409 });

    const content = buildPdfContent({
      rfqNo: q.rfq.rfqNo, version: q.version, customer: q.rfq.customer, partName: q.part.name,
      materialCode: q.inputs.materialCode, quotedOn: q.quotedOn, gstPercent: q.inputs.gstPercent, tiers: q.tiers, preparedBy: q.createdBy,
    });
    const buffer = await renderToBuffer(QuotePdf({ c: content }));
    return new Response(new Uint8Array(buffer), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${content.reference}.pdf"`, "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const res = authErrorToResponse(error);
    if (res) return res;
    console.error("pdf failed:", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Could not create the PDF." }, { status: 500 });
  }
}
