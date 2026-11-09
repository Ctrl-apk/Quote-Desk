import { Badge } from "@/components/ui/badge";
import type { RfqStatusValue } from "@/lib/rfq/overdue";

const CONFIG: Record<RfqStatusValue, { label: string; variant: "info" | "outline" | "success" | "secondary" }> = {
  estimating: { label: "Estimating", variant: "info" },
  sent: { label: "Sent", variant: "outline" },
  won: { label: "Won", variant: "success" },
  lost: { label: "Lost", variant: "secondary" },
};

export function StatusBadge({ status }: { status: RfqStatusValue }) {
  const { label, variant } = CONFIG[status];
  return <Badge variant={variant}>{label}</Badge>;
}
