import { getServerSession } from "next-auth"

import { authOptions } from "./api/auth/[...nextauth]/options"
import { AdminAccessRight, hasAccessRightInScope } from "./access-rights"

export const getScope = async (): Promise<string> => {
  const session = await getServerSession(authOptions)
  return session?.scope ?? ""
}

export const hasAccess = (scope: string, accessRight: AdminAccessRight): boolean => {
  return hasAccessRightInScope(scope, accessRight)
}
