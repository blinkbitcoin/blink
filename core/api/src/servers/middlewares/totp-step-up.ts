import { GraphQLResolveInfo, GraphQLFieldResolver } from "graphql"

import { TOTP_STEP_UP_MUTATIONS } from "./totp-step-up-mutations"

import { Authentication } from "@/app"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"

type InputArgs = { input?: { totpCode?: unknown } }

const requireTotpStepUp = async (
  resolve: GraphQLFieldResolver<unknown, GraphQLPublicContextAuth>,
  parent: unknown,
  args: unknown,
  context: GraphQLPublicContextAuth,
  info: GraphQLResolveInfo,
) => {
  const stepUp = await Authentication.checkTotpStepUp({
    userId: context.user.id,
    totpCode: (args as InputArgs)?.input?.totpCode,
  })
  if (stepUp instanceof Error) return { errors: [mapAndParseErrorForGqlResponse(stepUp)] }

  return resolve(parent, args, context, info)
}

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
