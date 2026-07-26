import type { RoleCode } from "./types";

export interface NavItem {
  path: string;
  label: string;
  roles: RoleCode[] | "all";
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

const ADMIN_ONLY: RoleCode[] = ["SUPER_ADMIN"];
const GROUP_LEVEL: RoleCode[] = ["SUPER_ADMIN", "GROUP_HS_ADMIN", "EXECUTIVE_READONLY"];

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Dashboards",
    items: [
      { path: "/dashboard/admin", label: "Super Admin", roles: ["SUPER_ADMIN"] },
      { path: "/dashboard/group", label: "Group H&S / Management", roles: ["SUPER_ADMIN", "GROUP_HS_ADMIN"] },
      { path: "/dashboard/hotel", label: "Hotel GM", roles: ["HOTEL_GENERAL_MANAGER", "SUPER_ADMIN", "GROUP_HS_ADMIN"] },
      { path: "/dashboard/hso", label: "H&S Officer Workbench", roles: ["PROPERTY_HS_OFFICER", "DUTY_MANAGER", "SUPER_ADMIN", "GROUP_HS_ADMIN"] },
      { path: "/dashboard/department", label: "Department Manager", roles: ["DEPARTMENT_MANAGER", "SUPER_ADMIN"] },
      { path: "/dashboard/medical", label: "Nurse / Medical", roles: ["NURSE_MEDICAL", "SUPER_ADMIN"] },
      { path: "/dashboard/auditor", label: "Auditor / Assurance Reviewer", roles: ["INTERNAL_AUDITOR", "EXTERNAL_AUDITOR_READONLY", "SUPER_ADMIN"] },
      { path: "/dashboard/board", label: "Board / Executive", roles: ["EXECUTIVE_READONLY", "SUPER_ADMIN", "GROUP_HS_ADMIN"] },
    ],
  },
  {
    title: "Operations",
    items: [
      { path: "/incidents", label: "Incident Register", roles: "all" },
      { path: "/capa", label: "CAPA Register", roles: "all" },
      { path: "/documents", label: "Document & Evidence Library", roles: "all" },
      { path: "/controls", label: "Controls & Frameworks", roles: "all" },
      { path: "/kpis", label: "KPI Centre", roles: "all" },
      { path: "/evidence-map", label: "Assurance Evidence Map", roles: GROUP_LEVEL.concat(["INTERNAL_AUDITOR", "EXTERNAL_AUDITOR_READONLY", "PROPERTY_HS_OFFICER", "HOTEL_GENERAL_MANAGER"]) },
      { path: "/data-quality", label: "Data Quality Exceptions", roles: GROUP_LEVEL.concat(["INTERNAL_AUDITOR", "EXTERNAL_AUDITOR_READONLY"]) },
      { path: "/reports", label: "Reports & Exports", roles: GROUP_LEVEL.concat(["INTERNAL_AUDITOR", "EXTERNAL_AUDITOR_READONLY", "HOTEL_GENERAL_MANAGER"]) },
    ],
  },
  {
    title: "Administration",
    items: [
      { path: "/admin/users", label: "Users & Permissions", roles: ADMIN_ONLY },
      { path: "/admin/properties", label: "Properties & Departments", roles: ADMIN_ONLY },
      { path: "/admin/settings", label: "Settings", roles: ADMIN_ONLY },
    ],
  },
];

export function isNavItemVisible(item: NavItem, roles: RoleCode[]): boolean {
  if (item.roles === "all") return true;
  if (roles.includes("SUPER_ADMIN") || roles.includes("GROUP_HS_ADMIN")) return true;
  return item.roles.some((r) => roles.includes(r));
}

/** Where a user lands after signing in — first dashboard their role grants, per the priority
 * order in docs/2026-07-zoho-catalyst-access-and-dashboard-model.md. */
export function homePathForRoles(roles: RoleCode[]): string {
  if (roles.includes("SUPER_ADMIN")) return "/dashboard/admin";
  if (roles.includes("GROUP_HS_ADMIN")) return "/dashboard/group";
  if (roles.includes("EXECUTIVE_READONLY")) return "/dashboard/board";
  if (roles.includes("HOTEL_GENERAL_MANAGER")) return "/dashboard/hotel";
  if (roles.includes("INTERNAL_AUDITOR") || roles.includes("EXTERNAL_AUDITOR_READONLY")) return "/dashboard/auditor";
  if (roles.includes("NURSE_MEDICAL")) return "/dashboard/medical";
  if (roles.includes("DEPARTMENT_MANAGER")) return "/dashboard/department";
  if (roles.includes("PROPERTY_HS_OFFICER") || roles.includes("DUTY_MANAGER")) return "/dashboard/hso";
  return "/incidents";
}
