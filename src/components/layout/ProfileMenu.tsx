"use client";

import { LogOut } from "lucide-react";
import { useRef } from "react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const ROLE_LABEL = { estimator: "Estimator", sales_head: "Sales head" } as const;

interface Props {
  name: string;
  email: string;
  role: keyof typeof ROLE_LABEL;
  signOutAction: () => Promise<void>;
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");

export function ProfileMenu({ name, email, role, signOutAction }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <>
      <form ref={formRef} action={signOutAction} className="hidden" />
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Account menu for ${name}`}
          className={cn(buttonVariants({ variant: "ghost" }), "h-10 gap-2 rounded-lg px-2")}
        >
          <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
            {initials(name)}
          </span>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-sm font-medium">{name}</span>
            <span className="block text-xs text-muted-foreground">{ROLE_LABEL[role]}</span>
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-56">
          <DropdownMenuLabel className="font-normal">
            <span className="block text-sm font-medium">{name}</span>
            <span className="block truncate text-xs text-muted-foreground">{email}</span>
            <span className="block text-xs text-muted-foreground">{ROLE_LABEL[role]}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => formRef.current?.requestSubmit()}>
            <LogOut aria-hidden="true" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
