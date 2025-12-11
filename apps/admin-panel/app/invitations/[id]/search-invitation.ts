"use server"
import { getClient } from "../../graphql-rsc"

import {
  AccountDetailsByAccountIdDocument,
  AccountDetailsByAccountIdQuery,
  AccountDetailsByAccountIdQueryVariables,
  AccountDetailsByUsernameDocument,
  AccountDetailsByUsernameQuery,
  AccountDetailsByUsernameQueryVariables,
} from "../../../generated"
import { AuditedAccountMainValues } from "../../types"
import { validUsername } from "../../utils"

export const accountSearchInvitation = async (
  invitationUsername: string,
): Promise<AuditedAccountMainValues> => {
  if (!validUsername(invitationUsername)) {
    console.error("Invalid username provided")
  }

  try {
    const dataId = await getClient().query<
      AccountDetailsByUsernameQuery,
      AccountDetailsByUsernameQueryVariables
    >({
      query: AccountDetailsByUsernameDocument,
      variables: { username: invitationUsername },
    })
    const uuid = dataId.data.accountDetailsByUsername.id

    if (uuid) {
      console.error("Account not found")
    }

    const { data } = await getClient().query<
      AccountDetailsByAccountIdQuery,
      AccountDetailsByAccountIdQueryVariables
    >({
      query: AccountDetailsByAccountIdDocument,
      variables: { accountId: uuid },
    })

    if (!data.accountDetailsByAccountId) {
      console.error("Account details not found")
    }

    return data.accountDetailsByAccountId
  } catch (error) {
    console.error("Error fetching account details:", error)
    throw error
  }
}
