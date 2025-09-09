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
    // Account level operations - require CHANGELEVEL_ACCOUNT
    accountUpdateLevel: {
      field: AccountUpdateLevelMutation,
      rule: accessRules.changeLevelAccount,
    },
    // Account status operations - require LOCK_ACCOUNT
    accountUpdateStatus: {
      field: AccountUpdateStatusMutation,
      rule: accessRules.lockAccount,
    },
    // Contact update operations - require CHANGECONTACTS_ACCOUNT
    userUpdateEmail: {
      field: UserUpdateEmailMutation,
      rule: accessRules.changeContactsAccount,
    },
    userUpdatePhone: {
      field: UserUpdatePhoneMutation,
      rule: accessRules.changeContactsAccount,
    },
    // Merchant operations - require APPROVE_MERCHANT
    merchantMapValidate: {
      field: MerchantMapValidateMutation,
      rule: accessRules.approveMerchant,
    },
    merchantMapDelete: {
      field: MerchantMapDeleteMutation,
      rule: accessRules.approveMerchant,
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
