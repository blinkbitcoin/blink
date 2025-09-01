import UserUpdatePhoneMutation from "./root/mutation/user-update-phone"
import UserUpdateEmailMutation from "./root/mutation/user-update-email"

import MerchantMapDeleteMutation from "./root/mutation/merchant-map-delete"
import MerchantMapValidateMutation from "./root/mutation/merchant-map-validate"

import AccountUpdateLevelMutation from "./root/mutation/account-update-level"
import AccountUpdateStatusMutation from "./root/mutation/account-update-status"
import AccountForceDeleteMutation from "./root/mutation/account-force-delete"

import TriggerMarketingNotificationMutation from "./root/mutation/marketing-notification-trigger"

import { GT } from "@/graphql/index"

export const mutationFields = {
  unauthed: {},
  authed: {
    accountUpdateLevel: AccountUpdateLevelMutation,
    accountUpdateStatus: AccountUpdateStatusMutation,
    accountForceDelete: AccountForceDeleteMutation,
    merchantMapValidate: MerchantMapValidateMutation,
    merchantMapDelete: MerchantMapDeleteMutation,
    marketingNotificationTrigger: TriggerMarketingNotificationMutation,
    userUpdateEmail: UserUpdateEmailMutation,
    userUpdatePhone: UserUpdatePhoneMutation,
  },
}

// Detailed mutation permissions mapping by access right
export const mutationPermissions = {
  // Account modification operations - require MODIFY_ACCOUNTS
  modifyAccounts: [
    "accountUpdateLevel",
    "accountUpdateStatus",
    "userUpdateEmail",
    "userUpdatePhone",
    "merchantMapValidate",
    "merchantMapDelete",
  ] as (keyof typeof mutationFields.authed)[],

  // Account deletion operations - require DELETE_ACCOUNTS
  deleteAccounts: ["accountForceDelete"] as (keyof typeof mutationFields.authed)[],

  // Notification operations - require SEND_NOTIFICATIONS
  sendNotifications: [
    "marketingNotificationTrigger",
  ] as (keyof typeof mutationFields.authed)[],
} as const

export const MutationType = GT.Object<null, GraphQLAdminContext>({
  name: "Mutation",
  fields: () => ({ ...mutationFields.authed }),
})
