import { rule } from "graphql-shield"

/**
 * Admin Access Rules for GraphQL Shield
 * 
 * This module contains the actual GraphQL Shield rules that can be used
 * directly in field definitions. Each rule checks if the user has the
 * required permission in their JWT scope.
 */

// Admin access rights enum
enum AdminAccessRight {
  VIEW_ACCOUNTS = "VIEW_ACCOUNTS",
  MODIFY_ACCOUNTS = "MODIFY_ACCOUNTS",
  DELETE_ACCOUNTS = "DELETE_ACCOUNTS", 
  VIEW_TRANSACTIONS = "VIEW_TRANSACTIONS",
  SEND_NOTIFICATIONS = "SEND_NOTIFICATIONS",
  SYSTEM_CONFIG = "SYSTEM_CONFIG",
}

// Helper function to create access right rules
const createAccessRightRule = (accessRight: AdminAccessRight) =>
  rule({ cache: "contextual" })(async (parent, args, ctx: GraphQLAdminContext) => {
    if (!ctx.userEmail || !ctx.scope) return false
    return ctx.scope.includes(accessRight)
  })

// Export the actual GraphQL Shield rules that can be used directly
export const accessRules = {
  viewAccounts: createAccessRightRule(AdminAccessRight.VIEW_ACCOUNTS),
  modifyAccounts: createAccessRightRule(AdminAccessRight.MODIFY_ACCOUNTS),
  deleteAccounts: createAccessRightRule(AdminAccessRight.DELETE_ACCOUNTS),
  viewTransactions: createAccessRightRule(AdminAccessRight.VIEW_TRANSACTIONS),
  sendNotifications: createAccessRightRule(AdminAccessRight.SEND_NOTIFICATIONS),
  systemConfig: createAccessRightRule(AdminAccessRight.SYSTEM_CONFIG),
}

/**
 * Extracts GraphQL field configurations from a structure that contains both fields and rules.
 *
 * This function takes an object where each property contains both a GraphQL field configuration
 * and an access rule, and returns a new object with just the field configurations. This is
 * used to prepare the fields for GraphQL schema construction.
 *
 * @template T - The type of the input object containing field/rule pairs
 * @param fieldsWithRules - Object where each property has { field, rule } structure
 * @returns Object containing only the GraphQL field configurations
 *
 * @example
 * ```typescript
 * const input = {
 *   userQuery: { field: UserQueryField, rule: viewAccountsRule },
 *   adminQuery: { field: AdminQueryField, rule: adminRule }
 * }
 * const fields = extractFields(input)
 * // Result: { userQuery: UserQueryField, adminQuery: AdminQueryField }
 * ```
 */
export function extractFields<T extends Record<string, { field: any; rule: any }>>(
  fieldsWithRules: T
): Record<keyof T, any> {
  const result: Record<string, any> = {}
  for (const [key, value] of Object.entries(fieldsWithRules)) {
    result[key] = value.field
  }
  return result as Record<keyof T, any>
}

/**
 * Builds a permission mapping from field names to their corresponding access rules.
 *
 * This function takes an object where each property contains both a GraphQL field configuration
 * and an access rule, and returns a mapping from field names to their access rules. This
 * mapping is used by GraphQL Shield to apply authorization rules to specific fields.
 *
 * @template T - The type of the input object containing field/rule pairs
 * @param fieldsWithRules - Object where each property has { field, rule } structure
 * @returns Object mapping field names to their access rules
 *
 * @example
 * ```typescript
 * const input = {
 *   userQuery: { field: UserQueryField, rule: viewAccountsRule },
 *   adminQuery: { field: AdminQueryField, rule: adminRule }
 * }
 * const permissions = buildPermissionMappings(input)
 * // Result: { userQuery: viewAccountsRule, adminQuery: adminRule }
 * ```
 */
export function buildPermissionMappings<T extends Record<string, { field: any; rule: any }>>(
  fieldsWithRules: T
): Record<string, any> {
  const permissionMap: Record<string, any> = {}

  for (const [fieldName, { rule }] of Object.entries(fieldsWithRules)) {
    permissionMap[fieldName] = rule
  }

  return permissionMap
}
