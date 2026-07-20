"use client";

import {
  BarChart3,
  ClipboardList,
  FolderOpen,
  LayoutDashboard,
  ListChecks,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

import { signOutAction } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";
import type { RoleCode } from "@/server/permissions";

const ADMIN_ROLES: RoleCode[] = ["SUPER_ADMIN", "GROUP_HS_ADMIN"];

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

interface NavSection {
  section: string;
  items: NavItem[];
}

const NAV: NavSection[] = [
  {
    section: "Operate",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/incidents", label: "Incidents", icon: ShieldAlert },
    ],
  },
  {
    section: "Manage",
    items: [
      { href: "/capa", label: "CAPA register", icon: ListChecks },
      { href: "/documents", label: "Evidence library", icon: FolderOpen },
    ],
  },
  {
    section: "Assurance",
    items: [
      { href: "/framework", label: "H&S Framework", icon: ShieldCheck },
      { href: "/audits", label: "Audits", icon: ClipboardList },
      { href: "/kpis", label: "KPIs", icon: BarChart3 },
    ],
  },
];

export function AppNav({ roleCodes, fullName }: { roleCodes: RoleCode[]; fullName: string }) {
  const pathname = usePathname();
  const isAdmin = roleCodes.some((code) => ADMIN_ROLES.includes(code));
  const initials =
    fullName
      .split(" ")
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "SG";

  return (
    <aside className="bg-sidebar text-sidebar-foreground flex flex-col md:sticky md:top-0 md:h-svh">
      <Link
        href="/dashboard"
        className="border-sidebar-border flex items-center gap-3 border-b px-5 py-5 text-[15px] font-semibold text-white"
      >
        <span className="bg-warning text-warning-foreground flex size-7 items-center justify-center rounded-full text-sm">
          ☀
        </span>
        SafeGuard
      </Link>
      <nav className="flex-1 overflow-y-auto px-2.5 py-3">
        {NAV.map((group) => (
          <div key={group.section}>
            <div className="text-sidebar-foreground/50 px-3 pt-3.5 pb-1.5 text-[10.5px] font-semibold tracking-widest uppercase">
              {group.section}
            </div>
            {group.items.map((item) => {
              const active = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px]",
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold"
                      : "hover:bg-sidebar-accent hover:text-white",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
        {isAdmin ? (
          <div>
            <div className="text-sidebar-foreground/50 px-3 pt-3.5 pb-1.5 text-[10.5px] font-semibold tracking-widest uppercase">
              Admin
            </div>
            <Link
              href="/admin/registrations"
              className={cn(
                "mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px]",
                pathname.startsWith("/admin")
                  ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold"
                  : "hover:bg-sidebar-accent hover:text-white",
              )}
            >
              <UserCog className="size-4 shrink-0" />
              Admin
            </Link>
          </div>
        ) : null}
      </nav>
      <div className="border-sidebar-border border-t px-4 py-3.5 text-[12.5px]">
        <Link href="/account" className="mb-2.5 block hover:text-white">
          <span className="flex items-center gap-2">
            <span className="bg-sidebar-accent flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white">
              {initials}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold text-white">
                {fullName}
              </span>
              <span className="text-sidebar-foreground/70 block truncate text-[11.5px]">
                {roleCodes.join(", ") || "No role assigned"}
              </span>
            </span>
          </span>
        </Link>
        <form action={signOutAction}>
          <button
            type="submit"
            className="bg-sidebar-accent flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-[12px] text-white hover:bg-white/15"
          >
            <LogOut className="size-3.5" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
