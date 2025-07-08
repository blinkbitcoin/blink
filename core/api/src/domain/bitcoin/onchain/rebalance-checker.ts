import { toSats } from "@/domain/bitcoin"

export const RebalanceChecker = ({
  minBalance,
  minRebalanceSize,
  threshold,
}: RebalanceCheckerConfig): RebalanceChecker => {
  const getWithdrawAmount = ({
    totalBalance,
    availableBalance,
  }: WithdrawAmountArgs): Satoshis => {
    const availableAmount = availableBalance || totalBalance
    if (totalBalance > threshold) {
      const rebalanceAmount = availableAmount - minBalance
      if (rebalanceAmount > minRebalanceSize) {
        return toSats(rebalanceAmount)
      }
    }

    return toSats(0)
  }

  return {
    getWithdrawAmount,
  }
}
