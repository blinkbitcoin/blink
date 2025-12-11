import { EditableContent } from "../../app/invitations/types"

interface InvitationCardProps {
  editableContent: EditableContent
  isEditing: boolean
  sendPush: boolean
  addHistory: boolean
  onChangeStatus: () => void
  onResend: () => void
  onContentChange: (field: "title" | "body", value: string) => void
  onSendPushChange: (checked: boolean) => void
  onAddHistoryChange: (checked: boolean) => void
}

export function InvitationCard({
  editableContent,
  isEditing,
  sendPush,
  addHistory,
  onChangeStatus,
  onResend,
  onContentChange,
  onSendPushChange,
  onAddHistoryChange,
}: InvitationCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Invitation Sent</h2>
        <div className="flex gap-2">
          <button
            onClick={onChangeStatus}
            className="rounded-md border border-blue-300 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
          >
            Change Status
          </button>
          <button
            onClick={onResend}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Resend Invitation
          </button>
          <button className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            ⋮
          </button>
        </div>
      </div>

      <div className="flex items-start gap-4 rounded-lg bg-gray-50 p-4">
        <div className="text-2xl">⭐</div>
        <div>
          <p className="font-semibold text-gray-900">{editableContent?.title}</p>
          <p className="text-sm text-gray-600">{editableContent?.body}</p>
        </div>
      </div>

      {isEditing && (
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Title</label>
            <input
              type="text"
              value={editableContent?.title || ""}
              onChange={(e) => onContentChange("title", e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Body</label>
            <textarea
              value={editableContent?.body || ""}
              onChange={(e) => onContentChange("body", e.target.value)}
              rows={4}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={sendPush}
                onChange={(e) => onSendPushChange(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">Send Push Notification</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={addHistory}
                onChange={(e) => onAddHistoryChange(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">Add to History</span>
            </label>
          </div>
        </div>
      )}
    </div>
  )
}
