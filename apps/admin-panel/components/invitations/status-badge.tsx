"use client"

import type { InvitationStatus } from "../../app/invitations/types"

type InvitationStatusBadgeProps = {
  status: InvitationStatus
  label?: string
}

const invitationStatusMeta: Record<
  InvitationStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "Pending",
    className: "bg-gray-100 text-gray-700",
  },
  accepted: {
    label: "Accepted",
    className: "bg-green-100 text-green-700",
  },
  revoked: {
    label: "Revoked",
    className: "bg-red-100 text-red-700",
  },
  active: {
    label: "Active",
    className: "bg-orange-500 text-white",
  },
}

export function InvitationStatusBadge({ status, label }: InvitationStatusBadgeProps) {
  const meta = invitationStatusMeta[status] || "pending"

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${meta.className}`}
    >
      {label ?? meta.label}
    </span>
  )
}
