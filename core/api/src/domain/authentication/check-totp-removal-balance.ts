import { TotpRemovalBalanceTooHighError } from "./errors"

import { WalletCurrency } from "@/domain/shared"

export const checkTotpRemovalBalance = ({
  balances,
  blockedBalance,
}: {
  balances: Amount<WalletCurrency>[]
  blockedBalance: { btc: BtcPaymentAmount; usd: UsdPaymentAmount }
}): true | TotpRemovalBalanceTooHighError => {
  for (const balance of balances) {
    const blocked =
      balance.currency === WalletCurrency.Btc ? blockedBalance.btc : blockedBalance.usd
    if (balance.amount >= blocked.amount) return new TotpRemovalBalanceTooHighError()
  }

  return true
}
