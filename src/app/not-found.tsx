import Link from "next/link";
import { EmptyState } from "@/components/ui/StateMessage";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <EmptyState
        title="Page not found"
        description="The page may have moved, or the link is wrong."
        action={
          <Link href="/rfqs" className="text-sm text-primary underline">
            Go to RFQs
          </Link>
        }
      />
    </main>
  );
}
