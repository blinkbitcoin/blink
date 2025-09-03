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
    // Account modification operations - require MODIFY_ACCOUNTS
    accountUpdateLevel: {
      field: AccountUpdateLevelMutation,
      rule: accessRules.modifyAccounts,
    },
    accountUpdateStatus: {
      field: AccountUpdateStatusMutation,
      rule: accessRules.modifyAccounts,
    },
    userUpdateEmail: {
      field: UserUpdateEmailMutation,
      rule: accessRules.modifyAccounts,
    },
    userUpdatePhone: {
      field: UserUpdatePhoneMutation,
      rule: accessRules.modifyAccounts,
    },
    merchantMapValidate: {
      field: MerchantMapValidateMutation,
      rule: accessRules.modifyAccounts,
    },
    merchantMapDelete: {
      field: MerchantMapDeleteMutation,
      rule: accessRules.modifyAccounts,
    },

    // Account deletion operations - require DELETE_ACCOUNTS
    accountForceDelete: {
      field: AccountForceDeleteMutation,
      rule: accessRules.deleteAccounts,
    },

    // Notification operations - require SEND_NOTIFICATIONS
    marketingNotificationTrigger: {
      field: TriggerMarketingNotificationMutation,
      rule: accessRules.sendNotifications,
    },
  },
}
// Extract the actual GraphQL fields for the schema
const extractedMutationFields = extractFields(mutationFields.authed)

// Build permission mappings automatically from the field definitions (now field -> rule mapping)
export const mutationPermissions = buildPermissionMappings(mutationFields.authed)

export const MutationType = GT.Object<null, GraphQLAdminContext>({
  name: "Mutation",
  fields: () => ({ ...extractedMutationFields }),
})
