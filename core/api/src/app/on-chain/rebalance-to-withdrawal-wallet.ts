import { getBriaConfig } from "@/config"

import { toSats } from "@/domain/bitcoin"
import { RebalanceChecker } from "@/domain/bitcoin/onchain"
import { paymentAmountFromNumber, WalletCurrency } from "@/domain/shared"

import { OnChainService } from "@/services/bria"
import { addAttributesToCurrentSpan } from "@/services/tracing"

const briaConfig = getBriaConfig()

export const rebalanceToWithdrawalWallet = async (): Promise<true | ApplicationError> => {
  const onChainService = OnChainService()

  const receiveWalletName = briaConfig.receiveWalletName
  const withdrawalWalletName = briaConfig.withdrawalWalletName
  if (withdrawalWalletName === receiveWalletName) {
    return true
  }

  const receiveWalletBalance = await onChainService.getReceiveWalletBalance()
  if (receiveWalletBalance instanceof Error) return receiveWalletBalance

  const rebalanceAmount = RebalanceChecker(
    briaConfig.rebalances.receiveToWithdrawal,
  ).getWithdrawAmount({
    totalBalance: toSats(receiveWalletBalance.amount),
  })

  addAttributesToCurrentSpan({
    "rebalance.receiveWalletBalance": toSats(receiveWalletBalance.amount),
    "rebalance.amount": rebalanceAmount,
  })

  if (rebalanceAmount <= 0) return true

  const amount = paymentAmountFromNumber({
    amount: rebalanceAmount,
    currency: WalletCurrency.Btc,
  })
  if (amount instanceof Error) return amount

  const payoutId = await onChainService.rebalanceToWithdrawalWallet({ amount })
  if (payoutId instanceof Error) return payoutId

  return true
}
