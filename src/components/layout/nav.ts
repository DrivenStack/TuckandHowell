import {
  BarChart3,
  Bot,
  Eye,
  FileText,
  Gauge,
  type LucideIcon,
  Megaphone,
  PhoneIncoming,
  Settings,
  Users,
  Workflow,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the mobile bottom bar */
  tab?: boolean;
  csr?: boolean;
}

export const NAV: NavItem[] = [
  { href: "/", label: "Today", icon: Gauge, tab: true },
  { href: "/callbacks", label: "Callbacks", icon: PhoneIncoming, tab: true, csr: true },
  { href: "/leads", label: "Leads", icon: Workflow, tab: true },
  { href: "/team", label: "Team", icon: Users, tab: true },
  { href: "/ai-agent", label: "AI Voice Agent", icon: Bot },
  { href: "/sources", label: "Lead sources", icon: Megaphone },
  { href: "/snapshot", label: "Owner snapshot", icon: Eye },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const MY_NUMBERS_ICON = FileText;

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
