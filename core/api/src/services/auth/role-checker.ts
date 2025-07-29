



export enum AdminRole {
  VIEWER = "roles/adminPanelViewer",
  SUPPORT = "roles/adminPanelSupport",
  ADMIN = "roles/adminPanelAdmin",
}

export enum AdminAccessRight {
  VIEW_ACCOUNTS = "VIEW_ACCOUNTS",
  MODIFY_ACCOUNTS = "MODIFY_ACCOUNTS",
  DELETE_ACCOUNTS = "DELETE_ACCOUNTS",
  VIEW_TRANSACTIONS = "VIEW_TRANSACTIONS",
  SEND_NOTIFICATIONS = "SEND_NOTIFICATIONS",
  SYSTEM_CONFIG = "SYSTEM_CONFIG",
}

// String-based role values from options.ts
export type AdminRoleString = "VIEWER" | "SUPPORT" | "ADMIN"

// String-based role access rights mapping
const STRING_ROLE_ACCESS_RIGHTS = {
  VIEWER: [AdminAccessRight.VIEW_ACCOUNTS, AdminAccessRight.VIEW_TRANSACTIONS],
  SUPPORT: [
    AdminAccessRight.VIEW_ACCOUNTS,
    AdminAccessRight.MODIFY_ACCOUNTS,
    AdminAccessRight.VIEW_TRANSACTIONS,
    AdminAccessRight.SEND_NOTIFICATIONS,
  ],
  ADMIN: Object.values(AdminAccessRight),
}


export const hasAccessRight = async (
  role: AdminRoleString,
  accessRight: AdminAccessRight,
): Promise<boolean> => {
  return STRING_ROLE_ACCESS_RIGHTS[role]?.includes(accessRight) || false
}

// Backward compatibility - deprecated, use AdminAccessRight instead
export const AdminFeature = AdminAccessRight

// Backward compatibility - deprecated, use hasAccessRight instead
export const hasFeature = hasAccessRight
