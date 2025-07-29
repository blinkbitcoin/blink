import { applyMiddleware } from "graphql-middleware"
import { rule, shield } from "graphql-shield"
import { Rule } from "graphql-shield/typings/rules"

import { NextFunction, Request, Response } from "express"

import DataLoader from "dataloader"

import { startApolloServer } from "./graphql-server"

import { baseLogger } from "@/services/logger"

import { adminMutationFields, adminQueryFields, gqlAdminSchema } from "@/graphql/admin"

import { GALOY_ADMIN_PORT } from "@/config"

import {
  SemanticAttributes,
  addAttributesToCurrentSpanAndPropagate,
  recordExceptionInCurrentSpan,
} from "@/services/tracing"

import { Transactions } from "@/app"

import { AuthorizationError } from "@/graphql/error"

import { RoleChecker, AdminFeature } from "@/services/auth/role-checker"

const roleChecker = new RoleChecker()

const loaders = {
  txnMetadata: new DataLoader(async (keys) => {
    const txnMetadata = await Transactions.getTransactionsMetadataByIds(
      keys as LedgerTransactionId[],
    )
    if (txnMetadata instanceof Error) {
      recordExceptionInCurrentSpan({
        error: txnMetadata,
      })

      return keys.map(() => undefined)
    }

    return txnMetadata
  }),
}

const setGqlAdminContext = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const logger = baseLogger
  const tokenPayload = req.token

  // Extract user email from token payload
  const userEmail = tokenPayload.sub as string // This should be the email from OAuth
  const privilegedClientId = tokenPayload.sub as PrivilegedClientId

  req.gqlContext = {
    loaders,
    privilegedClientId,
    userEmail, // Add email to context
    logger,
  }

  addAttributesToCurrentSpanAndPropagate(
    {
      [SemanticAttributes.HTTP_USER_AGENT]: req.headers["user-agent"],
      [SemanticAttributes.USER_ID]: tokenPayload.sub,
      [SemanticAttributes.ENDUSER_ID]: tokenPayload.sub,
    },
    next,
  )
}

// Feature-specific authorization rules
const requiresViewAccess = rule({ cache: "contextual" })(async (
  parent,
  args,
  ctx: GraphQLAdminContext,
) => {
  if (!ctx.userEmail) return false
  return roleChecker.hasFeature(ctx.userEmail, AdminFeature.VIEW_ACCOUNTS)
})

const requiresModifyAccess = rule({ cache: "contextual" })(async (
  parent,
  args,
  ctx: GraphQLAdminContext,
) => {
  if (!ctx.userEmail) return false
  return roleChecker.hasFeature(ctx.userEmail, AdminFeature.MODIFY_ACCOUNTS)
})

export async function startApolloServerForAdminSchema() {
  // View-only queries
  const viewerQueryFields: { [key: string]: Rule } = {}
  const viewerQueries = [
    "accountDetailsByUserId",
    "accountDetailsByPhone",
    "accountDetailsByEmail",
  ]

  for (const key of viewerQueries) {
    if (adminQueryFields.authed[key]) {
      viewerQueryFields[key] = requiresViewAccess
    }
  }

  // Modification queries
  const modifyQueryFields: { [key: string]: Rule } = {}
  const modifyQueries = ["updateUserPhone", "updateUserEmail"]

  for (const key of modifyQueries) {
    if (adminQueryFields.authed[key]) {
      modifyQueryFields[key] = requiresModifyAccess
    }
  }

  // Apply all mutations with modify access
  const authedMutationFields: { [key: string]: Rule } = {}
  for (const key of Object.keys(adminMutationFields.authed)) {
    authedMutationFields[key] = requiresModifyAccess
  }

  const permissions = shield(
    {
      Query: {
        ...viewerQueryFields,
        ...modifyQueryFields,
      },
      Mutation: authedMutationFields,
    },
    {
      allowExternalErrors: true,
      fallbackError: new AuthorizationError({ logger: baseLogger }),
    },
  )

  const schema = applyMiddleware(gqlAdminSchema, permissions)
  return startApolloServer({
    schema,
    port: GALOY_ADMIN_PORT,
    type: "admin",
    setGqlContext: setGqlAdminContext,
  })
}
