"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { visaInvitationsMock, visaTemplatesMock } from "../../mock-data"
import type { Event, InvitationRow, TemplateRow, InvitationStatus } from "../types"

import { InvitationCard } from "../../../components/invitations/invitation-card"
import { ClientInfoCard } from "../../../components/invitations/client-info-card"
import { StatusHistoryCard } from "../../../components/invitations/status-history-card"
import { ChangeStatusModal } from "../../../components/invitations/change-status-modal"

import { accountSearchInvitation } from "./search-invitation"
import { AuditedAccountMainValues } from "../../types"

type EditableContent = {
  title: string
  body: string
} | null

const InvitationStatuses = {
  pending: { label: "Pending", color: "bg-yellow-100 text-yellow-800" },
  accepted: { label: "Accepted", color: "bg-green-100 text-green-800" },
  revoked: { label: "Revoked", color: "bg-red-100 text-red-800" },
  active: { label: "Active", color: "bg-red-100 text-red-800" },
} as const

const formatDate = (date: Date | string) => {
  const d = new Date(date)
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

const formatDateTime = (date: Date | string) => {
  const d = new Date(date)
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function InvitationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const invitationUsername = params.username as string

  const [invitation, setInvitation] = useState<InvitationRow | null>(null)
  const [userInvitation, setUserInvitation] = useState<AuditedAccountMainValues | null>(
    null,
  )
  const [loading, setLoading] = useState<boolean>(true)
  const [template, setTemplate] = useState<TemplateRow | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [editableContent, setEditableContent] = useState<EditableContent>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedStatus, setSelectedStatus] = useState<InvitationStatus | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<string>("")
  const [sendPush, setSendPush] = useState(true)
  const [addHistory, setAddHistory] = useState(true)

  useEffect(() => {
    const foundInvitation = visaInvitationsMock.find(
      (inv) => inv.id === invitationUsername,
    )

    const fetchUserData = async (invitationUsername: string) => {
      try {
        const data = await accountSearchInvitation(invitationUsername)
        setUserInvitation(data)
      } catch (error) {
        console.error("Error fetching user data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchUserData(invitationUsername)

    if (foundInvitation) {
      setInvitation(foundInvitation)
      const defaultTemplate = visaTemplatesMock[0]
      if (defaultTemplate) {
        setTemplate(defaultTemplate)
        setEditableContent({
          title: defaultTemplate.title,
          body: defaultTemplate.body,
        })
      }

      const initialEvents: Event[] = [
        {
          id: `evt_${foundInvitation.id}_initial`,
          type: "Invitation Sent",
          timestamp: new Date(foundInvitation.lastActivity).toISOString(),
          description: "Invitation sent to user",
          sentBy: foundInvitation.sentBy,
        },
      ]

      if (foundInvitation.status === "accepted") {
        initialEvents.push({
          id: `evt_${foundInvitation.id}_accepted`,
          type: "Status Change",
          timestamp: new Date(
            new Date(foundInvitation.lastActivity).getTime() + 86400000,
          ).toISOString(),
          description: "Invitation accepted",
          sentBy: "User",
        })
      }

      setEvents(initialEvents)
    }
  }, [invitationUsername])

  const handleContentChange = (field: "title" | "body", value: string) => {
    setEditableContent((prev) => {
      if (!prev) return { title: "", body: "" }
      return {
        ...prev,
        [field]: value,
      }
    })
  }

  const handleStatusChange = (newStatus: InvitationStatus) => {
    if (!invitation) return

    const newEvent: Event = {
      id: `evt_${invitation.id}_${Date.now()}`,
      type: "Status Change",
      timestamp: new Date().toISOString(),
      description: `Status changed to ${InvitationStatuses[newStatus].label}`,
      sentBy: "Admin",
    }

    const updatedInvitation = {
      ...invitation,
      status: newStatus,
      lastActivity: new Date().toISOString().split("T")[0],
    }

    setInvitation(updatedInvitation)
    setEvents([newEvent, ...events])
  }

  const handleResendInvitation = () => {
    if (!invitation || !editableContent) return

    const newEvent: Event = {
      id: `evt_${invitation.id}_${Date.now()}`,
      type: "Invitation Sent",
      timestamp: new Date().toISOString(),
      description: `Invitation resent with template: ${editableContent.title}`,
      sentBy: "Admin",
    }

    setEvents([newEvent, ...events])
  }

  const handleRevokeInvitation = () => {
    if (!invitation) return
    handleStatusChange("revoked")
  }

  const handleChangeStatusClick = () => {
    setIsModalOpen(true)
    setSelectedStatus(invitation?.status || "pending")
  }

  const handleSaveStatus = () => {
    if (selectedStatus) {
      handleStatusChange(selectedStatus)
      setIsModalOpen(false)
      setSelectedTemplate("")
    }
  }

  const getActor = (event: Event) => {
    return event.sentBy || "System"
  }

  if (!invitation) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Invitation not found</p>
      </div>
    )
  }

  return (
    <div className="px-6 py-6 lg:px-10">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-gray-500">Loading invitation details...</p>
        </div>
      ) : (
        <>
          <header className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-gray-900">
              {userInvitation?.username}
            </h1>
            <button
              onClick={() => router.push("/invitations")}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
          </header>

          <div className="space-y-6">
            {template && editableContent && (
              <InvitationCard
                editableContent={editableContent}
                isEditing={isEditing}
                sendPush={sendPush}
                addHistory={addHistory}
                onChangeStatus={handleChangeStatusClick}
                onResend={handleResendInvitation}
                onContentChange={handleContentChange}
                onSendPushChange={setSendPush}
                onAddHistoryChange={setAddHistory}
              />
            )}

            <div className="grid gap-6 lg:grid-cols-3">
              <ClientInfoCard invitation={userInvitation} />

              <StatusHistoryCard
                events={events}
                getActor={getActor}
                formatDate={formatDate}
              />
            </div>
          </div>
        </>
      )}

      <ChangeStatusModal
        isOpen={isModalOpen}
        selectedStatus={selectedStatus}
        selectedTemplate={selectedTemplate}
        sendPush={sendPush}
        addHistory={addHistory}
        templates={visaTemplatesMock}
        onClose={() => setIsModalOpen(false)}
        onStatusChange={setSelectedStatus}
        onTemplateChange={setSelectedTemplate}
        onSendPushChange={setSendPush}
        onAddHistoryChange={setAddHistory}
        onSave={handleSaveStatus}
      />
    </div>
  )
}
