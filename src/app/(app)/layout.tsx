import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { signOut } from "@/auth";
import { APPROVAL_THRESHOLD_INR } from "@/lib/cost-engine";
import { formatDate, todayIst } from "@/lib/format/dates";
import { formatRupees } from "@/lib/format/currency";
import { currentUser } from "@/server/guard";
import { latestRateDateInForce } from "@/server/repositories/rates";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/sign-in" });
  }

  const ratesFrom = await latestRateDateInForce(todayIst());
  return (
    <AppShell
      user={user}
      signOutAction={signOutAction}
      facts={{ ratesFrom: ratesFrom ? formatDate(ratesFrom) : null, approvalThreshold: formatRupees(APPROVAL_THRESHOLD_INR) }}
    >
      {children}
    </AppShell>
  );
}
