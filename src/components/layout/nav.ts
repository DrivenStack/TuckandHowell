import { Bot, ListChecks, type LucideIcon, PhoneOff } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV: NavItem[] = [
  { href: "/", label: "Abandoned", icon: PhoneOff },
  { href: "/broccoli", label: "Broccoli calls", icon: Bot },
  { href: "/callbacks", label: "Callbacks", icon: ListChecks },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
