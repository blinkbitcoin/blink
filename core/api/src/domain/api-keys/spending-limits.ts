import { ApiKeyLimitExceededError } from "./errors"

export type SpendingLimits = {
  dailyLimitSats: number | null
  weeklyLimitSats: number | null
  monthlyLimitSats: number | null
  annualLimitSats: number | null
  dailySpentSats: number
  weeklySpentSats: number
  monthlySpentSats: number
  annualSpentSats: number
}

export const validateSpendingLimit = ({
  amountSats,
  limits,
}: {
  amountSats: number
  limits: SpendingLimits
}): true | ApiKeyLimitExceededError => {
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
