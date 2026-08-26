import { AccountStatus } from "./primitives"

import { InactiveAccountError, InvalidWalletId } from "@/domain/errors"

const validatorForStatuses = ({
  account,
  allowedStatuses,
}: {
  account: Account
  allowedStatuses: AccountStatus[]
}): AccountValidator | ValidationError => {
  if (!allowedStatuses.includes(account.status)) {
    return new InactiveAccountError(account.id)
  }

  const validateWalletForAccount = <S extends WalletCurrency>(
    wallet: WalletDescriptor<S>,
  ): true | ValidationError => {
    if (wallet.accountId !== account.id)
      return new InvalidWalletId(
        JSON.stringify({
          accountId: account.id,
          AccountIdFromWallet: wallet.accountId,
        }),
      )

    return true
  }

  return { validateWalletForAccount }
}

export const PostMigrationAccountValidator = (
  account: Account,
): AccountValidator | ValidationError =>
  validatorForStatuses({
    account,
    allowedStatuses: [AccountStatus.Migrated, AccountStatus.Closed],
  })

export const AccountValidator = (account: Account): AccountValidator | ValidationError =>
  validatorForStatuses({
    account,
    allowedStatuses: [AccountStatus.Active, AccountStatus.Invited],
  })
