"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { signOutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RoleCode } from "@/server/permissions";

const ADMIN_ROLES: RoleCode[] = ["SUPER_ADMIN", "GROUP_HS_ADMIN"];

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/incidents", label: "Incidents" },
  { href: "/capa", label: "CAPA" },
  { href: "/framework", label: "H&S Framework" },
  { href: "/audits", label: "Audits" },
  { href: "/documents", label: "Documents" },
  { href: "/kpis", label: "KPIs" },
];

export function AppNav({ roleCodes }: { roleCodes: RoleCode[] }) {
  const pathname = usePathname();
  const isAdmin = roleCodes.some((code) => ADMIN_ROLES.includes(code));

  return (
    <header className="flex items-center justify-between border-b px-6 py-3">
      <nav className="flex items-center gap-1">
        <Link href="/dashboard" className="mr-4 flex items-center gap-2 text-sm font-semibold">
          <span className="bg-primary text-primary-foreground rounded-md px-2 py-1 text-xs">
            SG
          </span>
          SafeGuard
        </Link>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-md px-3 py-1.5 text-sm",
              pathname.startsWith(item.href) && "bg-accent text-accent-foreground",
            )}
          >
            {item.label}
          </Link>
        ))}
        {isAdmin ? (
          <Link
            href="/admin/registrations"
            className={cn(
              "text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-md px-3 py-1.5 text-sm",
              pathname.startsWith("/admin") && "bg-accent text-accent-foreground",
            )}
          >
            Admin
          </Link>
        ) : null}
      </nav>
      <form action={signOutAction}>
        <Button type="submit" variant="ghost" size="sm">
          Log out
        </Button>
      </form>
    </header>
  );
}
