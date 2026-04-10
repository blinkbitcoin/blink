import { gql } from "@apollo/client"

import { apolloClient } from ".."
import {
  ApiKeyCreateDocument,
  ApiKeyCreateMutation,
  ApiKeyRevokeDocument,
  ApiKeyRevokeMutation,
  ApiKeySetLimitDocument,
  ApiKeySetLimitMutation,
  ApiKeyRemoveLimitDocument,
  ApiKeyRemoveLimitMutation,
  LimitTimeWindow,
  Scope,
} from "../generated"

gql`
  mutation ApiKeyCreate($input: ApiKeyCreateInput!) {
    apiKeyCreate(input: $input) {
      apiKey {
        id
        name
        createdAt
        revoked
        expired
        lastUsedAt
        expiresAt
        scopes
        limits {
          dailyLimitSats
          weeklyLimitSats
          monthlyLimitSats
          annualLimitSats
          dailySpentSats
          weeklySpentSats
          monthlySpentSats
          annualSpentSats
        }
      }
      apiKeySecret
    }
  }

  mutation ApiKeyRevoke($input: ApiKeyRevokeInput!) {
    apiKeyRevoke(input: $input) {
      apiKey {
        id
        name
        createdAt
        revoked
        expired
        lastUsedAt
        expiresAt
        scopes
      }
    }
  }

  mutation ApiKeySetLimit($input: ApiKeySetLimitInput!) {
    apiKeySetLimit(input: $input) {
      apiKey {
        id
        name
        limits {
          dailyLimitSats
          weeklyLimitSats
          monthlyLimitSats
          annualLimitSats
          dailySpentSats
          weeklySpentSats
          monthlySpentSats
          annualSpentSats
        }
      }
    }
  }

  mutation ApiKeyRemoveLimit($input: ApiKeyRemoveLimitInput!) {
    apiKeyRemoveLimit(input: $input) {
      apiKey {
        id
        name
        limits {
          dailyLimitSats
          weeklyLimitSats
          monthlyLimitSats
          annualLimitSats
          dailySpentSats
          weeklySpentSats
          monthlySpentSats
          annualSpentSats
        }
      }
    }
  }
`

export async function createApiKey({
  name,
  expireInDays,
  scopes,
}: {
  name: string
  expireInDays: number | null
  scopes: Scope[]
}) {
  const client = await apolloClient.authenticated()
  try {
    const { data } = await client.mutate<ApiKeyCreateMutation>({
      mutation: ApiKeyCreateDocument,
      variables: { input: { name, expireInDays, scopes } },
    })
    return data
  } catch (error) {
    console.error("Error executing mutation: apiKeyCreate ==> ", error)
    throw new Error("Error in apiKeyCreate")
  }
}

export async function revokeApiKey({ id }: { id: string }) {
  const client = await apolloClient.authenticated()
  try {
    const { data } = await client.mutate<ApiKeyRevokeMutation>({
      mutation: ApiKeyRevokeDocument,
      variables: { input: { id } },
    })
    return data
  } catch (error) {
    console.error("Error executing mutation: apiKeyRevoke ==> ", error)
    throw new Error("Error in apiKeyRevoke")
  }
}

export async function setApiKeyLimit({
  id,
  limitTimeWindow,
  limitSats,
}: {
  id: string
  limitTimeWindow: LimitTimeWindow
  limitSats: number
}) {
  const client = await apolloClient.authenticated()
  try {
    const { data } = await client.mutate<ApiKeySetLimitMutation>({
      mutation: ApiKeySetLimitDocument,
      variables: { input: { id, limitTimeWindow, limitSats } },
    })
    return data
  } catch (error) {
    console.error("Error executing mutation: apiKeySetLimit ==> ", error)
    throw new Error("Error in apiKeySetLimit")
  }
}

export async function removeApiKeyLimit({
  id,
  limitTimeWindow,
}: {
  id: string
  limitTimeWindow: LimitTimeWindow
}) {
  const client = await apolloClient.authenticated()
  try {
    const { data } = await client.mutate<ApiKeyRemoveLimitMutation>({
      mutation: ApiKeyRemoveLimitDocument,
      variables: { input: { id, limitTimeWindow } },
    })
    return data
  } catch (error) {
    console.error("Error executing mutation: apiKeyRemoveLimit ==> ", error)
    throw new Error("Error in apiKeyRemoveLimit")
  }
}
