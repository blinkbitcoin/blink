import { usernameAvailable } from "./username-available"
import { getLnurlServerService, usernameAvailableForLnurlServer } from "./lnurl-server"

import { getDefaultAccountsConfig, LNURL_SERVER_LN_ADDRESS_DOMAIN } from "@/config"
import {
  checkedToAccountId,
  checkedToUsername,
  UsernameIsImmutableError,
  UsernameNotAvailableError,
  UsernameSetupNotAllowedError,
} from "@/domain/accounts"
import {
  LnurlServerIdentifierConflictError,
  lnurlWalletFromCurrency,
} from "@/domain/lnurl-server"
import { WalletCurrency } from "@/domain/shared"
import { InvalidUsername } from "@/domain/errors"
import { checkedToPhoneNumber } from "@/domain/users"

import { AccountsRepository, WalletsRepository } from "@/services/mongoose"

export const setUsername = async ({
  accountId: accountIdRaw,
  username,
}: {
  accountId: string
  username: string
}): Promise<Account | ApplicationError> => {
  if (!getDefaultAccountsConfig().allowUsernameSetup) {
    return new UsernameSetupNotAllowedError()
  }

  const checkedUsername = checkedToUsername(username)
  if (checkedUsername instanceof Error) return checkedUsername

  // username can't be a valid phone number
  const phone = checkedToPhoneNumber(username)
  if (!(phone instanceof Error)) {
    return new InvalidUsername(username)
  }

  const accountId = checkedToAccountId(accountIdRaw)
  if (accountId instanceof Error) return accountId

  const accountsRepo = AccountsRepository()
  const account = await accountsRepo.findById(accountId)
  if (account instanceof Error) return account
  if (account.username) return new UsernameIsImmutableError()

  const isAvailable = await usernameAvailable(checkedUsername)
  if (isAvailable instanceof Error) return isAvailable
  if (!isAvailable) return new UsernameNotAvailableError()

  const lnurlServer = getLnurlServerService()
  if (lnurlServer !== null) {
    const isLnurlAvailable = await usernameAvailableForLnurlServer(checkedUsername)
    if (isLnurlAvailable instanceof Error) return isLnurlAvailable
    if (!isLnurlAvailable) return new UsernameNotAvailableError()

    const walletsRepo = WalletsRepository()
    const accountWallets = await walletsRepo.findAccountWalletsByAccountId(account.id)
    if (accountWallets instanceof Error) return accountWallets

    let defaultWalletCurrency: WalletCurrency = accountWallets.USD.currency
    if (account.defaultWalletId === accountWallets.BTC.id) {
      defaultWalletCurrency = accountWallets.BTC.currency
    }

    const lnurlAccount = await lnurlServer.createBlinkAccount({
      domain: LNURL_SERVER_LN_ADDRESS_DOMAIN,
      blinkAccountId: account.id,
      btcWalletId: accountWallets.BTC.id,
      usdWalletId: accountWallets.USD.id,
      defaultWallet: lnurlWalletFromCurrency(defaultWalletCurrency),
      description: `Payment to ${checkedUsername}`,
      identifiers: [checkedUsername],
    })
    if (lnurlAccount instanceof LnurlServerIdentifierConflictError) {
      return new UsernameNotAvailableError()
    }
    if (lnurlAccount instanceof Error) return lnurlAccount
  }

  account.username = checkedUsername
  return accountsRepo.update(account)
}
