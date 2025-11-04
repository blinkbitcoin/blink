import { randomUUID } from "crypto"

import { createAccountWithPhoneIdentifier } from "@/app/accounts"
import { createKratosIdentityByPhone } from "@/app/authentication"

import { ConfigError, getAdminAccounts, getDefaultAccountsConfig } from "@/config"

import { CouldNotFindAccountFromKratosIdError, CouldNotFindError } from "@/domain/errors"
import { WalletCurrency } from "@/domain/shared"

import { initialStaticAccountIds } from "@/services/ledger/facade"
import {
  AccountsRepository,
  UsersRepository,
  WalletsRepository,
} from "@/services/mongoose"
import { Account } from "@/services/mongoose/schema"

export const randomUserId = () => randomUUID() as UserId

const adminUsers = getAdminAccounts()

export const bootstrap = async () => {
  const adminAccountIds = await initialStaticAccountIds()

  for (const accountNameString of Object.keys(adminAccountIds)) {
    const accountName = accountNameString as keyof InitialStaticAccountIds
    const accountId = adminAccountIds[accountName]
    if (!(accountId instanceof Error)) continue

    let adminConfig: AdminAccount | undefined = undefined
    switch (accountName) {
      case "bankOwnerAccountId":
        adminConfig = adminUsers.find((val) => val.role === "bankowner")
        break

      case "dealerBtcAccountId":
      case "dealerUsdAccountId":
        adminConfig = adminUsers.find((val) => val.role === "dealer")
        break

      case "funderAccountId":
        adminConfig = adminUsers.find((val) => val.role === "funder")
        break
    }
    if (adminConfig === undefined) {
      return new ConfigError("Missing required admin account config")
    }

    const { phone, role } = adminConfig
    const user = await UsersRepository().findByPhone(phone)
    let kratosUserId: UserId
    if (user instanceof CouldNotFindError) {
      // Create actual Kratos identity instead of random UUID
      const kratosUserIdResult = await createKratosIdentityByPhone(phone)
      if (kratosUserIdResult instanceof Error) return kratosUserIdResult
      kratosUserId = kratosUserIdResult
    } else {
      if (user instanceof Error) return user

      kratosUserId = user.id
    }

    let account = await AccountsRepository().findByUserId(kratosUserId)
    if (account instanceof CouldNotFindAccountFromKratosIdError) {
      account = await createAccountWithPhoneIdentifier({
        newAccountInfo: { phone, kratosUserId },
        config: getDefaultAccountsConfig(),
      })
    }
    if (account instanceof Error) return account

    await Account.findOneAndUpdate({ id: account.id }, { role, contactEnabled: false })

    const wallet = await WalletsRepository().findById(account.defaultWalletId)
    if (wallet instanceof Error) return wallet
    if (wallet.currency !== WalletCurrency.Btc) {
      return new Error("Expected BTC-currency default wallet")
    }
  }
}
