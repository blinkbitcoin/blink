"use server"
import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"

import { ApiKeyResponse } from "./api-key.types"

import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import {
  createApiKey,
  revokeApiKey,
  setApiKeyDailyLimit,
  setApiKeyWeeklyLimit,
  setApiKeyMonthlyLimit,
  setApiKeyAnnualLimit,
  removeApiKeyLimit,
  removeApiKeyWeeklyLimit,
  removeApiKeyMonthlyLimit,
  removeApiKeyAnnualLimit,
} from "@/services/graphql/mutations/api-keys"
import { Scope } from "@/services/graphql/generated"

export const revokeApiKeyServerAction = async (id: string) => {
  if (!id || typeof id !== "string") {
    return {
      error: true,
      message: "API Key ID to revoke is not present",
      data: null,
    }
  }

  const session = await getServerSession(authOptions)
  const token = session?.accessToken
  if (!token || typeof token !== "string") {
    return {
      error: true,
      message: "Token is not present",
      data: null,
    }
  }

  try {
    await revokeApiKey({
      id,
    })
  } catch (err) {
    console.log("error in revokeApiKey ", err)
    return {
      error: true,
      message:
        "Something went wrong Please try again and if error persist contact support",
      data: null,
    }
  }

  revalidatePath("/api-keys")

  return {
    error: false,
    message: "API Key revoked successfully",
    data: { ok: true },
  }
}

export const createApiKeyServerAction = async (
  form: FormData,
): Promise<ApiKeyResponse> => {
  let apiKeyExpiresInDays: number | null = null
  const apiKeyName = form.get("apiKeyName")
  const scopes: Scope[] = []
  if (form.get("readScope")) scopes.push("READ")
  if (form.get("receiveScope")) scopes.push("RECEIVE")
  if (form.get("writeScope")) scopes.push("WRITE")

  if (scopes.length === 0) {
    return {
      error: true,
      message: "At least one scope is required",
      responsePayload: null,
    }
  }

  const apiKeyExpiresInDaysSelect = form.get("apiKeyExpiresInDaysSelect")
  if (!apiKeyName || typeof apiKeyName !== "string") {
    return {
      error: true,
      message: "API Key name to create is not present",
      responsePayload: null,
    }
  }

  if (apiKeyExpiresInDaysSelect === "custom") {
    const customValue = form.get("apiKeyExpiresInDaysCustom")
    apiKeyExpiresInDays = customValue ? parseInt(customValue as string, 10) : null
  } else {
    apiKeyExpiresInDays = apiKeyExpiresInDaysSelect
      ? parseInt(apiKeyExpiresInDaysSelect as string, 10)
      : null
  }

  const session = await getServerSession(authOptions)
  const token = session?.accessToken
  if (!token || typeof token !== "string") {
    return {
      error: true,
      message: "Token is not present",
      responsePayload: null,
    }
  }

  let data
  try {
    data = await createApiKey({
      name: apiKeyName,
      expireInDays: apiKeyExpiresInDays,
      scopes,
    })
  } catch (err) {
    console.log("error in createApiKey ", err)
    return {
      error: true,
      message:
        "Something went wrong Please try again and if error persist contact support",
      responsePayload: null,
    }
  }

  return {
    error: false,
    message: "API Key created successfully",
    responsePayload: { apiKeySecret: data?.apiKeyCreate.apiKeySecret },
  }
}

export const setDailyLimit = async ({
  id,
  dailyLimitSats,
}: {
  id: string
  dailyLimitSats: number
}) => {
  if (!id || typeof id !== "string") {
    throw new Error("API Key ID is not present")
  }

  if (!dailyLimitSats || dailyLimitSats <= 0) {
    throw new Error("Daily limit must be greater than 0")
  }

  const session = await getServerSession(authOptions)
  const token = session?.accessToken
  if (!token || typeof token !== "string") {
    throw new Error("Token is not present")
  }

  try {
    await setApiKeyDailyLimit({ id, dailyLimitSats })
  } catch (err) {
    console.log("error in setApiKeyDailyLimit ", err)
    throw new Error("Failed to set API key daily limit")
  }

  revalidatePath("/api-keys")
}

// Keep old name for backward compatibility
export const setLimit = setDailyLimit

export const setWeeklyLimit = async ({
  id,
  weeklyLimitSats,
}: {
  id: string
  weeklyLimitSats: number
}) => {
  if (!id || typeof id !== "string") {
    throw new Error("API Key ID is not present")
  }

  if (!weeklyLimitSats || weeklyLimitSats <= 0) {
    throw new Error("Weekly limit must be greater than 0")
  }

  const session = await getServerSession(authOptions)
  const token = session?.accessToken
  if (!token || typeof token !== "string") {
    throw new Error("Token is not present")
  }

  try {
    await setApiKeyWeeklyLimit({ id, weeklyLimitSats })
  } catch (err) {
    console.log("error in setApiKeyWeeklyLimit ", err)
    throw new Error("Failed to set API key weekly limit")
  }

  revalidatePath("/api-keys")
}

export const setMonthlyLimit = async ({
  id,
  monthlyLimitSats,
}: {
  id: string
  monthlyLimitSats: number
}) => {
  if (!id || typeof id !== "string") {
    throw new Error("API Key ID is not present")
  }

  if (!monthlyLimitSats || monthlyLimitSats <= 0) {
    throw new Error("Monthly limit must be greater than 0")
  }

  const session = await getServerSession(authOptions)
  const token = session?.accessToken
  if (!token || typeof token !== "string") {
    throw new Error("Token is not present")
  }

  try {
    await setApiKeyMonthlyLimit({ id, monthlyLimitSats })
  } catch (err) {
    console.log("error in setApiKeyMonthlyLimit ", err)
    throw new Error("Failed to set API key monthly limit")
  }

  revalidatePath("/api-keys")
}

export const setAnnualLimit = async ({
  id,
  annualLimitSats,
}: {
  id: string
  annualLimitSats: number
}) => {
  if (!id || typeof id !== "string") {
    throw new Error("API Key ID is not present")
  }

  if (!annualLimitSats || annualLimitSats <= 0) {
    throw new Error("Annual limit must be greater than 0")
  }

  const session = await getServerSession(authOptions)
  const token = session?.accessToken
  if (!token || typeof token !== "string") {
    throw new Error("Token is not present")
  }

  try {
    await setApiKeyAnnualLimit({ id, annualLimitSats })
  } catch (err) {
    console.log("error in setApiKeyAnnualLimit ", err)
    throw new Error("Failed to set API key annual limit")
  }

  revalidatePath("/api-keys")
}

export const removeLimit = async ({ id }: { id: string }) => {
  if (!id || typeof id !== "string") {
    throw new Error("API Key ID is not present")
  }

  const session = await getServerSession(authOptions)
  const token = session?.accessToken
  if (!token || typeof token !== "string") {
    throw new Error("Token is not present")
  }

  try {
    await removeApiKeyLimit({ id })
  } catch (err) {
    console.log("error in removeApiKeyLimit ", err)
    throw new Error("Failed to remove API key limit")
  }

  revalidatePath("/api-keys")
}

export const removeWeeklyLimit = async ({ id }: { id: string }) => {
  if (!id || typeof id !== "string") {
    throw new Error("API Key ID is not present")
  }

  const session = await getServerSession(authOptions)
  const token = session?.accessToken
  if (!token || typeof token !== "string") {
    throw new Error("Token is not present")
  }

  try {
    await removeApiKeyWeeklyLimit({ id })
  } catch (err) {
    console.log("error in removeApiKeyWeeklyLimit ", err)
    throw new Error("Failed to remove API key weekly limit")
  }

  revalidatePath("/api-keys")
}

export const removeMonthlyLimit = async ({ id }: { id: string }) => {
  if (!id || typeof id !== "string") {
    throw new Error("API Key ID is not present")
  }

  const session = await getServerSession(authOptions)
  const token = session?.accessToken
  if (!token || typeof token !== "string") {
    throw new Error("Token is not present")
  }

  try {
    await removeApiKeyMonthlyLimit({ id })
  } catch (err) {
    console.log("error in removeApiKeyMonthlyLimit ", err)
    throw new Error("Failed to remove API key monthly limit")
  }

  revalidatePath("/api-keys")
}

export const removeAnnualLimit = async ({ id }: { id: string }) => {
  if (!id || typeof id !== "string") {
    throw new Error("API Key ID is not present")
  }

  const session = await getServerSession(authOptions)
  const token = session?.accessToken
  if (!token || typeof token !== "string") {
    throw new Error("Token is not present")
  }

  try {
    await removeApiKeyAnnualLimit({ id })
  } catch (err) {
    console.log("error in removeApiKeyAnnualLimit ", err)
    throw new Error("Failed to remove API key annual limit")
  }

  revalidatePath("/api-keys")
}
