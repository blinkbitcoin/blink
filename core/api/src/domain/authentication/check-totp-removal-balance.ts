import { TotpRemovalBalanceTooHighError } from "./errors"

import { WalletCurrency } from "@/domain/shared"

export const checkTotpRemovalBalance = ({
  balances,
  blockedBalance,
}: {
  balances: Amount<WalletCurrency>[]
  blockedBalance: { btc: BtcPaymentAmount; usd: UsdPaymentAmount }
}): true | TotpRemovalBalanceTooHighError => {
  const totals: Record<WalletCurrency, bigint> = {
    [WalletCurrency.Btc]: 0n,
    [WalletCurrency.Usd]: 0n,
  }
  for (const { amount, currency } of balances) totals[currency] += amount

  if (
    totals[WalletCurrency.Btc] >= blockedBalance.btc.amount ||
    totals[WalletCurrency.Usd] >= blockedBalance.usd.amount
  ) {
    return new TotpRemovalBalanceTooHighError()
  }

  return true
}
