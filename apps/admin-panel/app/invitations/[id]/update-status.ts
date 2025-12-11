"use server"

import { getClient } from "../../graphql-rsc"

import {
  AccountDetailsByAccountIdDocument,
  AccountDetailsByAccountIdQuery,
  AccountDetailsByAccountIdQueryVariables,
  notificationMessageUpdateStatus,
} from "../../../generated"
import { AuditedAccountMainValues } from "../../types"

export const updateInvitationStatus = async () => {
  console.warn("Update Status")

  await getClient().query<>({
    query: notificationMessageUpdateStatus,
  })
}
