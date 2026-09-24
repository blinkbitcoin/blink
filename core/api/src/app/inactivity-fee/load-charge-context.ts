import { InactivityFeeNoticeNotFoundError } from "@/domain/inactivity-fee"

import { AccountsRepository, InactivityFeeNoticesRepository } from "@/services/mongoose"

// The account row and its active notice, read live under the account lock: the worklist row
// that got us here decides nothing. No active row is ordinary (the account may have
// reactivated a moment ago).
export const loadChargeAccount = async ({
  accountId,
}: {
  accountId: AccountId
}): Promise<
  { account: Account; notice: InactivityFeeNotice | undefined } | ApplicationError
> => {
  const account = await AccountsRepository().findById(accountId)
  if (account instanceof Error) return account

  const found = await InactivityFeeNoticesRepository().findActiveByAccountId(accountId)
  if (found instanceof InactivityFeeNoticeNotFoundError) {
    return { account, notice: undefined }
  }
  if (found instanceof Error) return found
  return { account, notice: found }
}
