import { rule } from "graphql-shield"
import { Rule } from "graphql-shield/typings/rules"
import { GraphQLFieldConfig } from "graphql"

import { AdminFieldDefinitions } from "./types"

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
  DELETE_ACCOUNTS = "DELETE_ACCOUNTS",
  VIEW_TRANSACTIONS = "VIEW_TRANSACTIONS",
  SEND_NOTIFICATIONS = "SEND_NOTIFICATIONS",
  SYSTEM_CONFIG = "SYSTEM_CONFIG",
  APPROVE_MERCHANT = "APPROVE_MERCHANT",
  CHANGECONTACTS_ACCOUNT = "CHANGECONTACTS_ACCOUNT",
  CHANGELEVEL_ACCOUNT = "CHANGELEVEL_ACCOUNT",
  LOCK_ACCOUNT = "LOCK_ACCOUNT",
  VIEW_MERCHANTS = "VIEW_MERCHANTS",
}

// Helper function to create access right rules
const createAccessRightRule = (accessRight: AdminAccessRight) =>
  rule({ cache: "contextual" })(async (_parent, _args, ctx: GraphQLAdminContext) => {
    if (!ctx.privilegedClientId || !ctx.scope) return false
    return ctx.scope.includes(accessRight)
  })

// Export the actual GraphQL Shield rules that can be used directly
export const accessRules = {
  viewAccounts: createAccessRightRule(AdminAccessRight.VIEW_ACCOUNTS),
  deleteAccounts: createAccessRightRule(AdminAccessRight.DELETE_ACCOUNTS),
  viewTransactions: createAccessRightRule(AdminAccessRight.VIEW_TRANSACTIONS),
  sendNotifications: createAccessRightRule(AdminAccessRight.SEND_NOTIFICATIONS),
  systemConfig: createAccessRightRule(AdminAccessRight.SYSTEM_CONFIG),
  approveMerchant: createAccessRightRule(AdminAccessRight.APPROVE_MERCHANT),
  changeContactsAccount: createAccessRightRule(AdminAccessRight.CHANGECONTACTS_ACCOUNT),
  changeLevelAccount: createAccessRightRule(AdminAccessRight.CHANGELEVEL_ACCOUNT),
  lockAccount: createAccessRightRule(AdminAccessRight.LOCK_ACCOUNT),
  viewMerchants: createAccessRightRule(AdminAccessRight.VIEW_MERCHANTS),
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
 *
```javascript
*/
export function extractFields<T extends AdminFieldDefinitions>(
  fieldsWithRules: T,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<keyof T, GraphQLFieldConfig<any, any, any>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<string, GraphQLFieldConfig<any, any, any>> = {}
  for (const [key, value] of Object.entries(fieldsWithRules)) {
    result[key] = value.field
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return result as Record<keyof T, GraphQLFieldConfig<any, any, any>>
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
 *
```typescript
* const input = {
 *   userQuery: { field: UserQueryField, rule: viewAccountsRule },
 *   adminQuery: { field: AdminQueryField, rule: adminRule }
 * }
 * const permissions = buildPermissionMappings(input)
 * // Result: { userQuery: viewAccountsRule, adminQuery: adminRule }
 *
```

 */
export function buildPermissionMappings<T extends AdminFieldDefinitions>(
  fieldsWithRules: T,
): Record<string, Rule> {
  const permissionMap: Record<string, Rule> = {}
  for (const [fieldName, { rule }] of Object.entries(fieldsWithRules)) {
    permissionMap[fieldName] = rule
  }
  return permissionMap
}
