import { Rule } from "graphql-shield/typings/rules"
import { GraphQLFieldConfig } from "graphql"

import BtcWallet from "@/graphql/shared/types/object/btc-wallet"
import GraphQLApplicationError from "@/graphql/shared/types/object/graphql-application-error"
import UsdWallet from "@/graphql/shared/types/object/usd-wallet"

export const ALL_INTERFACE_TYPES = [GraphQLApplicationError, BtcWallet, UsdWallet]

/**
 * Represents a GraphQL field configuration paired with its access rule.
 * Used to define both the field behavior and authorization requirements in one place.
 */
export type AdminFieldDefinition = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  field: GraphQLFieldConfig<any, any, any>
  rule: Rule
}

/**
 * Collection of GraphQL fields with their associated access rules.
 * Provides type safety for admin GraphQL field definitions.
 */
export type AdminFieldDefinitions = Record<string, AdminFieldDefinition>
