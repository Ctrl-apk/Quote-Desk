import Link from "next/link";
import { ErrorState } from "@/components/ui/StateMessage";

export default function ForbiddenPage() {
  return (
    <ErrorState
      title="You do not have access to this page"
      description="Your role does not allow it. If you think this is a mistake, ask the sales head."
      action={
        <Link href="/rfqs" className="text-sm text-primary underline">
          Back to RFQs
        </Link>
      }
    />
  );
}
