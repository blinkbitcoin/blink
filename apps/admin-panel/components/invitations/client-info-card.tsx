import { InvitationStatusBadge } from "./status-badge"
import type { InvitationStatus } from "../../app/invitations/types"
import { AuditedAccountMainValues } from "../../app/types"

interface ClientInfoCardProps {
  invitation: AuditedAccountMainValues | null
}

export function ClientInfoCard({ invitation }: ClientInfoCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="text-lg font-semibold text-gray-900">Client Info</h3>
      <table className="mt-4 w-full text-sm">
        <tbody className="divide-y divide-gray-200">
          <tr>
            <td className="py-2 font-medium text-gray-700">User ID</td>
            <td className="py-2 text-gray-900">{invitation?.id}</td>
          </tr>
          <tr>
            <td className="py-2 font-medium tex-gray-700">LN Address</td>
            <td className="py-2 text-gray-900">{invitation?.username}@blink.sv</td>
          </tr>
          <tr>
            <td className="py-2 font-medium text-gray-700">Status</td>
            <td className="py-2">
              <InvitationStatusBadge
                status={invitation?.status as InvitationStatus}
                label={invitation?.status}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
