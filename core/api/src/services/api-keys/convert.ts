import { CheckSpendingLimitResponse } from "./proto/api_keys_pb"

import { toSats } from "@/domain/bitcoin"
import { SpendingLimits } from "@/domain/api-keys"

const toSatsOrNull = (value: number | undefined): Satoshis | null =>
  value !== undefined ? toSats(value) : null

export const grpcSpendingLimitsToSpendingLimits = (
  response: CheckSpendingLimitResponse,
): SpendingLimits => ({
  dailyLimitSats: response.hasDailyLimitSats()
    ? toSatsOrNull(response.getDailyLimitSats())
    : null,
  weeklyLimitSats: response.hasWeeklyLimitSats()
    ? toSatsOrNull(response.getWeeklyLimitSats())
    : null,
  monthlyLimitSats: response.hasMonthlyLimitSats()
    ? toSatsOrNull(response.getMonthlyLimitSats())
    : null,
  annualLimitSats: response.hasAnnualLimitSats()
    ? toSatsOrNull(response.getAnnualLimitSats())
    : null,
  dailySpentSats: toSats(response.getDailySpentSats()),
  weeklySpentSats: toSats(response.getWeeklySpentSats()),
  monthlySpentSats: toSats(response.getMonthlySpentSats()),
  annualSpentSats: toSats(response.getAnnualSpentSats()),
})
