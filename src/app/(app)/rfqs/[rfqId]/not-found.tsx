import Link from "next/link";
import { EmptyState } from "@/components/ui/StateMessage";

export default function RfqNotFound() {
  return <EmptyState title="RFQ not found" description="It may have been removed, or the link is wrong." action={<Link href="/rfqs" className="text-sm font-medium text-primary underline">Back to RFQs</Link>} />;
}
