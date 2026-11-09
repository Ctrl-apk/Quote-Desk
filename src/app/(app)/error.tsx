"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/StateMessage";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      title="Something went wrong"
      description="The page could not be loaded. Your data has not been changed."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
