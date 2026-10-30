import { getBriaConfig } from "@/config"

import { toSats } from "@/domain/bitcoin"
import { RebalanceChecker } from "@/domain/bitcoin/onchain"
import { paymentAmountFromNumber, WalletCurrency } from "@/domain/shared"
import { ResourceExpiredLockServiceError } from "@/domain/lock"

import { OnChainService } from "@/services/bria"
import { LockService } from "@/services/lock"
import { addAttributesToCurrentSpan } from "@/services/tracing"

const briaConfig = getBriaConfig()

export const rebalanceToWithdrawalWallet = async (): Promise<true | ApplicationError> => {
  const onChainService = OnChainService()

  const receiveWalletName = briaConfig.receiveWalletName
  const withdrawalWalletName = briaConfig.withdrawalWalletName
  if (withdrawalWalletName === receiveWalletName) {
    return true
  }

  return LockService().lockOnChainRebalance(receiveWalletName, async (signal) => {
    const availableBalance = await onChainService.getReceiveWalletAvailableBalance()
    if (availableBalance instanceof Error) return availableBalance

    const rebalanceAmount = RebalanceChecker(
      briaConfig.rebalances.receiveToWithdrawal,
    ).getWithdrawAmount({
      totalBalance: toSats(availableBalance.amount),
    })

    addAttributesToCurrentSpan({
      "rebalance.receiveWalletAvailableBalance": toSats(availableBalance.amount),
      "rebalance.amount": rebalanceAmount,
    })

    if (rebalanceAmount <= 0) return true

    const amount = paymentAmountFromNumber({
      amount: rebalanceAmount,
      currency: WalletCurrency.Btc,
    })
    if (amount instanceof Error) return amount

    if (signal.aborted) {
      return new ResourceExpiredLockServiceError(signal.error?.message)
    }

    const payoutId = await onChainService.rebalanceToWithdrawalWallet({ amount })
    if (payoutId instanceof Error) return payoutId

    return true as const
  })
}
