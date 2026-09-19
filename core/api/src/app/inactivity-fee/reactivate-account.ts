import { addAttributesToCurrentSpan } from "@/services/tracing"

// placeholder: reversing inactivity fees is not implemented yet
export const reactivateAccount = async ({
  accountId,
  previousActivityAt,
}: {
  accountId: AccountId
  previousActivityAt: Date
}): Promise<true | ApplicationError> => {
  addAttributesToCurrentSpan({
    "inactivityFee.reactivate.accountId": accountId,
    "inactivityFee.reactivate.previousActivityAt": previousActivityAt.toISOString(),
    "inactivityFee.reactivate.noop": true,
  })
  return true
}
