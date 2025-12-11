import UserUpdatePhoneMutation from "./root/mutation/user-update-phone"
import UserUpdateEmailMutation from "./root/mutation/user-update-email"

import MerchantMapDeleteMutation from "./root/mutation/merchant-map-delete"
import MerchantMapValidateMutation from "./root/mutation/merchant-map-validate"

import AccountUpdateLevelMutation from "./root/mutation/account-update-level"
import AccountUpdateStatusMutation from "./root/mutation/account-update-status"
import AccountForceDeleteMutation from "./root/mutation/account-force-delete"

import TriggerMarketingNotificationMutation from "./root/mutation/marketing-notification-trigger"
import NotificationTemplateCreateMutation from "./root/mutation/notification-template-create"
import NotificationTemplateUpdateMutation from "./root/mutation/notification-template-update"
import NotificationTemplateDeleteMutation from "./root/mutation/notification-template-delete"
import NotificationMessageCreateMutation from "./root/mutation/notification-message-create"
import NotificationMessageUpdateStatusMutation from "./root/mutation/notification-message-update-status"

import { GT } from "@/graphql/index"

export const mutationFields = {
  unauthed: {},
  authed: {
    userUpdatePhone: UserUpdatePhoneMutation,
    userUpdateEmail: UserUpdateEmailMutation,
    accountUpdateLevel: AccountUpdateLevelMutation,
    accountUpdateStatus: AccountUpdateStatusMutation,
    accountForceDelete: AccountForceDeleteMutation,
    merchantMapValidate: MerchantMapValidateMutation,
    merchantMapDelete: MerchantMapDeleteMutation,
    marketingNotificationTrigger: TriggerMarketingNotificationMutation,
    notificationTemplateCreate: NotificationTemplateCreateMutation,
    notificationTemplateUpdate: NotificationTemplateUpdateMutation,
    notificationTemplateDelete: NotificationTemplateDeleteMutation,
    notificationMessageCreate: NotificationMessageCreateMutation,
    notificationMessageUpdateStatus: NotificationMessageUpdateStatusMutation,
  },
}

export const MutationType = GT.Object<null, GraphQLAdminContext>({
  name: "Mutation",
  fields: () => ({ ...mutationFields.authed }),
})
