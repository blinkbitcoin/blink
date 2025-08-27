// Admin access rights definitions
export enum AdminAccessRight {
  VIEW_ACCOUNTS = "VIEW_ACCOUNTS",
  MODIFY_ACCOUNTS = "MODIFY_ACCOUNTS",
  DELETE_ACCOUNTS = "DELETE_ACCOUNTS",
  VIEW_TRANSACTIONS = "VIEW_TRANSACTIONS",
  SEND_NOTIFICATIONS = "SEND_NOTIFICATIONS",
  SYSTEM_CONFIG = "SYSTEM_CONFIG",
}

// Role types
export type AdminRole = "VIEWER" | "SUPPORT" | "ADMIN"

// Role to access rights mapping
const ROLE_ACCESS_RIGHTS: Record<AdminRole, AdminAccessRight[]> = {
  VIEWER: [AdminAccessRight.VIEW_ACCOUNTS, AdminAccessRight.VIEW_TRANSACTIONS],
  SUPPORT: [
    AdminAccessRight.VIEW_ACCOUNTS,
    AdminAccessRight.MODIFY_ACCOUNTS,
    AdminAccessRight.VIEW_TRANSACTIONS,
    AdminAccessRight.SEND_NOTIFICATIONS,
  ],
  ADMIN: [
    AdminAccessRight.VIEW_ACCOUNTS,
    AdminAccessRight.MODIFY_ACCOUNTS,
    AdminAccessRight.DELETE_ACCOUNTS,
    AdminAccessRight.VIEW_TRANSACTIONS,
    AdminAccessRight.SEND_NOTIFICATIONS,
    AdminAccessRight.SYSTEM_CONFIG,
  ],
}

/**
 * Get access rights for a given role
 * @param role - The admin role
 * @returns Array of access rights for the role
 */
export function getAccessRightsForRole(role: AdminRole): AdminAccessRight[] {
  return ROLE_ACCESS_RIGHTS[role] || []
}

/**
 * Check if a role has a specific access right
 * @param role - The admin role
 * @param accessRight - The access right to check
 * @returns True if the role has the access right
 */
export function hasAccessRight(role: AdminRole, accessRight: AdminAccessRight): boolean {
  return ROLE_ACCESS_RIGHTS[role]?.includes(accessRight) || false
}

/**
 * Get all available access rights
 * @returns Array of all access rights
 */
export function getAllAccessRights(): AdminAccessRight[] {
  return Object.values(AdminAccessRight)
}

/**
 * Validate if a string is a valid admin role
 * @param role - The role string to validate
 * @returns True if the role is valid
 */
export function isValidAdminRole(role: string): role is AdminRole {
  return role === "VIEWER" || role === "SUPPORT" || role === "ADMIN"
}
