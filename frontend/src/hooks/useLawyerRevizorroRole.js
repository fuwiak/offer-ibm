import { userFromStorage } from "@/utils/request";

const LAWYER_REVIZORRO_ROLES = [
  "admin",
  "partner",
  "internal_sales",
  "external_sales",
  "supplier",
  "default",
  "manager",
];

export function useLawyerRevizorroRole() {
  const user = userFromStorage();
  const role = user?.role ?? "public";

  return {
    role,
    isAdmin: role === "admin",
    isPartner: role === "partner",
    isInternalSales: role === "internal_sales",
    isExternalSales: role === "external_sales",
    isSupplier: role === "supplier",
    isPublic: !user,
    canViewPricing: ["admin", "partner", "internal_sales", "external_sales"].includes(
      role
    ),
    canManagePartners: ["admin", "internal_sales"].includes(role),
    canViewCommissions: ["admin", "external_sales"].includes(role),
    showOrders: !["public"].includes(role) && role !== "supplier",
    showSupplierOrders: role === "supplier" || role === "admin",
    isLawyerRevizorroRole: LAWYER_REVIZORRO_ROLES.includes(role),
  };
}

export default useLawyerRevizorroRole;
