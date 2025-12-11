"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { visaTemplatesMock } from "../../../mock-data"
import type { TemplateRow } from "../../../invitations/types"

export default function TemplateEditPage() {
  const params = useParams()
  const router = useRouter()
  const id = Array.isArray(params.id) ? params.id[0] : params.id

  const [template, setTemplate] = useState<TemplateRow | null>(null)
  const [name, setName] = useState("")
  const [language, setLanguage] = useState("")
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [sendPush, setSendPush] = useState(true)
  const [addToHistory, setAddToHistory] = useState(true)
  const [action, setAction] = useState<string>("Open Deep Link")
  const [deepLinkScreen, setDeepLinkScreen] = useState<string>("Wallet")
  const [deepLinkAction, setDeepLinkAction] = useState<string>("None")

  useEffect(() => {
    const found = visaTemplatesMock.find((t) => t.id === id)
    if (found) {
      setTemplate(found)
      setName(found.name)
      setLanguage(found.language)
      setTitle(found.title)
      setBody(found.body)
      setSendPush(found.sendPush ?? true)
      setAddToHistory(found.addToHistory ?? true)
      setAction((found as any).action ?? "Open Deep Link")
      setDeepLinkScreen((found as any).deepLinkScreen ?? "Wallet")
      setDeepLinkAction((found as any).deepLinkAction ?? "None")
    }
  }, [id])

  useEffect(() => {
    document.body.classList.add("hide-sidebar")
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.classList.remove("hide-sidebar")
      document.body.style.overflow = prevOverflow || ""
    }
  }, [])

  if (!template) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="rounded-lg bg-white p-6">Template not found</div>
      </div>
    )
  }

  const handleSave = () => {
    // This is a mock: in a real app you'd call an API
    // For now just navigate back to templates list
    router.push("/templates")
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/60 p-0">
      <div className="w-full h-full overflow-auto bg-white">
        <div className="w-full border-b border-gray-100 bg-white px-6 py-5">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
            <h2 className="text-2xl font-semibold">Edit Template</h2>
            <button
              aria-label="Close"
              onClick={() => router.push("/templates")}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-6xl p-10">
          <div className="mt-2 grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Template Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-200 px-3 py-2"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Action</label>
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-200 px-3 py-2"
                >
                  <option>Open Deep Link</option>
                  <option>Open Browser</option>
                  <option>None</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Deep Link Screen
                </label>
                <select
                  value={deepLinkScreen}
                  onChange={(e) => setDeepLinkScreen(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-200 px-3 py-2"
                >
                  <option>People</option>
                  <option>Wallet</option>
                  <option>Transaction History</option>
                  <option>None</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Deep Link Action
                </label>
                <select
                  value={deepLinkAction}
                  onChange={(e) => setDeepLinkAction(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-200 px-3 py-2"
                >
                  <option>None</option>
                  <option>Open</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={sendPush}
                  onChange={(e) => setSendPush(e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                <span className="text-sm text-gray-700">Send Push Notification</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={addToHistory}
                  onChange={(e) => setAddToHistory(e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                <span className="text-sm text-gray-700">Add to History</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => {}}
                  className="h-4 w-4 rounded"
                />
                <span className="text-sm text-gray-700">Add to Bulletin</span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Language
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-200 px-3 py-2"
                >
                  <option>English</option>
                  <option>Spanish</option>
                  <option>Portuguese</option>
                  <option>French</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Icon</label>
                <select
                  className="mt-1 block w-full rounded-md border border-gray-200 px-3 py-2"
                  value={template.icon}
                  onChange={() => {}}
                >
                  <option value="star">★ Star</option>
                  <option value="check">✓ Check</option>
                  <option value="bell">🔔 Bell</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-200 px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Body</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                className="mt-1 block w-full rounded-md border border-gray-200 px-3 py-2"
              />
            </div>

            <div className="mt-6 flex items-center gap-4">
              <button
                onClick={handleSave}
                className="rounded-md bg-orange-500 px-4 py-2 text-white"
              >
                Update Template
              </button>
              <button
                onClick={() => router.push("/templates")}
                className="rounded-md border border-gray-200 px-4 py-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
