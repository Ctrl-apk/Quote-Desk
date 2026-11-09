"use client";

import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "./AppSidebar";
import { MotionProvider } from "./MotionProvider";
import { TopBar, type TopBarFacts } from "./TopBar";

interface Props {
  user: { name: string; email: string; role: "estimator" | "sales_head" };
  signOutAction: () => Promise<void>;
  facts: TopBarFacts;
  children: ReactNode;
}

export function AppShell({ user, signOutAction, facts, children }: Props) {
  return (
    <MotionProvider>
      <TooltipProvider delayDuration={200}>
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow"
        >
          Skip to content
        </a>
        <AppSidebar role={user.role} />
        <div className="md:pl-17">
          <TopBar user={user} signOutAction={signOutAction} facts={facts} />
          <main id="content" tabIndex={-1} className="mx-auto w-full max-w-[96rem] px-3 py-6 outline-none sm:px-5 md:px-8">
            {children}
          </main>
        </div>
      </TooltipProvider>
    </MotionProvider>
  );
}
