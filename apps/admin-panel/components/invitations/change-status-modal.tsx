import { useState } from "react"
import type { InvitationStatus, TemplateRow } from "../../app/invitations/types"

interface ChangeStatusModalProps {
  isOpen: boolean
  selectedStatus: InvitationStatus | null
  selectedTemplate: string
  sendPush: boolean
  addHistory: boolean
  templates: TemplateRow[]
  onClose: () => void
  onStatusChange: (status: InvitationStatus) => void
  onTemplateChange: (templateId: string) => void
  onSendPushChange: (checked: boolean) => void
  onAddHistoryChange: (checked: boolean) => void
  onSave: () => void
}

export function ChangeStatusModal({
  isOpen,
  selectedStatus,
  selectedTemplate,
  sendPush,
  addHistory,
  templates,
  onClose,
  onStatusChange,
  onTemplateChange,
  onSendPushChange,
  onAddHistoryChange,
  onSave,
}: ChangeStatusModalProps) {
  const [addToBulletin, setAddToBulletin] = useState(false)
  const [isTemplateExpanded, setIsTemplateExpanded] = useState(true)

  if (!isOpen) return null

  const selectedTemplateData = templates.find((t) => t.id === selectedTemplate)

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900">Change User Status</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              ✕
            </button>
          </div>

          <div className="space-y-4 p-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                value={selectedStatus || ""}
                onChange={(e) => onStatusChange(e.target.value as InvitationStatus)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="pending">Pending</option>
                <option value="accepted">Subscription Accepted</option>
                <option value="revoked">Revoked</option>
                <option value="active">Active</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select a template...
              </label>
              <select
                value={selectedTemplate}
                onChange={(e) => onTemplateChange(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">-- Select a template --</option>
                {templates.map((tmpl) => (
                  <option key={tmpl.id} value={tmpl.id}>
                    {tmpl.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedTemplate && selectedTemplateData && (
              <div className="rounded-lg border border-gray-200 bg-white">
                <button
                  onClick={() => setIsTemplateExpanded(!isTemplateExpanded)}
                  className="flex w-full items-center justify-between p-4 text-left"
                >
                  <span className="font-medium text-gray-900">
                    {selectedTemplateData.name}
                  </span>
                  <span className="text-gray-400">{isTemplateExpanded ? "▲" : "▼"}</span>
                </button>

                {isTemplateExpanded && (
                  <div className="space-y-4 border-t border-gray-200 p-4">
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={sendPush}
                          onChange={(e) => onSendPushChange(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                        />
                        <span className="text-sm text-gray-700">
                          Send Push Notification
                        </span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={addHistory}
                          onChange={(e) => onAddHistoryChange(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                        />
                        <span className="text-sm text-gray-700">Add to History</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={addToBulletin}
                          onChange={(e) => setAddToBulletin(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                        />
                        <span className="text-sm text-gray-700">Add to Bulletin</span>
                      </label>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Title
                      </label>
                      <input
                        type="text"
                        value={selectedTemplateData.title}
                        readOnly
                        className="w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Body
                      </label>
                      <textarea
                        value={selectedTemplateData.body}
                        readOnly
                        rows={4}
                        className="w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-200 p-6">
            <button
              onClick={onClose}
              className="rounded-md border border-gray-300 px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              className="rounded-md bg-orange-500 px-6 py-2 text-sm font-medium text-white hover:bg-orange-600"
            >
              Change
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
