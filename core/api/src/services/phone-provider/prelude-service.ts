import Prelude from "@prelude.so/sdk"

import { wrapAsyncFunctionsToRunInSpan } from "../tracing"

import { PRELUDE_API_KEY } from "@/config"
import {
  ExpiredOrNonExistentPhoneNumberError,
  InvalidPhoneNumberPhoneProviderError,
  InvalidTypePhoneProviderError,
  MissingTypePhoneProviderError,
  PhoneCodeInvalidError,
  PhoneProviderConfigError,
  PhoneProviderConnectionError,
  PhoneProviderRateLimitExceededError,
  PhoneProviderUnavailableError,
  RestrictedRecipientPhoneNumberError,
  RestrictedRegionPhoneProviderError,
  SpendingLimitExceededPhoneProviderError,
  UnknownPhoneProviderServiceError,
  UnsubscribedRecipientPhoneProviderError,
  isDisposablePhoneNumber,
} from "@/domain/phone-provider"
import { baseLogger } from "@/services/logger"
import { parseErrorMessageFromUnknown } from "@/domain/shared"

export const PreludeClient = ():
  | IPhoneProviderVerifyService
  | PhoneProviderConfigError => {
  const apiKey = PRELUDE_API_KEY

  if (!apiKey) {
    return new PhoneProviderConfigError("PRELUDE_API_KEY is required")
  }

  const client = new Prelude({
    apiToken: apiKey,
  })

  const initiateVerify = async ({
    to,
    channel,
    phoneExists,
    ip,
  }: {
    to: PhoneNumber
    channel: ChannelType
    phoneExists: boolean
    ip: IpAddress
  }): Promise<true | PhoneProviderServiceError> => {
    try {
      if (!phoneExists) {
        const validation = await validateDestination(to)
        if (validation instanceof Error) {
          return validation
        }
      }

      const response = await client.verification.create({
        target: {
          type: "phone_number",
          value: to,
        },
        options: {
          preferred_channel: channel,
        },
        signals: {
          is_trusted_user: phoneExists,
          ip,
        },
      })

      if (response.status === "blocked") {
        return new RestrictedRecipientPhoneNumberError("Verification blocked")
      }
    } catch (err) {
      baseLogger.error({ err }, "impossible to send verification")
      return handleCommonErrors(err)
    }

    return true
  }

  const validateDestination = async (
    phone: PhoneNumber,
  ): Promise<true | PhoneProviderServiceError> => {
    try {
      if (isDisposablePhoneNumber(phone)) {
        return new InvalidTypePhoneProviderError("disposable")
      }

      const lookup = await client.lookup.lookup(phone)

      if (!lookup.line_type) {
        return new MissingTypePhoneProviderError()
      }

      if (lookup.line_type !== "mobile") {
        return new InvalidTypePhoneProviderError(lookup.line_type)
      }

      return true
    } catch (err) {
      return handleCommonErrors(err)
    }
  }

  const validateVerify = async ({
    to,
    code,
  }: {
    to: PhoneNumber
    code: PhoneCode
  }): Promise<true | PhoneProviderServiceError> => {
    try {
      const response = await client.verification.check({
        target: {
          type: "phone_number",
          value: to,
        },
        code,
      })

      if (response.status === "success") {
        return true
      }

      if (response.status === "expired_or_not_found") {
        return new ExpiredOrNonExistentPhoneNumberError(
          "Verification expired or not found",
        )
      }

      return new PhoneCodeInvalidError()
    } catch (err) {
      baseLogger.error({ err }, "impossible to verify phone and code")
      return handleCommonErrors(err)
    }
  }

  const getCarrier = async (phone: PhoneNumber) => {
    try {
      const lookup = await client.lookup.lookup(phone)

      const phoneMetadata: PhoneMetadata = {
        carrier: {
          error_code: "",
          mobile_country_code: lookup.network_info?.mcc || "",
          mobile_network_code: lookup.network_info?.mnc || "",
          name: lookup.network_info?.carrier_name || "",
          type: (lookup.line_type || "unknown") as CarrierType,
        },
        countryCode: lookup.country_code || "",
      }

      return phoneMetadata
    } catch (err) {
      return handleCommonErrors(err)
    }
  }

  return wrapAsyncFunctionsToRunInSpan({
    namespace: "services.prelude",
    fns: {
      getCarrier,
      validateVerify,
      initiateVerify,
      validateDestination,
    },
  })
}

const handleCommonErrors = (err: Error | string | unknown) => {
  const errMsg = parseErrorMessageFromUnknown(err)

  // Check for Prelude-specific error codes
  if (typeof err === "object" && err !== null && "code" in err) {
    const errorCode = (err as { code: string }).code

    switch (errorCode) {
      // Phone number validation errors
      case "invalid_phone_number":
        return new InvalidPhoneNumberPhoneProviderError(errMsg)
      case "invalid_line_type":
      case "invalid_phone_line": // legacy, keeping for backwards compatibility
        return new InvalidTypePhoneProviderError(errMsg)

      // Blocking/restriction errors
      case "blocked":
      case "in_block_list": // legacy, keeping for backwards compatibility
      case "suspicious": // legacy, keeping for backwards compatibility
        return new RestrictedRecipientPhoneNumberError(errMsg)

      // Rate limiting and balance errors
      case "too_many_checks":
      case "too_many_attempts":
        return new PhoneProviderRateLimitExceededError(errMsg)
      case "spending_limit_exceeded":
      case "insufficient_balance":
        return new SpendingLimitExceededPhoneProviderError(errMsg)

      // Expiration/timing errors
      case "expires_at_in_past":
      case "expires_at_too_far_in_future":
      case "expired_signature": // legacy, keeping for backwards compatibility
        return new ExpiredOrNonExistentPhoneNumberError(errMsg)

      // Configuration/authentication errors
      case "invalid_api_key":
      case "missing_api_key":
      case "suspended_account":
      case "invalid_request":
      case "invalid_template_id":
      case "invalid_integration":
      case "invalid_sender_id":
      case "invalid_callback_url":
      case "custom_code_not_allowed":
      case "custom_size_conflict":
        return new PhoneProviderConfigError(errMsg)

      // Internal system errors
      case "internal":
        return new PhoneProviderUnavailableError(errMsg)

      default:
        return new UnknownPhoneProviderServiceError(errMsg)
    }
  }

  const match = (knownErrDetail: RegExp): boolean => knownErrDetail.test(errMsg)

  switch (true) {
    case match(KnownPreludeErrorMessages.InvalidPhoneNumber):
      return new InvalidPhoneNumberPhoneProviderError(errMsg)

    case match(KnownPreludeErrorMessages.RestrictedRegion):
      return new RestrictedRegionPhoneProviderError(errMsg)

    case match(KnownPreludeErrorMessages.UnsubscribedRecipient):
      return new UnsubscribedRecipientPhoneProviderError(errMsg)

    case match(KnownPreludeErrorMessages.BadConnection):
      return new PhoneProviderConnectionError(errMsg)

    case match(KnownPreludeErrorMessages.ServiceUnavailable):
      return new PhoneProviderUnavailableError(errMsg)

    case match(KnownPreludeErrorMessages.RateLimitsExceeded):
      return new PhoneProviderRateLimitExceededError(errMsg)

    default:
      return new UnknownPhoneProviderServiceError(errMsg)
  }
}

export const KnownPreludeErrorMessages = {
  InvalidPhoneNumber: /invalid phone number|invalid target/i,
  RestrictedRegion: /region.*not.*supported|country.*blocked/i,
  UnsubscribedRecipient: /unsubscribed|opted.*out/i,
  BadConnection: /timeout|connection.*error|network.*error/i,
  RateLimitsExceeded: /rate limit|too many requests|quota.*exceeded/i,
  ServiceUnavailable: /service.*unavailable|server.*error|internal.*error/i,
} as const
