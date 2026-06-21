import { getLnurlServerService } from "./lnurl-server"

import { InvalidWalletId } from "@/domain/errors"
import { LNURL_SERVER_LN_ADDRESS_DOMAIN } from "@/config"
import { lnurlWalletFromCurrency, LnurlServerNotFoundError } from "@/domain/lnurl-server"
import { AccountsRepository, WalletsRepository } from "@/services/mongoose"

export async function updateDefaultWalletId({
  accountId,
  walletId,
}: {
  accountId: AccountId
  walletId: WalletId
}): Promise<Account | ApplicationError> {
  const accountsRepo = AccountsRepository()
  const walletsRepo = WalletsRepository()

  const account = await accountsRepo.findById(accountId)
  if (account instanceof Error) return account

  const wallets = await walletsRepo.listByAccountId(account.id)
  if (wallets instanceof Error) return wallets

  const wallet = wallets.find((currentWallet) => currentWallet.id === walletId)
  if (!wallet) return new InvalidWalletId()

  if (account.username) {
    const lnurlServer = getLnurlServerService()

    if (lnurlServer !== null) {
      const identifier = await lnurlServer.getIdentifier({
        domain: LNURL_SERVER_LN_ADDRESS_DOMAIN,
        identifier: account.username,
      })
      if (identifier instanceof LnurlServerNotFoundError) return identifier
      if (identifier instanceof Error) return identifier

      const updatedDefaultWallet = await lnurlServer.updateDefaultWallet({
        accountId: account.id,
        defaultWallet: lnurlWalletFromCurrency(wallet.currency),
      })
      if (updatedDefaultWallet instanceof Error) return updatedDefaultWallet
    }
  }

  account.defaultWalletId = walletId

  return accountsRepo.update(account)
}
