import { GoogleAuth } from "google-auth-library"

import { env } from "../../config/env"

import { baseLogger } from "@/services/logger"

import { recordExceptionInCurrentSpan } from "@/services/tracing"

import { ErrorLevel } from "@/domain/shared"

// Based on https://cloud.google.com/resource-manager/reference/rest/v1/Policy
interface Policy {
  bindings?: Binding[]
  etag?: string
  version?: number
}

interface Binding {
  role?: string
  members?: string[]
  condition?: {
    title?: string
    description?: string
    expression?: string
  }
}

export enum AdminRole {
  VIEWER = "roles/adminPanelViewer",
  SUPPORT = "roles/adminPanelSupport",
  ADMIN = "roles/adminPanelAdmin",
}

export enum AdminFeature {
  VIEW_ACCOUNTS = "VIEW_ACCOUNTS",
  MODIFY_ACCOUNTS = "MODIFY_ACCOUNTS",
  DELETE_ACCOUNTS = "DELETE_ACCOUNTS",
  VIEW_TRANSACTIONS = "VIEW_TRANSACTIONS",
  SEND_NOTIFICATIONS = "SEND_NOTIFICATIONS",
  SYSTEM_CONFIG = "SYSTEM_CONFIG",
}

const ROLE_FEATURES = {
  [AdminRole.VIEWER]: [AdminFeature.VIEW_ACCOUNTS, AdminFeature.VIEW_TRANSACTIONS],
  [AdminRole.SUPPORT]: [
    AdminFeature.VIEW_ACCOUNTS,
    AdminFeature.MODIFY_ACCOUNTS,
    AdminFeature.VIEW_TRANSACTIONS,
    AdminFeature.SEND_NOTIFICATIONS,
  ],
  [AdminRole.ADMIN]: Object.values(AdminFeature),
}

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  keyFilename: env.GCP_IAM_SERVICE_ACCOUNT_PATH,
})

export const getUserRoles = async (userEmail: string): Promise<AdminRole[]> => {
  // Only bypass in development/test environments
  if (
    (env.NODE_ENV === "development" || env.NODE_ENV === "test") &&
    env.BYPASS_ROLE_CHECK
  ) {
    return Object.values(AdminRole)
  }

  // Production uses real role checking
  try {
    const client = await auth.getClient()
    const projectId = process.env.GCP_PROJECT_ID
    if (!projectId) {
      throw new Error("GCP_PROJECT_ID environment variable is required for role checking")
    }

    const response = await client.request({
      url: `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:getIamPolicy`,
      method: "POST",
    })

    const policy = response.data as Policy
    const bindings = policy.bindings || []
    const userRoles = bindings.reduce<AdminRole[]>((roles, binding) => {
      if (binding.members?.includes(`user:${userEmail}`)) {
        if (
          binding.role &&
          Object.values(AdminRole).includes(binding.role as AdminRole)
        ) {
          roles.push(binding.role as AdminRole)
        }
      }
      return roles
    }, [])

    return userRoles
  } catch (error) {
    baseLogger.error("Failed to get user roles:", error)
    recordExceptionInCurrentSpan({
      error,
      level: ErrorLevel.Critical,
      attributes: {
        "getUserRoles.error.userEmail": userEmail,
      },
    })
    return []
  }
}

export const hasFeature = async (
  userEmail: string,
  feature: AdminFeature,
): Promise<boolean> => {
  const roles = await getUserRoles(userEmail)
  return roles.some((role) => ROLE_FEATURES[role]?.includes(feature))
}
