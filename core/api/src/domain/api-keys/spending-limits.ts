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
    dailySpentSats,
    weeklySpentSats,
    monthlySpentSats,
    annualSpentSats,
  } = limits

  // Calculate remaining amounts
  const remainingDailySats =
    dailyLimitSats !== null ? dailyLimitSats - dailySpentSats : null
  const remainingWeeklySats =
    weeklyLimitSats !== null ? weeklyLimitSats - weeklySpentSats : null
  const remainingMonthlySats =
    monthlyLimitSats !== null ? monthlyLimitSats - monthlySpentSats : null
  const remainingAnnualSats =
    annualLimitSats !== null ? annualLimitSats - annualSpentSats : null

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
