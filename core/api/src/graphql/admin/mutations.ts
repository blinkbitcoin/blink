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
    merchantMapDelete: MerchantMapDeleteMutation,
    merchantMapValidate: MerchantMapValidateMutation,
    userUpdateEmail: UserUpdateEmailMutation,
    userUpdatePhone: UserUpdatePhoneMutation,
  },
}

// All mutations require modify permission by default
export const mutationPermissions = {
  modify: Object.keys(mutationFields.authed) as (keyof typeof mutationFields.authed)[],
} as const

export const MutationType = GT.Object<null, GraphQLAdminContext>({
  name: "Mutation",
  fields: () => ({ ...mutationFields.authed }),
})
