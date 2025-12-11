"use client"

import { useMemo, useState, useCallback, useTransition, useEffect } from "react"
import { useRouter } from "next/navigation"

import { formatDateDisplay } from "../utils"
import { Button } from "../../components/shared/button"
import { Pagination } from "../../components/shared/pagination"
import { TextInput, SelectInput } from "../../components/shared/form-controls"
import { InvitationStatusBadge } from "../../components/invitations/status-badge"

import {
  InvitationStatusOptions,
  InvitationRow,
  StatusFilter,
  InvitationStatus,
} from "./types"
import { getInvitations, RevokeInvitation } from "./getMessages"
import { NotificationMessagesQuery } from "../../generated"

const statusFilterOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: InvitationStatusOptions.All, label: "All Statuses" },
  { value: InvitationStatusOptions.Pending, label: "Pending" },
  { value: InvitationStatusOptions.Accepted, label: "Accepted" },
  { value: InvitationStatusOptions.Revoked, label: "Revoked" },
]

export default function InvitationsPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [data, setData] = useState<NotificationMessagesQuery | null>(null)
  const [loading, setLoading] = useState(true)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    InvitationStatusOptions.All,
  )
  const [dateFilter, setDateFilter] = useState("")
  const [pageItems, setPageItems] = useState<InvitationRow[]>([])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await getInvitations()
        setData(result)
      } catch (error) {
        console.error("Error fetching invitations:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const invitations: InvitationRow[] = useMemo(() => {
    if (!data?.notificationMessages) return []

    return data.notificationMessages.map((message) => ({
      id: message.id,
      status: message.status as InvitationStatus,
      lastActivity: message.updatedAt.toString(),
      sentBy: message.sentBy,
      username: message.username,
    }))
  }, [data])

  const filteredInvitations = useMemo(() => {
    return invitations.filter((invitation) => {
      const matchesSearch = invitation.username
        .toLowerCase()
        .includes(search.toLowerCase())

      const matchesStatus =
        statusFilter === InvitationStatusOptions.All || invitation.status === statusFilter

      const matchesDate =
        !dateFilter ||
        new Date(invitation.lastActivity).toISOString().split("T")[0] === dateFilter

      return matchesSearch && matchesStatus && matchesDate
    })
  }, [invitations, search, statusFilter, dateFilter])

  const resetKey = useMemo(
    () => `${search}|${statusFilter}|${dateFilter}`,
    [search, statusFilter, dateFilter],
  )

  const handleRowClick = useCallback(
    (id: string) => {
      startTransition(() => {
        router.push(`/invitations/${encodeURIComponent(id)}`)
      })
    },
    [router],
  )

  const handlePageChange = useCallback(
    ({ offset, limit }: { offset: number; limit: number }) => {
      setPageItems(filteredInvitations.slice(offset, offset + limit))
    },
    [filteredInvitations],
  )

  const handleCreateNew = useCallback(() => {
    startTransition(() => {
      router.push("/invitations/new")
    })
  }, [router])

  const handleRevokeInvitation = useCallback(async (invitationId: string) => {
    setRevokingId(invitationId)
    try {
      await RevokeInvitation({
        id: invitationId,
        status: "cancelled",
      })

      const result = await getInvitations()
      setData(result)
    } catch (error) {
      console.error("Error revoking invitation:", error)
    } finally {
      setRevokingId(null)
    }
  }, [])

  const hasInvitations = pageItems.length > 0

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-lg text-gray-500">Loading invitations...</div>
      </div>
    )
  }

  return (
    <div className="px-6 py-6 lg:px-10">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Invitations</h1>
        <Button onClick={handleCreateNew} disabled={isPending}>
          <span className="mr-2">➤</span>
          <span>Send New Invitation</span>
        </Button>
      </header>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <TextInput
            type="text"
            placeholder="Search by username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search invitations"
          />
        </div>
        <SelectInput
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="h-10 md:w-48"
          aria-label="Filter by status"
        >
          {statusFilterOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectInput>
        <TextInput
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="h-10 md:w-60"
          aria-label="Filter by date"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left font-medium text-gray-500">
                User
              </th>
              <th scope="col" className="px-6 py-3 text-left font-medium text-gray-500">
                Status
              </th>
              <th scope="col" className="px-6 py-3 text-left font-medium text-gray-500">
                Last Activity
              </th>
              <th scope="col" className="px-6 py-3 text-left font-medium text-gray-500">
                Sent By
              </th>
              <th scope="col" className="px-6 py-3 text-left font-medium text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {hasInvitations ? (
              pageItems.map((invitation) => {
                const formattedDate = formatDateDisplay(invitation.lastActivity)
                const isRevoking = revokingId === invitation.id

                return (
                  <tr
                    key={invitation.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => handleRowClick(invitation.id)}
                  >
                    <td className="whitespace-nowrap px-6 py-4 text-gray-900">
                      {invitation.username}
                    </td>
                    <td className="px-6 py-4">
                      <InvitationStatusBadge status={invitation.status} />
                    </td>
                    <td className="px-6 py-4 text-gray-700">{formattedDate}</td>
                    <td className="px-6 py-4 text-gray-700">{invitation.sentBy}</td>
                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline-blue"
                          onClick={() => handleRowClick(invitation.username)}
                          disabled={isRevoking}
                        >
                          View
                        </Button>
                        {invitation.status === InvitationStatusOptions.Pending && (
                          <Button
                            variant="outline-red"
                            onClick={() => handleRevokeInvitation(invitation.id)}
                            disabled={isRevoking}
                          >
                            {isRevoking ? "Revoking..." : "Revoke"}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td className="px-6 py-8 text-center text-sm text-gray-500" colSpan={5}>
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        totalItems={filteredInvitations.length}
        resetKey={resetKey}
        onPageChange={handlePageChange}
      />
    </div>
  )
}
