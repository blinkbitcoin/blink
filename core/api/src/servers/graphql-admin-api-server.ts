import { applyMiddleware } from "graphql-middleware"
import { rule, shield } from "graphql-shield"
import { Rule } from "graphql-shield/typings/rules"

import { NextFunction, Request, Response } from "express"

import DataLoader from "dataloader"

import { startApolloServer } from "./graphql-server"

import { baseLogger } from "@/services/logger"

import { gqlAdminSchema } from "@/graphql/admin"

import { queryPermissions } from "@/graphql/admin/queries"

import { mutationPermissions } from "@/graphql/admin/mutations"

import { GALOY_ADMIN_PORT } from "@/config"

import {
  SemanticAttributes,
  addAttributesToCurrentSpanAndPropagate,
  recordExceptionInCurrentSpan,
} from "@/services/tracing"

import { Transactions } from "@/app"

import { AuthorizationError } from "@/graphql/error"

import { AdminAccessRight, hasAccessRightInScope } from "@/services/auth/role-checker"

// TODO: loaders probably not needed for the admin panel
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

  console.log("JWT Token payload:", tokenPayload)

  const userEmail = tokenPayload.sub as string // This should be the email from OAuth
  const role = tokenPayload.role as string
  const scopeString = tokenPayload.scope as string || "[]"
  const scope = JSON.parse(scopeString) as string[]
  const privilegedClientId = tokenPayload.sub as PrivilegedClientId

  req.gqlContext = {
    loaders,
    privilegedClientId,
    userEmail, // Add email to context
    role,
    scope,
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

const requiresViewAccess = rule({ cache: "contextual" })(async (
  parent,
  args,
  ctx: GraphQLAdminContext,
) => {
  if (!ctx.userEmail || !ctx.scope) return false
  return hasAccessRightInScope(ctx.scope, AdminAccessRight.VIEW_ACCOUNTS)
})

const requiresModifyAccess = rule({ cache: "contextual" })(async (
  parent,
  args,
  ctx: GraphQLAdminContext,
) => {
  if (!ctx.userEmail || !ctx.scope) return false
  return hasAccessRightInScope(ctx.scope, AdminAccessRight.MODIFY_ACCOUNTS)
})

export async function startApolloServerForAdminSchema() {
  const viewerQueryFields: { [key: string]: Rule } = {}
  for (const key of queryPermissions.view) {
    viewerQueryFields[key] = requiresViewAccess
  }

  const authedMutationFields: { [key: string]: Rule } = {}
  for (const key of mutationPermissions.modify) {
    authedMutationFields[key] = requiresModifyAccess
  }

  const permissions = shield(
    {
      Query: viewerQueryFields,
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
