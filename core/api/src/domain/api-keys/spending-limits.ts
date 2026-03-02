import { ApiKeyLimitExceededError } from "./errors"

export type SpendingLimits = {
  dailyLimitSats: number | null
  weeklyLimitSats: number | null
  monthlyLimitSats: number | null
  annualLimitSats: number | null
  spentLast24hSats: number
  spentLast7dSats: number
  spentLast30dSats: number
  spentLast365dSats: number
}

type ValidationResult =
  | {
      allowed: true
    }
  | {
      allowed: false
      error: ApiKeyLimitExceededError
    }

export const validateSpendingLimit = ({
  amountSats,
  limits,
}: {
  amountSats: number
  limits: SpendingLimits
}): ValidationResult => {
  const {
    dailyLimitSats,
    weeklyLimitSats,
    monthlyLimitSats,
    annualLimitSats,
    spentLast24hSats,
    spentLast7dSats,
    spentLast30dSats,
    spentLast365dSats,
  } = limits

  // Calculate remaining amounts
  const remainingDailySats =
    dailyLimitSats !== null ? dailyLimitSats - spentLast24hSats : null
  const remainingWeeklySats =
    weeklyLimitSats !== null ? weeklyLimitSats - spentLast7dSats : null
  const remainingMonthlySats =
    monthlyLimitSats !== null ? monthlyLimitSats - spentLast30dSats : null
  const remainingAnnualSats =
    annualLimitSats !== null ? annualLimitSats - spentLast365dSats : null

  if (
    dailyLimitSats !== null &&
    remainingDailySats !== null &&
    remainingDailySats < amountSats
  ) {
    return {
      allowed: false,
      error: new ApiKeyLimitExceededError({
        daily: remainingDailySats,
        weekly: remainingWeeklySats,
        monthly: remainingMonthlySats,
        annual: remainingAnnualSats,
      }),
    }
  }

  if (
    weeklyLimitSats !== null &&
    remainingWeeklySats !== null &&
    remainingWeeklySats < amountSats
  ) {
    return {
      allowed: false,
      error: new ApiKeyLimitExceededError({
        daily: remainingDailySats,
        weekly: remainingWeeklySats,
        monthly: remainingMonthlySats,
        annual: remainingAnnualSats,
      }),
    }
  }

  if (
    monthlyLimitSats !== null &&
    remainingMonthlySats !== null &&
    remainingMonthlySats < amountSats
  ) {
    return {
      allowed: false,
      error: new ApiKeyLimitExceededError({
        daily: remainingDailySats,
        weekly: remainingWeeklySats,
        monthly: remainingMonthlySats,
        annual: remainingAnnualSats,
      }),
    }
  }

  if (
    annualLimitSats !== null &&
    remainingAnnualSats !== null &&
    remainingAnnualSats < amountSats
  ) {
    return {
      allowed: false,
      error: new ApiKeyLimitExceededError({
        daily: remainingDailySats,
        weekly: remainingWeeklySats,
        monthly: remainingMonthlySats,
        annual: remainingAnnualSats,
      }),
    }
  }

  return { allowed: true }
}
