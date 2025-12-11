"use server"

import { getClient } from "../../app/graphql-rsc"

import {
  NotificationMessagesDocument,
  NotificationMessagesQuery,
  NotificationMessagesQueryVariables,
  NotificationMessageUpdateStatusMutation,
  NotificationMessageUpdateStatusMutationVariables,
  NotificationMessageUpdateStatusDocument,
  NotificationMessageUpdateStatusInput,
} from "../../generated"

export const getInvitations = async (): Promise<NotificationMessagesQuery> => {
  console.warn("Get invitations")

  const { data } = await getClient().query<
    NotificationMessagesQuery,
    NotificationMessagesQueryVariables
  >({
    query: NotificationMessagesDocument,
  })

  return data
}

export const RevokeInvitation = async (data: NotificationMessageUpdateStatusInput) => {
  console.warn("Revoke invitation")

  await getClient().mutate<
    NotificationMessageUpdateStatusMutation,
    NotificationMessageUpdateStatusMutationVariables
  >({
    mutation: NotificationMessageUpdateStatusDocument,
    variables: {
      input: {
        id: data.id,
        status: data.status,
      },
    },
  })

  return data
}
