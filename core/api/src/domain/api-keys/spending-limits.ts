import { ApiKeyLimitExceededError } from "./errors"

export type SpendingLimits = {
  dailyLimitSats: Satoshis | null
  weeklyLimitSats: Satoshis | null
  monthlyLimitSats: Satoshis | null
  annualLimitSats: Satoshis | null
  dailySpentSats: Satoshis
  weeklySpentSats: Satoshis
  monthlySpentSats: Satoshis
  annualSpentSats: Satoshis
}

export const validateSpendingLimit = ({
  amount,
  limits,
}: {
  amount: BtcPaymentAmount
  limits: SpendingLimits
}): true | ApiKeyLimitExceededError => {
  const amountSats = Number(amount.amount) as Satoshis
  const checks = [
    {
      period: "daily",
      limit: limits.dailyLimitSats,
      spent: limits.dailySpentSats,
    },
    {
      period: "weekly",
      limit: limits.weeklyLimitSats,
      spent: limits.weeklySpentSats,
    },
    {
      period: "monthly",
      limit: limits.monthlyLimitSats,
      spent: limits.monthlySpentSats,
    },
    {
      period: "annual",
      limit: limits.annualLimitSats,
      spent: limits.annualSpentSats,
    },
  ] as const

  for (const { period, limit, spent } of checks) {
    if (limit && limit - spent < amountSats) {
      return new ApiKeyLimitExceededError(
        `${period} spending limit exceeded, remaining: ${limit - spent} sats`,
      )
    }
  }

  return true
}
