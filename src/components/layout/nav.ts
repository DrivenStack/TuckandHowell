import { ListChecks, type LucideIcon, PieChart } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV: NavItem[] = [
  { href: "/", label: "Stats", icon: PieChart },
  { href: "/callbacks", label: "Callbacks", icon: ListChecks },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
