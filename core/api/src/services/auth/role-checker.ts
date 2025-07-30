import { GoogleAuth } from "google-auth-library"

import { env } from "../../config/env"

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

export class RoleChecker {
  private auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  })

  async getUserRoles(userEmail: string): Promise<AdminRole[]> {
    // Only bypass in development/test environments
    if (
      (env.NODE_ENV === "development" || env.NODE_ENV === "test") &&
      env.BYPASS_ROLE_CHECK === "true"
    ) {
      return Object.values(AdminRole)
    }

    // Production uses real role checking
    try {
      const client = await this.auth.getClient()
      const projectId = process.env.GCP_PROJECT_ID
      if (!projectId) {
        throw new Error(
          "GCP_PROJECT_ID environment variable is required for role checking",
        )
      }

      const response = await client.request({
        url: `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:getIamPolicy`,
        method: "POST",
      })

      const policy = response.data as Policy
      const bindings = policy.bindings || []
      const userRoles: AdminRole[] = []

      bindings.forEach((binding) => {
        if (binding.members?.includes(`user:${userEmail}`)) {
          if (
            binding.role &&
            Object.values(AdminRole).includes(binding.role as AdminRole)
          ) {
            userRoles.push(binding.role as AdminRole)
          }
        }
      })

      return userRoles
    } catch (error) {
      console.error("Failed to get user roles:", error)
      return []
    }
  }

  async hasFeature(userEmail: string, feature: AdminFeature): Promise<boolean> {
    const roles = await this.getUserRoles(userEmail)
    return roles.some((role) => ROLE_FEATURES[role]?.includes(feature))
  }
}
