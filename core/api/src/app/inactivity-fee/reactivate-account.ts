import { addAttributesToCurrentSpan } from "@/services/tracing"

// Called when a user comes back to an account that had gone dormant. Reversing the inactivity
// fees charged while it was dormant is not implemented yet, so for now this only records that
// the account woke up.
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
