export type InvitationStatus = "pending" | "accepted" | "revoked" | "active"

export type InvitationRow = {
  id: string
  status: InvitationStatus
  lastActivity: string
  sentBy: string
  username: string
}

export const InvitationStatusOptions = {
  All: "all",
  Pending: "pending",
  Accepted: "accepted",
  Revoked: "revoked",
  Active: "active",
} as const

export type StatusFilter =
  (typeof InvitationStatusOptions)[keyof typeof InvitationStatusOptions]

export const TemplateIcon = {
  Star: "star",
  Check: "check",
  Bell: "bell",
}

export type TemplateIcon = (typeof TemplateIcon)[keyof typeof TemplateIcon]

export type TemplateRow = {
  id: string
  name: string
  language: string
  icon: TemplateIcon
  title: string
  body: string
  sendPush: boolean
  addHistory: boolean
  addBulletin: boolean
}

export type Event = {
  id: string
  type: string
  timestamp: string
  description: string
  sentBy?: string
}

export type EditableContent = {
  title: string
  body: string
} | null

export type FormState = {
  userQuery: string
  templateId: string
  title: string
  body: string
  sendPush: boolean
  addHistory: boolean
  addBulletin: boolean
}

export type SubmitState = {
  loading: boolean
  success: boolean
  error?: string
}
