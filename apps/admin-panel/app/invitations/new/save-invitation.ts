"use server"

import { getClient } from "../../../app/graphql-rsc"

import {
  NotificationMessageCreateMutation,
  NotificationMessageCreateMutationVariables,
  NotificationMessageCreateDocument,
  NotificationMessageCreateInput,
} from "../../../generated"

export const SaveInvitation = async (data: NotificationMessageCreateInput) => {
  console.log("Save Invitation")

  await getClient().mutate<
    NotificationMessageCreateMutation,
    NotificationMessageCreateMutationVariables
  >({
    mutation: NotificationMessageCreateDocument,
    variables: {
      input: {
        sentBy: data.sentBy,
        username: data.username,
        status: data.status,
      },
    },
  })
}
