import { GoogleAuth } from "google-auth-library"

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

      const userRoles: AdminRole[] = []
      const bindings = response.data.bindings || []

      bindings.forEach((binding) => {
        if (binding.members?.includes(`user:${userEmail}`)) {
          if (Object.values(AdminRole).includes(binding.role)) {
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
