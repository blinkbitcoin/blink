// eslint-disable-next-line import/no-unassigned-import
import "server-only"

import { getServerSession } from "next-auth"

import { authOptions } from "./api/auth/[...nextauth]/options"

export const getScope = async (): Promise<string> => {
  const session = await getServerSession(authOptions)
  return session?.scope ?? ""
}
