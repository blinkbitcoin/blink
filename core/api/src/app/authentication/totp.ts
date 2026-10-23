import { createHash } from "crypto"

import {
  checkLoginAttemptPerLoginIdentifierLimits,
  checkTotpVerifyAttemptPerUserLimits,
} from "./ratelimits"
import { recordLoginActivity } from "./record-login-activity"

import { getTotpRemovalBlockedBalance } from "@/config"

import { getBalanceForWallet } from "@/app/wallets/get-balance-for-wallet"

import {
  AuthTokenUserIdMismatchError,
  IdentifierNotFoundError,
  TotpRemovalBalanceTooHighError,
} from "@/domain/authentication/errors"
import { TotpAlreadyExistsError } from "@/domain/kratos"
import { ErrorLevel, WalletCurrency } from "@/domain/shared"
import {
  AuthWithEmailPasswordlessService,
  AuthWithPhonePasswordlessService,
  IdentityRepository,
  kratosElevatingSessionWithTotp,
  kratosInitiateTotp,
  kratosRemoveTotp,
  kratosRevokeSessionToken,
  kratosValidateTotp,
  kratosVerifyTotpOnSession,
  logoutSessionByAuthToken,
  refreshToken,
  validateKratosToken,
} from "@/services/kratos"

import { UsersRepository, WalletsRepository } from "@/services/mongoose"
import { recordExceptionInCurrentSpan } from "@/services/tracing"

export const initiateTotpRegistration = async ({
  userId,
}: {
  userId: UserId
}): Promise<InitiateTotpRegistrationResult | KratosError> => {
  const identity = await IdentityRepository().getIdentity(userId)
  if (identity instanceof Error) return identity
  if (identity.totpEnabled) return new TotpAlreadyExistsError()

  const authToken = await getAuthTokenForIdentity(identity)
  if (authToken instanceof Error) {
    return authToken
  }
  const initiateResponse = await kratosInitiateTotp(authToken)
  if (initiateResponse instanceof Error) return initiateResponse

  await logoutSessionByAuthToken(authToken)

  return initiateResponse
}

export const validateTotpRegistration = async ({
  authToken,
  totpCode,
  totpRegistrationId,
  userId,
}: {
  authToken: AuthToken | null
  totpCode: TotpCode
  totpRegistrationId: TotpRegistrationId
  userId: UserId
}): Promise<User | ApplicationError> => {
  if (authToken) {
    return validateTotpRegistrationWithToken({
      authToken,
      totpCode,
      totpRegistrationId,
      userId,
    })
  }

  return validateTotpRegistrationWithoutToken({
    totpCode,
    totpRegistrationId,
    userId,
  })
}

const validateTotpRegistrationWithoutToken = async ({
  totpCode,
  totpRegistrationId,
  userId,
}: {
  totpCode: TotpCode
  totpRegistrationId: TotpRegistrationId
  userId: UserId
}): Promise<User | ApplicationError> => {
  const authToken = await getAuthTokenFromUserId(userId)
  if (authToken instanceof Error) {
    return authToken
  }
  const validation = await kratosValidateTotp({ authToken, totpCode, totpRegistrationId })
  if (validation instanceof Error) return validation

  const res = await validateKratosToken(authToken)
  await logoutSessionByAuthToken(authToken)
  if (res instanceof Error) return res
  if (res.kratosUserId !== userId) return new AuthTokenUserIdMismatchError()

  const me = await UsersRepository().findById(res.kratosUserId)
  if (me instanceof Error) return me

  return me
}

const validateTotpRegistrationWithToken = async ({
  authToken,
  totpCode,
  totpRegistrationId,
  userId,
}: {
  authToken: AuthToken
  totpCode: TotpCode
  totpRegistrationId: TotpRegistrationId
  userId: UserId
}): Promise<User | ApplicationError> => {
  const res = await refreshToken(authToken)
  if (res instanceof Error) return res

  const validation = await kratosValidateTotp({ authToken, totpCode, totpRegistrationId })
  if (validation instanceof Error) return validation

  const res2 = await validateKratosToken(authToken)
  if (res2 instanceof Error) return res2
  if (res2.kratosUserId !== userId) return new AuthTokenUserIdMismatchError()

  const me = await UsersRepository().findById(res2.kratosUserId)
  if (me instanceof Error) return me

  return me
}

export const elevatingSessionWithTotp = async ({
  authToken,
  totpCode,
}: {
  authToken: AuthToken
  totpCode: TotpCode
}): Promise<boolean | KratosError> => {
  // hashing the authToken to use it as a key for the rate limit
  // this limit exposure of the authToken in redis
  const hashedAuthToken = createHash("sha256")
    .update(authToken)
    .digest("hex") as HashedAuthToken

  {
    const limitOk = await checkLoginAttemptPerLoginIdentifierLimits(hashedAuthToken)
    if (limitOk instanceof Error) return limitOk
  }

  const userId = await kratosElevatingSessionWithTotp({ authToken, totpCode })
  if (userId instanceof Error) return userId

  // the first factor skips this while a second factor is pending
  await recordLoginActivity({ userId })
  return true
}

export const removeTotp = async ({
  userId,
}: {
  userId: UserId
}): Promise<User | ApplicationError> => {
  const authToken = await getAuthTokenFromUserId(userId)
  if (authToken instanceof Error) {
    return authToken
  }

  const res2 = await kratosRemoveTotp(userId)
  if (res2 instanceof Error) return res2

  await logoutSessionByAuthToken(authToken)

  const me = await UsersRepository().findById(userId)
  if (me instanceof Error) return me

  return me
}

// checks a code on a throwaway session so the caller's session and login activity are untouched
export const verifyTotpCode = async ({
  identity,
  totpCode,
}: {
  identity: AnyIdentity
  totpCode: TotpCode
}): Promise<true | ApplicationError> => {
  const limitOk = await checkTotpVerifyAttemptPerUserLimits(identity.id)
  if (limitOk instanceof Error) return limitOk

  const authToken = await getAuthTokenForIdentity(identity)
  if (authToken instanceof Error) return authToken

  try {
    return await kratosVerifyTotpOnSession({ authToken, totpCode })
  } finally {
    const revoked = await kratosRevokeSessionToken(authToken)
    if (revoked instanceof Error) {
      recordExceptionInCurrentSpan({ error: revoked, level: ErrorLevel.Warn })
    }
  }
}

export const checkTotpRemovalAllowed = async ({
  accountId,
}: {
  accountId: AccountId
}): Promise<true | ApplicationError> => {
  const blocked = getTotpRemovalBlockedBalance()

  const wallets = await WalletsRepository().listByAccountId(accountId)
  if (wallets instanceof Error) return wallets

  for (const wallet of wallets) {
    const balance = await getBalanceForWallet({ walletId: wallet.id })
    if (balance instanceof Error) return balance

    const threshold = wallet.currency === WalletCurrency.Btc ? blocked.btc : blocked.usd
    if (balance >= threshold) return new TotpRemovalBalanceTooHighError()
  }

  return true
}

const getAuthTokenFromUserId = async (
  userId: UserId,
): Promise<AuthToken | AuthenticationError | KratosError> => {
  const identity = await IdentityRepository().getIdentity(userId)
  if (identity instanceof Error) return identity

  return getAuthTokenForIdentity(identity)
}

const getAuthTokenForIdentity = async ({
  phone,
  email,
}: AnyIdentity): Promise<AuthToken | AuthenticationError | KratosError> => {
  let kratosResult:
    | IAuthWithEmailPasswordlessService
    | LoginWithPhoneNoPasswordSchemaResponse
    | KratosError
    | null = null

  if (phone) {
    const authService = AuthWithPhonePasswordlessService()
    kratosResult = await authService.loginToken({ phone })
  } else if (email) {
    const emailAuthService = AuthWithEmailPasswordlessService()
    kratosResult = await emailAuthService.loginToken({ email })
  } else {
    return new IdentifierNotFoundError()
  }

  if (kratosResult instanceof Error) {
    return kratosResult
  }

  return kratosResult?.authToken
}
