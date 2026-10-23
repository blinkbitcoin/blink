import { GraphQLResolveInfo, GraphQLFieldResolver } from "graphql"

import { Authentication } from "@/app"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"
import { TotpCodeRequiredError } from "@/domain/authentication/errors"
import { TotpCodeInvalidError } from "@/domain/kratos"
import { IdentityRepository, checkedToTotpCode } from "@/services/kratos"

// mutations that need a fresh authenticator code when the identity has TOTP
export const TOTP_STEP_UP_MUTATIONS = [
  "userTotpDelete",
  "userEmailDelete",
  "userEmailRegistrationInitiate",
  "userPhoneDelete",
  "userPhoneRegistrationValidate",
] as const

type InputArgs = { input?: { totpCode?: unknown } }

const refuse = (err: ApplicationError) => ({
  errors: [mapAndParseErrorForGqlResponse(err)],
})

const requireTotpStepUp = async (
  resolve: GraphQLFieldResolver<unknown, GraphQLPublicContextAuth>,
  parent: unknown,
  args: unknown,
  context: GraphQLPublicContextAuth,
  info: GraphQLResolveInfo,
) => {
  const userId = context.user.id

  const identity = await IdentityRepository().getIdentity(userId)
  if (identity instanceof Error) return refuse(identity)
  if (!identity.totpEnabled) return resolve(parent, args, context, info)

  const rawCode = (args as InputArgs)?.input?.totpCode
  if (rawCode === undefined || rawCode === null || rawCode === "") {
    return refuse(new TotpCodeRequiredError())
  }
  if (typeof rawCode !== "string") return refuse(new TotpCodeInvalidError())

  const totpCode = checkedToTotpCode(rawCode)
  if (totpCode instanceof Error) return refuse(new TotpCodeInvalidError())

  const verified = await Authentication.verifyTotpCode({ userId, totpCode })
  if (verified instanceof Error) return refuse(verified)

  return resolve(parent, args, context, info)
}

// Placed here because 'GraphQLFieldResolver' not working from .d.ts file
type TotpStepUpFn = (
  resolve: GraphQLFieldResolver<unknown, GraphQLPublicContextAuth>,
  parent: unknown,
  args: unknown,
  context: GraphQLPublicContextAuth,
  info: GraphQLResolveInfo,
) => Promise<unknown>

const totpStepUpMutationFields: { [key: string]: TotpStepUpFn } = {}
for (const key of TOTP_STEP_UP_MUTATIONS) {
  totpStepUpMutationFields[key] = requireTotpStepUp
}

export const totpStepUpMiddleware = {
  Mutation: totpStepUpMutationFields,
}
