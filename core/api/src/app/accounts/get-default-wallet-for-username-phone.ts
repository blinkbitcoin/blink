import { getWalletFromAccount } from "./get-wallet-from-account"
import { createInvitedAccountFromPhone } from "./create-account"

import {
  CouldNotFindUserFromPhoneError,
  CouldNotFindWalletFromUsernameAndCurrencyError,
} from "@/domain/errors"
import { checkedToUsername } from "@/domain/accounts"
import { checkedToPhoneNumber } from "@/domain/users"
import { ANON_PHONE_LOOKUP_GLOBAL_KEY, RateLimitConfig } from "@/domain/rate-limit"
import { RateLimiterExceededError } from "@/domain/rate-limit/errors"
import { AccountsRepository, UsersRepository } from "@/services/mongoose"
import { consumeLimiter } from "@/services/rate-limit"
import { addEventToCurrentSpan } from "@/services/tracing"

export const getDefaultWalletByUsernameOrPhone = async ({
  usernameOrPhone,
  walletCurrency,
  isAuthenticated,
}: {
  usernameOrPhone: Username | PhoneNumber
  walletCurrency?: WalletCurrency
  isAuthenticated: boolean
}): Promise<Wallet | ApplicationError> => {
  let wallet: Wallet | ApplicationError | undefined = undefined
  const username = checkedToUsername(usernameOrPhone)
  if (!(username instanceof Error)) {
    wallet = await getWalletByUsername(username, walletCurrency)
    // we need to do this because previously username allowed valid phone numbers
    if (!(wallet instanceof Error)) return wallet
  }

  const phone = checkedToPhoneNumber(usernameOrPhone)
  if (phone instanceof Error) {
    if (wallet instanceof Error) return wallet
    return new CouldNotFindWalletFromUsernameAndCurrencyError(usernameOrPhone)
  }

  if (!isAuthenticated) {
    const limitOk = await checkAnonPhoneLookupGlobalLimits()
    if (limitOk instanceof Error) return limitOk
  }

  return getWalletByPhone(phone, walletCurrency)
}

const checkAnonPhoneLookupGlobalLimits = async (): Promise<
  true | RateLimiterExceededError
> => {
  const limitOk = await consumeLimiter({
    rateLimitConfig: RateLimitConfig.anonPhoneLookupGlobal,
    keyToConsume: ANON_PHONE_LOOKUP_GLOBAL_KEY,
  })
  if (limitOk instanceof Error) {
    addEventToCurrentSpan("anonPhoneLookupCapExceeded", {
      "phoneLookup.cap.scope": "global",
    })
  }
  return limitOk
}

const getWalletByUsername = async (
  username: Username,
  walletCurrency?: WalletCurrency,
): Promise<Wallet | ApplicationError> => {
  const account = await AccountsRepository().findByUsername(username)
  if (account instanceof Error) return account

  return getWalletFromAccount(account, walletCurrency)
}

const getWalletByPhone = async (
  phone: PhoneNumber,
  walletCurrency?: WalletCurrency,
): Promise<Wallet | ApplicationError> => {
  const user = await UsersRepository().findByPhone(phone)

  if (user instanceof CouldNotFindUserFromPhoneError) {
    const account = await createInvitedAccountFromPhone({ phone })
    if (account instanceof Error) return account

    return getWalletFromAccount(account, walletCurrency)
  }

  if (user instanceof Error) return user

  const account = await AccountsRepository().findByUserId(user.id)
  if (account instanceof Error) return account

  return getWalletFromAccount(account, walletCurrency)
}
