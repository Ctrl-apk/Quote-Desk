"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import type { Role } from "@/lib/auth/permissions";
import { navFor } from "./nav";
import { SidebarNavItem } from "./SidebarNavItem";

/** Icon rail on desktop. Hidden on phones, where MobileNavigation takes over. */
export function AppSidebar({ role }: { role: Role }) {
  return (
    <aside
      aria-label="Primary navigation"
      className="fixed inset-y-0 left-0 z-30 hidden w-17 flex-col items-center border-r border-sidebar-border bg-sidebar px-2.5 py-4 text-sidebar-foreground md:flex"
    >
      <div className="flex w-full justify-center border-b border-sidebar-border pb-4">
        <Logo />
      </div>
      <nav aria-label="Main" className="mt-5 flex flex-col items-center gap-3">
        {navFor(role).map((item) => (
          <SidebarNavItem key={item.href} item={item} />
        ))}
      </nav>
    </aside>
  );
}

export function MobileNavigation({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Open navigation menu"
        className={cn(buttonVariants({ variant: "ghost", size: "icon-lg" }), "md:hidden")}
      >
        <Menu aria-hidden="true" className="size-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-4/5 gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground sm:max-w-xs">
        <SheetHeader className="border-b border-sidebar-border">
          <SheetTitle>
            <Logo showName />
          </SheetTitle>
          <SheetDescription className="sr-only">Navigate between screens</SheetDescription>
        </SheetHeader>
        <nav aria-label="Main" className="flex flex-col gap-1 p-3">
          {navFor(role).map((item) => (
            <SidebarNavItem key={item.href} item={item} showLabel onNavigate={() => setOpen(false)} />
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
