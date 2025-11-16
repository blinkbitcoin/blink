import { CheckSpendingLimitResponse } from "./proto/api_keys_pb"

import { SpendingLimits } from "@/domain/api-keys"

export const grpcSpendingLimitsToSpendingLimits = (
  response: CheckSpendingLimitResponse,
): SpendingLimits => ({
  dailyLimitSats: response.hasDailyLimitSats()
    ? (response.getDailyLimitSats() ?? null)
    : null,
  weeklyLimitSats: response.hasWeeklyLimitSats()
    ? (response.getWeeklyLimitSats() ?? null)
    : null,
  monthlyLimitSats: response.hasMonthlyLimitSats()
    ? (response.getMonthlyLimitSats() ?? null)
    : null,
  annualLimitSats: response.hasAnnualLimitSats()
    ? (response.getAnnualLimitSats() ?? null)
    : null,
  spentLast24hSats: response.getSpentLast24hSats(),
  spentLast7dSats: response.getSpentLast7dSats(),
  spentLast30dSats: response.getSpentLast30dSats(),
  spentLast365dSats: response.getSpentLast365dSats(),
})
