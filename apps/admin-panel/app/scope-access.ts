import { AdminAccessRight, hasAccessRightInScope } from "./access-rights"

export const hasAccess = (scope: string, accessRight: AdminAccessRight): boolean => {
  return hasAccessRightInScope(scope, accessRight)
}
