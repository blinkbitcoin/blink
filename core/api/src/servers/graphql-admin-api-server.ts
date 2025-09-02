import { applyMiddleware } from "graphql-middleware"
import { shield } from "graphql-shield"

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
  const scopeString = (tokenPayload.scope as string) || "[]"
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

// No need for complex permission mapping - the queries and mutations now export direct field -> rule mappings

export async function startApolloServerForAdminSchema() {
  // The permission mappings are now direct field -> rule mappings, so we can use them directly
  const permissions = shield(
    {
      Query: queryPermissions,
      Mutation: mutationPermissions,
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
