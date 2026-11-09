"use client";

import { usePathname } from "next/navigation";
import { MobileNavigation } from "./AppSidebar";
import { titleForPath } from "./nav";
import { ProfileMenu } from "./ProfileMenu";

export interface TopBarFacts {
  /** e.g. "1 Oct 2026": the newest rate date already in force. */
  ratesFrom: string | null;
  /** e.g. "₹ 25,00,000" */
  approvalThreshold: string;
}

type Props = {
  user: { name: string; email: string; role: "estimator" | "sales_head" };
  signOutAction: () => Promise<void>;
  facts: TopBarFacts;
};

export function TopBar({ user, signOutAction, facts }: Props) {
  const title = titleForPath(usePathname());
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-sidebar-border bg-sidebar/95 px-3 backdrop-blur sm:px-5 md:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <MobileNavigation role={user.role} />
        <h2 className="truncate text-sm font-semibold md:text-base">{title}</h2>
        {/* Real facts, in Gridline's mono status strip */}
        <dl className="ml-2 hidden h-7 shrink-0 items-center overflow-hidden rounded-md bg-muted font-mono text-xs lg:flex">
          <div className="flex h-full items-center gap-2 border-r-2 border-sidebar px-2.5">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" />
            <dt className="text-muted-foreground">Rates from</dt>
            <dd className="font-medium">{facts.ratesFrom ?? "none"}</dd>
          </div>
          <div className="flex h-full items-center gap-2 px-2.5">
            <dt className="text-muted-foreground">Approval above</dt>
            <dd className="font-medium">{facts.approvalThreshold}</dd>
          </div>
        </dl>
      </div>
      <ProfileMenu name={user.name} email={user.email} role={user.role} signOutAction={signOutAction} />
    </header>
  );
}
