import axios from "axios"

import { baseLogger } from "@/services/logger"
import { ApiKeyLimitCheckError, ApiKeySpendingRecordError } from "@/domain/api-keys"
import { getApiKeysServiceUrl, getApiKeysInternalAuthSecret } from "@/config"

const API_KEYS_SERVICE_URL = getApiKeysServiceUrl()
const INTERNAL_AUTH_SECRET = getApiKeysInternalAuthSecret()

export type LimitCheckResult = {
  allowed: boolean
  daily_limit_sats: number | null
  weekly_limit_sats: number | null
  monthly_limit_sats: number | null
  annual_limit_sats: number | null
  spent_last_24h_sats: number
  spent_last_7d_sats: number
  spent_last_30d_sats: number
  spent_last_365d_sats: number
  remaining_daily_sats: number | null
  remaining_weekly_sats: number | null
  remaining_monthly_sats: number | null
  remaining_annual_sats: number | null
}

/**
 * Check if a spending amount would exceed any of the API key's spending limits
 * (daily, weekly, monthly, or annual - all using rolling time windows)
 * Returns allowed=true if no limits are configured for the API key
 */
export const checkApiKeySpendingLimit = async ({
  apiKeyId,
  amountSats,
}: {
  apiKeyId: string
  amountSats: number
}): Promise<LimitCheckResult | ApplicationError> => {
  try {
    const response = await axios.get<LimitCheckResult>(
      `${API_KEYS_SERVICE_URL}/limits/check`,
      {
        params: {
          api_key_id: apiKeyId,
          amount_sats: amountSats,
        },
        headers: {
          "X-Internal-Auth": INTERNAL_AUTH_SECRET,
        },
        timeout: 5000, // 5 second timeout
      },
    )

    return response.data
  } catch (err) {
    baseLogger.error(
      { err, apiKeyId, amountSats },
      "Failed to check API key spending limit",
    )
    return new ApiKeyLimitCheckError("Failed to check API key limit")
  }
}

/**
 * Record spending for an API key after a successful payment
 * This is fire-and-forget - errors are logged but not propagated
 */
export const recordApiKeySpending = async ({
  apiKeyId,
  amountSats,
  transactionId,
}: {
  apiKeyId: string
  amountSats: number
  transactionId: string
}): Promise<void | ApplicationError> => {
  try {
    await axios.post(
      `${API_KEYS_SERVICE_URL}/spending/record`,
      {
        api_key_id: apiKeyId,
        amount_sats: amountSats,
        transaction_id: transactionId,
      },
      {
        headers: {
          "X-Internal-Auth": INTERNAL_AUTH_SECRET,
        },
        timeout: 5000, // 5 second timeout
      },
    )
  } catch (err) {
    baseLogger.error(
      { err, apiKeyId, amountSats, transactionId },
      "Failed to record API key spending",
    )
    return new ApiKeySpendingRecordError("Failed to record API key spending")
  }
}

// Re-export error types for convenience
export { ApiKeyLimitCheckError, ApiKeySpendingRecordError }
