import { getAccountsOnboardConfig } from "@/config"

import { PhoneMetadataAuthorizer } from "@/domain/users"
import {
  InvalidPhoneForOnboardingError,
  InvalidPhoneMetadataForOnboardingError,
} from "@/domain/users/errors"

import { addAttributesToCurrentSpan } from "@/services/tracing"
import { getPhoneProviderVerifyService } from "@/services/phone-provider"

export const getPhoneMetadata = async ({ phone }: { phone: PhoneNumber }) => {
  const { phoneMetadataValidationSettings } = getAccountsOnboardConfig()
  const isValidationEnabled = phoneMetadataValidationSettings.enabled

  const verifyService = getPhoneProviderVerifyService()
  if (verifyService instanceof Error) {
    return isValidationEnabled ? new InvalidPhoneMetadataForOnboardingError() : undefined
  }

  const phoneMetadata = await verifyService.getCarrier(phone)
  if (phoneMetadata instanceof Error) {
    return isValidationEnabled ? new InvalidPhoneMetadataForOnboardingError() : undefined
  }

  if (isValidationEnabled) {
    addAttributesToCurrentSpan({
      "login.phoneMetadata": JSON.stringify(phoneMetadata),
    })

    const authorizedPhoneMetadata = PhoneMetadataAuthorizer(
      phoneMetadataValidationSettings,
    ).authorize(phoneMetadata)

    if (authorizedPhoneMetadata instanceof Error) {
      return new InvalidPhoneForOnboardingError(authorizedPhoneMetadata.name)
    }
  }

  return phoneMetadata
}
