import { can, type Permission, type Role } from "@/lib/auth/permissions";
import { ClipboardList, FileCheck, Gauge, History, Inbox, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown only to roles holding this permission, so nobody sees a link that ends in "forbidden". */
  permission?: Permission;
}

/** Only screens that exist appear here; new screens are added as they are built. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/rfqs", label: "RFQs", icon: ClipboardList },
  { href: "/intake", label: "Intake desk", icon: Inbox, permission: "rfq:create" },
  { href: "/quotes", label: "Quotes", icon: FileCheck },
  { href: "/past-quotes", label: "Past quotes", icon: History },
  { href: "/rates", label: "Rate masters", icon: Gauge },
];

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Title shown in the top bar. */
export function titleForPath(pathname: string): string {
  if (/^\/rfqs\/[^/]+\/parts\//.test(pathname)) return "Part costing";
  if (pathname === "/rfqs/new") return "New RFQ";
  if (/^\/rfqs\/[^/]+$/.test(pathname)) return "RFQ";
  if (/^\/quotes\/[^/]+/.test(pathname)) return "Quote review";
  return NAV_ITEMS.find((item) => isActive(pathname, item.href))?.label ?? "Quote desk";
}

export function navFor(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.permission || can(role, item.permission));
}
