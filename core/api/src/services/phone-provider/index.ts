import { TwilioClient, TWILIO_ACCOUNT_TEST } from "./twilio-service"
import { PreludeClient } from "./prelude-service"

import {
  getPhoneProviderConfig,
  UNSECURE_DEFAULT_LOGIN_CODE,
  getTestAccounts,
  TWILIO_ACCOUNT_SID,
} from "@/config"
import { NotImplementedError } from "@/domain/errors"
import { PhoneCodeInvalidError, PhoneProviderConfigError } from "@/domain/phone-provider"
import { TestAccountsChecker } from "@/domain/accounts/test-accounts-checker"

const PROVIDERS = {
  prelude: PreludeClient,
  twilio: TwilioClient,
} as const

export const getPhoneProviderVerifyService = ():
  | IPhoneProviderVerifyService
  | PhoneProviderConfigError => {
  const config = getPhoneProviderConfig()
  const providerFactory = PROVIDERS[config.verify]

  if (!providerFactory) {
    return new PhoneProviderConfigError(`Unsupported verify provider: ${config.verify}`)
  }

  const provider = providerFactory()
  if (provider instanceof PhoneProviderConfigError) {
    return provider
  }

  if (!hasVerifyCapabilities(provider)) {
    return new PhoneProviderConfigError(
      `Provider '${config.verify}' does not support verify operations`,
    )
  }

  return provider
}

export const getPhoneProviderTransactionalService = ():
  | IPhoneProviderTransactionalService
  | PhoneProviderConfigError => {
  const config = getPhoneProviderConfig()
  const providerFactory = PROVIDERS[config.transactional]

  if (!providerFactory) {
    return new PhoneProviderConfigError(
      `Unsupported transactional provider: ${config.transactional}`,
    )
  }

  const provider = providerFactory()
  if (provider instanceof PhoneProviderConfigError) {
    return provider
  }

  if (!hasTransactionalCapabilities(provider)) {
    return new PhoneProviderConfigError(
      `Provider '${config.transactional}' does not support transactional SMS operations`,
    )
  }

  return provider
}

const hasVerifyCapabilities = (
  provider: unknown,
): provider is IPhoneProviderVerifyService => {
  return (
    typeof provider === "object" &&
    provider !== null &&
    "getCarrier" in provider &&
    "validateDestination" in provider &&
    "initiateVerify" in provider &&
    "validateVerify" in provider &&
    typeof provider.getCarrier === "function" &&
    typeof provider.validateDestination === "function" &&
    typeof provider.initiateVerify === "function" &&
    typeof provider.validateVerify === "function"
  )
}

const hasTransactionalCapabilities = (
  provider: unknown,
): provider is IPhoneProviderTransactionalService => {
  return (
    typeof provider === "object" &&
    provider !== null &&
    "sendTemplatedSMS" in provider &&
    typeof provider.sendTemplatedSMS === "function"
  )
}

export const isPhoneCodeValid = async ({
  code,
  phone,
}: {
  phone: PhoneNumber
  code: PhoneCode
}) => {
  if (code === UNSECURE_DEFAULT_LOGIN_CODE) {
    return true
  }

  const testAccounts = getTestAccounts()
  if (TestAccountsChecker(testAccounts).isPhoneTest(phone)) {
    const validTestCode = TestAccountsChecker(testAccounts).isPhoneTestAndCodeValid({
      code,
      phone,
    })
    if (!validTestCode) {
      return new PhoneCodeInvalidError()
    }
    return true
  }

  // we can't mock this function properly because in the e2e test,
  // the server is been launched as a sub process,
  // so it's not been mocked by jest
  if (TWILIO_ACCOUNT_SID === TWILIO_ACCOUNT_TEST) {
    return new NotImplementedError("use test account for local dev and tests")
  }

  const verifyService = getPhoneProviderVerifyService()
  if (verifyService instanceof PhoneProviderConfigError) {
    return verifyService
  }

  return verifyService.validateVerify({ to: phone, code })
}
