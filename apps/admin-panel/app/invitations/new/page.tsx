"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { notificationContentMock } from "../../mock-data"
import { Button } from "../../../components/shared/button"
import {
  userIdByUsername,
  triggerMarketingNotification,
} from "../../../components/notification/notification-actions"

import {
  TextInput,
  SelectInput,
  TextArea,
  Checkbox,
} from "../../../components/shared/form-controls"

import { FormState, SubmitState } from "../types"
import { SaveInvitation } from "./save-invitation"

export default function NewInvitationPage() {
  const router = useRouter()

  const [formState, setFormState] = useState<FormState>({
    userQuery: "",
    templateId: "",
    title: "",
    body: "",
    sendPush: true,
    addHistory: true,
    addBulletin: true,
  })

  const [submitState, setSubmitState] = useState<SubmitState>({
    loading: false,
    success: false,
    error: undefined,
  })

  const selectedTemplate = useMemo(
    () =>
      notificationContentMock.find((template) => template.id === formState.templateId),
    [formState.templateId],
  )

  const invitationTemplate = useMemo(() => {
    if (!selectedTemplate) return undefined
    return {
      ...selectedTemplate,
      localizedNotificationContents: [
        {
          ...selectedTemplate.localizedNotificationContents[0],
          title: formState.title,
          body: formState.body,
        },
      ],
      shouldSendPush: formState.sendPush,
      shouldAddToHistory: formState.addHistory,
      shouldAddToBulletin: formState.addBulletin,
    }
  }, [
    selectedTemplate,
    formState.title,
    formState.body,
    formState.sendPush,
    formState.addHistory,
    formState.addBulletin,
  ])

  useEffect(() => {
    if (!selectedTemplate) {
      setFormState((prev) => ({ ...prev, title: "", body: "" }))
      return
    }

    const firstContent = selectedTemplate.localizedNotificationContents[0]
    setFormState((prev) => ({
      ...prev,
      title: firstContent?.title || "",
      body: firstContent?.body || "",
      sendPush: selectedTemplate.shouldSendPush,
      addHistory: selectedTemplate.shouldAddToHistory,
      addBulletin: selectedTemplate.shouldAddToBulletin,
    }))
  }, [selectedTemplate])

  const canSend = useMemo(
    () => Boolean(formState.userQuery.trim() && formState.templateId),
    [formState.userQuery, formState.templateId],
  )

  const InvitationSender = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!canSend) return

    setSubmitState({ loading: true, success: false, error: undefined })

    try {
      const userIdRes = await userIdByUsername(formState.userQuery)

      if (userIdRes.userId === undefined) {
        setSubmitState({
          loading: false,
          success: false,
          error: userIdRes.message || "User not found",
        })
        return
      }

      if (!invitationTemplate) {
        setSubmitState({
          loading: false,
          success: false,
          error: "Invitation template is not selected.",
        })
        return
      }

      const res = await triggerMarketingNotification({
        userIdsFilter: [userIdRes.userId],
        openDeepLink: invitationTemplate.openDeepLink,
        openExternalUrl: invitationTemplate.openExternalUrl,
        icon: invitationTemplate.icon,
        shouldSendPush: invitationTemplate.shouldSendPush,
        shouldAddToBulletin: invitationTemplate.shouldAddToBulletin,
        shouldAddToHistory: invitationTemplate.shouldAddToHistory,
        localizedNotificationContents: invitationTemplate.localizedNotificationContents,
      })

      if (res.success) {
        setSubmitState({
          loading: false,
          success: true,
          error: undefined,
        })
        await SaveInvitation({
          sentBy: "admin", // Should be username from session user
          username: formState.userQuery,
          status: "pending",
        })

        return
      } else {
        setSubmitState({
          loading: false,
          success: false,
          error: res.message || "Failed to send invitation.",
        })
      }
    } catch (error) {
      setSubmitState({
        loading: false,
        success: false,
        error: "Error sending invitation.",
      })
    }
  }

  const updateFormField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setFormState((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="px-6 py-6 lg:px-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Send Invitation</h1>
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 text-gray-500 hover:bg-gray-50"
        >
          ✕
        </button>
      </div>

      <div className="mx-auto max-w-2xl space-y-6">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-medium text-gray-900">Invite User</h2>
          <div className="relative">
            <TextInput
              id="user-search"
              type="text"
              placeholder="Search or add a username or email"
              value={formState.userQuery}
              onChange={(event) => updateFormField("userQuery", event.target.value)}
            />
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-medium text-gray-900">Template</h2>
          </div>
          <div className="mb-4">
            <label
              htmlFor="template"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Choose template
            </label>
            <SelectInput
              id="template"
              value={formState.templateId}
              onChange={(event) => updateFormField("templateId", event.target.value)}
            >
              <option value="">Select a template</option>
              {notificationContentMock.map((template) => {
                const firstContent = template.localizedNotificationContents[0]
                return (
                  <option key={template.id} value={template.id}>
                    {firstContent?.title} ({firstContent?.language})
                  </option>
                )
              })}
            </SelectInput>
          </div>
          {formState.templateId && (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="title"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Title
                </label>
                <TextInput
                  id="title"
                  type="text"
                  value={formState.title}
                  onChange={(event) => updateFormField("title", event.target.value)}
                />
              </div>
              <div>
                <label
                  htmlFor="body"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Content
                </label>
                <TextArea
                  id="body"
                  rows={4}
                  value={formState.body}
                  onChange={(event) => updateFormField("body", event.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-4 pt-1 text-sm text-gray-800">
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={formState.sendPush}
                    onChange={(event) =>
                      updateFormField("sendPush", event.target.checked)
                    }
                  />
                  <span>Send Push Notification</span>
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={formState.addHistory}
                    onChange={(event) =>
                      updateFormField("addHistory", event.target.checked)
                    }
                  />
                  <span>Add to History</span>
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={formState.addBulletin}
                    onChange={(event) =>
                      updateFormField("addBulletin", event.target.checked)
                    }
                  />
                  <span>Add to Bulletin</span>
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-start">
          <Button onClick={InvitationSender} disabled={!canSend}>
            <span className="mr-2">➤</span>
            <span>Send Invite</span>
          </Button>
        </div>
        {submitState.loading && <p>Sending...</p>}
        {submitState.error && <p className="text-red-500">{submitState.error}</p>}
        {submitState.success && (
          <p className="text-green-500">Notification sent successfully</p>
        )}
      </div>
    </div>
  )
}
