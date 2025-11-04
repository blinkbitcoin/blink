import { gql } from "@apollo/client"

import { apolloClient } from ".."
import {
  ApiKeyCreateDocument,
  ApiKeyCreateMutation,
  ApiKeyRevokeDocument,
  ApiKeyRevokeMutation,
  ApiKeySetDailyLimitDocument,
  ApiKeySetDailyLimitMutation,
  ApiKeySetWeeklyLimitDocument,
  ApiKeySetWeeklyLimitMutation,
  ApiKeySetMonthlyLimitDocument,
  ApiKeySetMonthlyLimitMutation,
  ApiKeySetAnnualLimitDocument,
  ApiKeySetAnnualLimitMutation,
  ApiKeyRemoveDailyLimitDocument,
  ApiKeyRemoveDailyLimitMutation,
  ApiKeyRemoveWeeklyLimitDocument,
  ApiKeyRemoveWeeklyLimitMutation,
  ApiKeyRemoveMonthlyLimitDocument,
  ApiKeyRemoveMonthlyLimitMutation,
  ApiKeyRemoveAnnualLimitDocument,
  ApiKeyRemoveAnnualLimitMutation,
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
        dailyLimitSats
        weeklyLimitSats
        monthlyLimitSats
        annualLimitSats
        spentLast24HSats
        spentLast7DSats
        spentLast30DSats
        spentLast365DSats
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

  mutation ApiKeySetDailyLimit($input: ApiKeySetDailyLimitInput!) {
    apiKeySetDailyLimit(input: $input) {
      apiKey {
        id
        name
        dailyLimitSats
        weeklyLimitSats
        monthlyLimitSats
        annualLimitSats
        spentLast24HSats
        spentLast7DSats
        spentLast30DSats
        spentLast365DSats
      }
    }
  }

  mutation ApiKeyRemoveDailyLimit($input: ApiKeyRemoveLimitInput!) {
    apiKeyRemoveDailyLimit(input: $input) {
      apiKey {
        id
        name
        dailyLimitSats
        weeklyLimitSats
        monthlyLimitSats
        annualLimitSats
        spentLast24HSats
        spentLast7DSats
        spentLast30DSats
        spentLast365DSats
      }
    }
  }

  mutation ApiKeySetWeeklyLimit($input: ApiKeySetWeeklyLimitInput!) {
    apiKeySetWeeklyLimit(input: $input) {
      apiKey {
        id
        name
        dailyLimitSats
        weeklyLimitSats
        monthlyLimitSats
        annualLimitSats
        spentLast24HSats
        spentLast7DSats
        spentLast30DSats
        spentLast365DSats
      }
    }
  }

  mutation ApiKeyRemoveWeeklyLimit($input: ApiKeyRemoveLimitInput!) {
    apiKeyRemoveWeeklyLimit(input: $input) {
      apiKey {
        id
        name
        dailyLimitSats
        weeklyLimitSats
        monthlyLimitSats
        annualLimitSats
        spentLast24HSats
        spentLast7DSats
        spentLast30DSats
        spentLast365DSats
      }
    }
  }

  mutation ApiKeySetMonthlyLimit($input: ApiKeySetMonthlyLimitInput!) {
    apiKeySetMonthlyLimit(input: $input) {
      apiKey {
        id
        name
        dailyLimitSats
        weeklyLimitSats
        monthlyLimitSats
        annualLimitSats
        spentLast24HSats
        spentLast7DSats
        spentLast30DSats
        spentLast365DSats
      }
    }
  }

  mutation ApiKeyRemoveMonthlyLimit($input: ApiKeyRemoveLimitInput!) {
    apiKeyRemoveMonthlyLimit(input: $input) {
      apiKey {
        id
        name
        dailyLimitSats
        weeklyLimitSats
        monthlyLimitSats
        annualLimitSats
        spentLast24HSats
        spentLast7DSats
        spentLast30DSats
        spentLast365DSats
      }
    }
  }

  mutation ApiKeySetAnnualLimit($input: ApiKeySetAnnualLimitInput!) {
    apiKeySetAnnualLimit(input: $input) {
      apiKey {
        id
        name
        dailyLimitSats
        weeklyLimitSats
        monthlyLimitSats
        annualLimitSats
        spentLast24HSats
        spentLast7DSats
        spentLast30DSats
        spentLast365DSats
      }
    }
  }

  mutation ApiKeyRemoveAnnualLimit($input: ApiKeyRemoveLimitInput!) {
    apiKeyRemoveAnnualLimit(input: $input) {
      apiKey {
        id
        name
        dailyLimitSats
        weeklyLimitSats
        monthlyLimitSats
        annualLimitSats
        spentLast24HSats
        spentLast7DSats
        spentLast30DSats
        spentLast365DSats
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

export async function setApiKeyDailyLimit({
  id,
  dailyLimitSats,
}: {
  id: string
  dailyLimitSats: number
}) {
  const client = await apolloClient.authenticated()
  try {
    const { data } = await client.mutate<ApiKeySetDailyLimitMutation>({
      mutation: ApiKeySetDailyLimitDocument,
      variables: { input: { id, dailyLimitSats } },
    })
    return data
  } catch (error) {
    console.error("Error executing mutation: apiKeySetDailyLimit ==> ", error)
    throw new Error("Error in apiKeySetDailyLimit")
  }
}

export async function setApiKeyWeeklyLimit({
  id,
  weeklyLimitSats,
}: {
  id: string
  weeklyLimitSats: number
}) {
  const client = await apolloClient.authenticated()
  try {
    const { data } = await client.mutate<ApiKeySetWeeklyLimitMutation>({
      mutation: ApiKeySetWeeklyLimitDocument,
      variables: { input: { id, weeklyLimitSats } },
    })
    return data
  } catch (error) {
    console.error("Error executing mutation: apiKeySetWeeklyLimit ==> ", error)
    throw new Error("Error in apiKeySetWeeklyLimit")
  }
}

export async function setApiKeyMonthlyLimit({
  id,
  monthlyLimitSats,
}: {
  id: string
  monthlyLimitSats: number
}) {
  const client = await apolloClient.authenticated()
  try {
    const { data } = await client.mutate<ApiKeySetMonthlyLimitMutation>({
      mutation: ApiKeySetMonthlyLimitDocument,
      variables: { input: { id, monthlyLimitSats } },
    })
    return data
  } catch (error) {
    console.error("Error executing mutation: apiKeySetMonthlyLimit ==> ", error)
    throw new Error("Error in apiKeySetMonthlyLimit")
  }
}

export async function setApiKeyAnnualLimit({
  id,
  annualLimitSats,
}: {
  id: string
  annualLimitSats: number
}) {
  const client = await apolloClient.authenticated()
  try {
    const { data } = await client.mutate<ApiKeySetAnnualLimitMutation>({
      mutation: ApiKeySetAnnualLimitDocument,
      variables: { input: { id, annualLimitSats } },
    })
    return data
  } catch (error) {
    console.error("Error executing mutation: apiKeySetAnnualLimit ==> ", error)
    throw new Error("Error in apiKeySetAnnualLimit")
  }
}

export async function removeApiKeyLimit({ id }: { id: string }) {
  const client = await apolloClient.authenticated()
  try {
    const { data } = await client.mutate<ApiKeyRemoveDailyLimitMutation>({
      mutation: ApiKeyRemoveDailyLimitDocument,
      variables: { input: { id } },
    })
    return data
  } catch (error) {
    console.error("Error executing mutation: apiKeyRemoveDailyLimit ==> ", error)
    throw new Error("Error in apiKeyRemoveDailyLimit")
  }
}

export async function removeApiKeyWeeklyLimit({ id }: { id: string }) {
  const client = await apolloClient.authenticated()
  try {
    const { data } = await client.mutate<ApiKeyRemoveWeeklyLimitMutation>({
      mutation: ApiKeyRemoveWeeklyLimitDocument,
      variables: { input: { id } },
    })
    return data
  } catch (error) {
    console.error("Error executing mutation: apiKeyRemoveWeeklyLimit ==> ", error)
    throw new Error("Error in apiKeyRemoveWeeklyLimit")
  }
}

export async function removeApiKeyMonthlyLimit({ id }: { id: string }) {
  const client = await apolloClient.authenticated()
  try {
    const { data } = await client.mutate<ApiKeyRemoveMonthlyLimitMutation>({
      mutation: ApiKeyRemoveMonthlyLimitDocument,
      variables: { input: { id } },
    })
    return data
  } catch (error) {
    console.error("Error executing mutation: apiKeyRemoveMonthlyLimit ==> ", error)
    throw new Error("Error in apiKeyRemoveMonthlyLimit")
  }
}

export async function removeApiKeyAnnualLimit({ id }: { id: string }) {
  const client = await apolloClient.authenticated()
  try {
    const { data } = await client.mutate<ApiKeyRemoveAnnualLimitMutation>({
      mutation: ApiKeyRemoveAnnualLimitDocument,
      variables: { input: { id } },
    })
    return data
  } catch (error) {
    console.error("Error executing mutation: apiKeyRemoveAnnualLimit ==> ", error)
    throw new Error("Error in apiKeyRemoveAnnualLimit")
  }
}
