// Admin access rights definitions
export enum AdminAccessRight {
  VIEW_ACCOUNTS = "VIEW_ACCOUNTS",
  DELETE_ACCOUNTS = "DELETE_ACCOUNTS",
  VIEW_TRANSACTIONS = "VIEW_TRANSACTIONS",
  SEND_NOTIFICATIONS = "SEND_NOTIFICATIONS",
  SYSTEM_CONFIG = "SYSTEM_CONFIG",

  // Granular access rights
  APPROVE_MERCHANT = "APPROVE_MERCHANT",
  CHANGECONTACTS_ACCOUNT = "CHANGECONTACTS_ACCOUNT",
  CHANGELEVEL_ACCOUNT = "CHANGELEVEL_ACCOUNT",
  LOCK_ACCOUNT = "LOCK_ACCOUNT",
  VIEW_MERCHANTS = "VIEW_MERCHANTS",
}

// Role types
export type AdminRole = "VIEWER" | "MARKETING" | "SUPPORTLV1" | "SUPPORTLV2" | "ADMIN"

// Role to access rights mapping
const ROLE_ACCESS_RIGHTS: Record<AdminRole, AdminAccessRight[]> = {
  VIEWER: [AdminAccessRight.VIEW_ACCOUNTS, AdminAccessRight.VIEW_TRANSACTIONS, AdminAccessRight.VIEW_MERCHANTS],
  MARKETING: [AdminAccessRight.SEND_NOTIFICATIONS],
  SUPPORTLV1: [
    AdminAccessRight.VIEW_ACCOUNTS,
    AdminAccessRight.VIEW_MERCHANTS,
    AdminAccessRight.LOCK_ACCOUNT,
    AdminAccessRight.APPROVE_MERCHANT,
    AdminAccessRight.VIEW_TRANSACTIONS,
  ],
  SUPPORTLV2: [
    // Inherits all SUPPORTLV1 rights plus additional ones
    AdminAccessRight.VIEW_ACCOUNTS,
    AdminAccessRight.VIEW_MERCHANTS,
    AdminAccessRight.LOCK_ACCOUNT,
    AdminAccessRight.APPROVE_MERCHANT,
    AdminAccessRight.VIEW_TRANSACTIONS,
    AdminAccessRight.CHANGECONTACTS_ACCOUNT,
    AdminAccessRight.CHANGELEVEL_ACCOUNT,
  ],
  ADMIN: [
    AdminAccessRight.VIEW_ACCOUNTS,
    AdminAccessRight.DELETE_ACCOUNTS,
    AdminAccessRight.VIEW_TRANSACTIONS,
    AdminAccessRight.SEND_NOTIFICATIONS,
    AdminAccessRight.SYSTEM_CONFIG,
    AdminAccessRight.APPROVE_MERCHANT,
    AdminAccessRight.CHANGECONTACTS_ACCOUNT,
    AdminAccessRight.CHANGELEVEL_ACCOUNT,
    AdminAccessRight.LOCK_ACCOUNT,
    AdminAccessRight.VIEW_MERCHANTS,
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
 * Get aggregated access rights for multiple roles
 * @param roles - Array of admin roles
 * @returns Array of unique access rights from all roles
 */
export function getAccessRightsForRoles(roles: AdminRole[]): AdminAccessRight[] {
  const allRights = new Set<AdminAccessRight>()

  for (const role of roles) {
    const roleRights = getAccessRightsForRole(role)
    roleRights.forEach((right) => allRights.add(right))
  }

  return Array.from(allRights)
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
 * Check if any of the roles has a specific access right
 * @param roles - Array of admin roles
 * @param accessRight - The access right to check
 * @returns True if any role has the access right
 */
export function hasAccessRightInRoles(
  roles: AdminRole[],
  accessRight: AdminAccessRight,
): boolean {
  return roles.some((role) => hasAccessRight(role, accessRight))
}

/**
 * Get all available access rights
 * @returns Array of all access rights
 */
export function getAllAccessRights(): AdminAccessRight[] {
  return Object.values(AdminAccessRight)
}

/**
 * Check if a scope array contains a specific access right
 * @param scope - Array of access rights from JWT token scope
 * @param accessRight - The access right to check for
 * @returns True if the scope contains the access right
 */
export function hasAccessRightInScope(
  scope: string[],
  accessRight: AdminAccessRight,
): boolean {
  return scope.includes(accessRight)
}

/**
 * Validate if a string is a valid admin role
 * @param role - The role string to validate
 * @returns True if the role is valid
 */
export function isValidAdminRole(role: string): role is AdminRole {
  return (
    role === "VIEWER" ||
    role === "MARKETING" ||
    role === "SUPPORTLV1" ||
    role === "SUPPORTLV2" ||
    role === "ADMIN"
  )
}

/**
 * Validate if all strings in an array are valid admin roles
 * @param roles - Array of role strings to validate
 * @returns True if all roles are valid
 */
export function areValidAdminRoles(roles: string[]): roles is AdminRole[] {
  return roles.every((role) => isValidAdminRole(role))
}
