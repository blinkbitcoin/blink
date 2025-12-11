"use client"

import { useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"

import { visaTemplatesMock } from "../mock-data"
import { Button } from "../../components/shared/button"
import { Pagination } from "../../components/shared/pagination"
import { TemplateIcon, TemplateRow } from "../invitations/types"

export default function TemplatesPage() {
  const router = useRouter()
  const [pageItems, setPageItems] = useState<TemplateRow[]>(visaTemplatesMock.slice(0, 0))
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createAction, setCreateAction] = useState<string>("Open Deep Link")
  const [createDeepLinkScreen, setCreateDeepLinkScreen] = useState<string>("Wallet")
  const [createDeepLinkAction, setCreateDeepLinkAction] = useState<string>("None")
  const [createLanguage, setCreateLanguage] = useState<string>("English")

  useEffect(() => {
    if (isCreateOpen) {
      document.body.classList.add("hide-sidebar")
      const prev = document.body.style.overflow
      document.body.style.overflow = "hidden"
      return () => {
        document.body.classList.remove("hide-sidebar")
        document.body.style.overflow = prev || ""
      }
    }
    return
  }, [isCreateOpen])

  const handlePageChange = useCallback(
    ({ offset, limit }: { offset: number; limit: number }) => {
      setPageItems(visaTemplatesMock.slice(offset, offset + limit))
    },
    [],
  )

  return (
    <div className="px-6 py-6 lg:px-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Templates</h1>
        <Button onClick={() => setIsCreateOpen(true)}>
          <span className="mr-2">＋</span>
          <span>Create New Template</span>
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4 text-sm font-medium text-gray-900">
          Existing Templates
        </div>
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left font-medium text-gray-500">Name</th>
              <th className="px-6 py-3 text-left font-medium text-gray-500">Language</th>
              <th className="px-6 py-3 text-left font-medium text-gray-500">Icon</th>
              <th className="px-6 py-3 text-left font-medium text-gray-500">Content</th>
              <th className="px-6 py-3 text-left font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {pageItems.map((template) => (
              <tr key={template.id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-6 py-4 text-gray-900">
                  {template.name}
                </td>
                <td className="px-6 py-4 text-gray-700">{template.language}</td>
                <td className="px-6 py-4 text-gray-700">
                  {template.icon === TemplateIcon.Star ? (
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 text-yellow-500">
                      ★
                    </span>
                  ) : (
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 text-green-600">
                      ✓
                    </span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm">
                    <div className="font-semibold text-gray-900">{template.title}</div>
                    <div className="mt-1 text-gray-600">{template.body}</div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline-blue"
                      onClick={() => router.push(`/templates/${template.id}/edit`)}
                    >
                      Edit
                    </Button>
                    <Button variant="outline-red">Delete</Button>
                  </div>
                </td>
              </tr>
            ))}
            {pageItems.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                  No templates found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination totalItems={visaTemplatesMock.length} onPageChange={handlePageChange} />

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/60 p-0">
          <div className="w-full h-full overflow-auto bg-white">
            <div className="w-full border-b border-gray-100 bg-white px-6 py-5">
              <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
                <h2 className="text-2xl font-semibold">Create New Template</h2>
                <button
                  aria-label="Close"
                  onClick={() => setIsCreateOpen(false)}
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
                    placeholder="e.g., Weekly Digest"
                    className="mt-1 block w-full rounded-md border border-gray-200 px-3 py-2"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Action
                    </label>
                    <select
                      value={createAction}
                      onChange={(e) => setCreateAction(e.target.value)}
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
                      value={createDeepLinkScreen}
                      onChange={(e) => setCreateDeepLinkScreen(e.target.value)}
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
                      value={createDeepLinkAction}
                      onChange={(e) => setCreateDeepLinkAction(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-gray-200 px-3 py-2"
                    >
                      <option>None</option>
                      <option>Open</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked className="h-4 w-4 rounded" />
                    <span className="text-sm text-gray-700">Send Push Notification</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked className="h-4 w-4 rounded" />
                    <span className="text-sm text-gray-700">Add to History</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="h-4 w-4 rounded" />
                    <span className="text-sm text-gray-700">Add to Bulletin</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Language
                    </label>
                    <select
                      value={createLanguage}
                      onChange={(e) => setCreateLanguage(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-gray-200 px-3 py-2"
                    >
                      <option>English</option>
                      <option>Spanish</option>
                      <option>Portuguese</option>
                      <option>French</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Icon
                    </label>
                    <select className="mt-1 block w-full rounded-md border border-gray-200 px-3 py-2">
                      <option value="star">★ Star</option>
                      <option value="check">✓ Check</option>
                      <option value="bell">🔔 Bell</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Title</label>
                  <input
                    placeholder="Enter title..."
                    className="mt-1 block w-full rounded-md border border-gray-200 px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Body</label>
                  <textarea
                    placeholder="Enter body content..."
                    rows={5}
                    className="mt-1 block w-full rounded-md border border-gray-200 px-3 py-2"
                  />
                </div>

                <div className="mt-6 flex items-center gap-4">
                  <button
                    onClick={() => {
                      setIsCreateOpen(false)
                      router.push("/templates")
                    }}
                    className="rounded-md bg-orange-500 px-4 py-2 text-white"
                  >
                    Save Template
                  </button>
                  <button
                    onClick={() => setIsCreateOpen(false)}
                    className="rounded-md border border-gray-200 px-4 py-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
