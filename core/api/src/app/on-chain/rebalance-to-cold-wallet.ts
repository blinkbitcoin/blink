import * as Lightning from "../lightning/get-balances"

import { getBriaConfig } from "@/config"

import { toSats } from "@/domain/bitcoin"
import { RebalanceChecker } from "@/domain/bitcoin/onchain"
import { paymentAmountFromNumber, roundToBigInt, WalletCurrency } from "@/domain/shared"

import { LndService } from "@/services/lnd"
import { OnChainService } from "@/services/bria"
import { addAttributesToCurrentSpan } from "@/services/tracing"

export const rebalanceToColdWallet = async (): Promise<boolean | ApplicationError> => {
  const { hotToCold: hotToColdConfig } = getBriaConfig().rebalances

  const onChainService = OnChainService()

  const offChainService = LndService()
  if (offChainService instanceof Error) return offChainService

  const onChainBalance = await onChainService.getHotBalance()
  if (onChainBalance instanceof Error) return onChainBalance

  const offChainBalance = await Lightning.getTotalBalance()
  if (offChainBalance instanceof Error) return offChainBalance

  const withdrawalWalletBalance = await onChainService.getWithdrawalWalletBalance()
  if (withdrawalWalletBalance instanceof Error) return withdrawalWalletBalance

  const rebalanceAmount = RebalanceChecker(hotToColdConfig).getWithdrawAmount({
    totalBalance: toSats(onChainBalance.amount + roundToBigInt(offChainBalance)),
    availableBalance: toSats(withdrawalWalletBalance.amount),
  })

  addAttributesToCurrentSpan({
    "rebalance.offChainBalance": offChainBalance,
    "rebalance.onChainBalance": toSats(onChainBalance.amount),
    "rebalance.withdrawalWalletBalance": toSats(withdrawalWalletBalance.amount),
    "rebalance.amount": rebalanceAmount,
  })

  if (rebalanceAmount <= 0) return false

  const amount = paymentAmountFromNumber({
    amount: rebalanceAmount,
    currency: WalletCurrency.Btc,
  })
  if (amount instanceof Error) return amount

  const payoutId = await onChainService.rebalanceToColdWallet({ amount })
  if (payoutId instanceof Error) return payoutId

  return true
}
