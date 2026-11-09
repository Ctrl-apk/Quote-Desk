import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth/SignInForm";
import { Logo } from "@/components/layout/Logo";
import { safeCallbackUrl } from "@/lib/auth";
import { currentUser } from "@/server/guard";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const callbackUrl = safeCallbackUrl((await searchParams).callbackUrl);
  if (await currentUser()) redirect(callbackUrl);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-sidebar px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-xs sm:p-8">
        <Logo showName className="mb-6" />
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="mb-6 mt-1 text-sm text-muted-foreground">Cost parts and manage RFQs for Company A.</p>
        <SignInForm callbackUrl={callbackUrl} />
      </div>
    </main>
  );
}
