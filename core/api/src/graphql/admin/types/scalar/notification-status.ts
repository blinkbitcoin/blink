import { NotificationStatus as ConstNotificationStatus } from "@/domain/notifications"
import { GT } from "@/graphql/index"

const NotificationStatus = GT.Enum({
  name: "NotificationStatus",
  values: {
    INVITED: { value: ConstNotificationStatus.Invited },
    BANNER_CLICKED: { value: ConstNotificationStatus.BannerClicked },
    INVITATION_INFO_COMPLETED: { value: ConstNotificationStatus.InvitationInfoCompleted },
    KYC_INITIATED: { value: ConstNotificationStatus.KycInitiated },
    KYC_PASSED: { value: ConstNotificationStatus.KycPassed },
    CARD_INFO_SUBMITTED: { value: ConstNotificationStatus.CardInfoSubmitted },
    CARD_APPROVED: { value: ConstNotificationStatus.CardApproved },
    INVITE_WITHDRAWN: { value: ConstNotificationStatus.InviteWithdrawn },
    KYC_FAILED: { value: ConstNotificationStatus.KycFailed },
    CARD_DENIED: { value: ConstNotificationStatus.CardDenied },
  },
})

export default NotificationStatus
