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

  const verifyService = getPhoneProviderVerifyService()
  if (verifyService instanceof Error) {
    if (!phoneMetadataValidationSettings.enabled) {
      return undefined
    }
    return new InvalidPhoneMetadataForOnboardingError()
  }

  const newPhoneMetadata = await verifyService.getCarrier(phone)
  if (newPhoneMetadata instanceof Error) {
    if (!phoneMetadataValidationSettings.enabled) {
      return undefined
    }

    return new InvalidPhoneMetadataForOnboardingError()
  }

  const phoneMetadata = newPhoneMetadata

  if (phoneMetadataValidationSettings.enabled) {
    const authorizedPhoneMetadata = PhoneMetadataAuthorizer(
      phoneMetadataValidationSettings,
    ).authorize(phoneMetadata)

    addAttributesToCurrentSpan({
      "login.phoneMetadata": JSON.stringify(phoneMetadata),
    })

    if (authorizedPhoneMetadata instanceof Error) {
      return new InvalidPhoneForOnboardingError(authorizedPhoneMetadata.name)
    }
  }

  return phoneMetadata
}
