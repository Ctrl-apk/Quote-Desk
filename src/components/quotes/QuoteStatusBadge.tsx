import { Badge } from "@/components/ui/badge";
import type { QuoteStatusValue } from "@/lib/quote/submit";

const CONFIG: Record<QuoteStatusValue, { label: string; variant: "outline" | "warning" | "info" | "destructive" | "success" }> = {
  draft: { label: "Draft", variant: "outline" },
  pending_approval: { label: "Needs approval", variant: "warning" },
  approved: { label: "Approved", variant: "info" },
  rejected: { label: "Rejected", variant: "destructive" },
  ready_to_send: { label: "Ready to send", variant: "info" },
  sent: { label: "Sent", variant: "success" },
};

export function QuoteStatusBadge({ status }: { status: QuoteStatusValue }) {
  const { label, variant } = CONFIG[status];
  return <Badge variant={variant}>{label}</Badge>;
}
