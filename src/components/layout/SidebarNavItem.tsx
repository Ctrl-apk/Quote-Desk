"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { isActive, type NavItem } from "./nav";

interface Props {
  item: NavItem;
  showLabel?: boolean;
  onNavigate?: () => void;
}

export function SidebarNavItem({ item, showLabel = false, onNavigate }: Props) {
  const active = isActive(usePathname(), item.href);
  const Icon = item.icon;
  const className = cn(
    buttonVariants({ variant: "ghost", size: showLabel ? "lg" : "icon-lg" }),
    "rounded-lg text-muted-foreground",
    showLabel && "w-full justify-start gap-3",
    active && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
  );
  const content = (
    <>
      <Icon aria-hidden="true" className={showLabel ? "size-5" : "size-6"} strokeWidth={1.7} />
      {showLabel ? item.label : <span className="sr-only">{item.label}</span>}
    </>
  );

  if (showLabel) {
    return (
      <Link href={item.href} aria-current={active ? "page" : undefined} className={className} onClick={onNavigate}>
        {content}
      </Link>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link href={item.href} aria-current={active ? "page" : undefined} className={className}>
          {content}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}
