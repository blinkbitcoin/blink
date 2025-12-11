"use client"

import { useEffect, useState } from "react"

import { PaginationProps } from "./types"

export const DEFAULT_PAGE_SIZE = 25

export function Pagination({
  totalItems,
  pageSize,
  resetKey,
  onPageChange,
}: PaginationProps) {
  const [page, setPage] = useState(1)

  const effectivePageSize = pageSize ?? DEFAULT_PAGE_SIZE
  const totalPages = Math.max(1, Math.ceil(totalItems / effectivePageSize))

  useEffect(() => {
    setPage(1)
  }, [resetKey, totalItems, effectivePageSize])

  useEffect(() => {
    const safePage = Math.min(page, totalPages)
    if (safePage !== page) {
      setPage(safePage)
      return
    }

    const offset = (safePage - 1) * effectivePageSize
    const limit = effectivePageSize

    onPageChange({
      page: safePage,
      pageSize: effectivePageSize,
      offset,
      limit,
      totalPages,
      totalItems,
    })
  }, [page, totalPages, effectivePageSize, totalItems, onPageChange])

  const handlePreviousClick = () => {
    setPage((prev) => (prev > 1 ? prev - 1 : prev))
  }

  const handleNextClick = () => {
    setPage((prev) => (prev < totalPages ? prev + 1 : prev))
  }

  return (
    <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
      <div>
        Page {page} of {totalPages}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={handlePreviousClick}
          disabled={page === 1}
        >
          Previous
        </button>
        <button
          type="button"
          className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={handleNextClick}
          disabled={page === totalPages}
        >
          Next
        </button>
      </div>
    </div>
  )
}
