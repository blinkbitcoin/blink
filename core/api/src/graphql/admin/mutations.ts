import UserUpdatePhoneMutation from "./root/mutation/user-update-phone"
import UserUpdateEmailMutation from "./root/mutation/user-update-email"

import MerchantMapDeleteMutation from "./root/mutation/merchant-map-delete"
import MerchantMapValidateMutation from "./root/mutation/merchant-map-validate"

import AccountUpdateLevelMutation from "./root/mutation/account-update-level"
import AccountUpdateStatusMutation from "./root/mutation/account-update-status"
import AccountForceDeleteMutation from "./root/mutation/account-force-delete"

import TriggerMarketingNotificationMutation from "./root/mutation/marketing-notification-trigger"

import { accessRules, extractFields, buildPermissionMappings } from "./access-rules"

import { GT } from "@/graphql/index"

// Mutation fields with embedded access rules
export const mutationFields = {
  unauthed: {},
  authed: {
    accountUpdateLevel: {
      field: AccountUpdateLevelMutation,
      rule: accessRules.changeLevelAccount,
    },
    accountUpdateStatus: {
      field: AccountUpdateStatusMutation,
      rule: accessRules.lockAccount,
    },
    userUpdateEmail: {
      field: UserUpdateEmailMutation,
      rule: accessRules.changeContactsAccount,
    },
    userUpdatePhone: {
      field: UserUpdatePhoneMutation,
      rule: accessRules.changeContactsAccount,
    },
    merchantMapValidate: {
      field: MerchantMapValidateMutation,
      rule: accessRules.approveMerchant,
    },
    merchantMapDelete: {
      field: MerchantMapDeleteMutation,
      rule: accessRules.approveMerchant,
    },
    accountForceDelete: {
      field: AccountForceDeleteMutation,
      rule: accessRules.deleteAccounts,
    },
    marketingNotificationTrigger: {
      field: TriggerMarketingNotificationMutation,
      rule: accessRules.sendNotifications,
    },
  },
}

const extractedMutationFields = extractFields(mutationFields.authed)

export const mutationPermissions = buildPermissionMappings(mutationFields.authed)

export const MutationType = GT.Object<null, GraphQLAdminContext>({
  name: "Mutation",
  fields: () => ({ ...extractedMutationFields }),
})
