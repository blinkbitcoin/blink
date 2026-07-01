"use client"

import { useState } from "react"

import { NotificationContent } from "./builder"
import {
  filteredUserCount as gqlFilteredUserCount,
  triggerMarketingNotification,
} from "./notification-actions"

// blink-core validates every userId against KratosUserIdRegex (= UuidRegex,
// core/api/src/domain/shared/validation.ts). We mirror it here and drop bad rows
// client-side: the mutation rejects the ENTIRE batch on the first invalid id, so
// a stray header line or blank cell would otherwise fail a whole 1,000-user batch.
const USER_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// The admin GraphQL API parses request bodies with express.json()'s default
// 100 kB limit. A userId is ~40 bytes inside the JSON array, so we keep each
// mutation call to CHUNK_SIZE ids (well under the limit, leaving room for the
// notification content payload) and loop over the batches.
const CHUNK_SIZE = 1000

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size))
  }
  return out
}

type ParseSummary = {
  fileName: string
  totalRows: number
  validUnique: number
  duplicates: number
  invalid: number
}

type BatchFailure = {
  userIds: string[]
  message: string
}

type NotificationCsvSenderArgs = {
  notification: NotificationContent
}

const NotificationCsvSender = ({ notification }: NotificationCsvSenderArgs) => {
  const [userIds, setUserIds] = useState<string[]>([])
  const [summary, setSummary] = useState<ParseSummary | null>(null)
  const [parseError, setParseError] = useState<string | undefined>(undefined)

  const [filteredCount, setFilteredCount] = useState<number | null>(null)
  const [loadingCount, setLoadingCount] = useState(false)

  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null)
  const [notifiedCount, setNotifiedCount] = useState(0)
  const [failures, setFailures] = useState<BatchFailure[]>([])
  const [done, setDone] = useState(false)

  const resetSendState = () => {
    setProgress(null)
    setNotifiedCount(0)
    setFailures([])
    setDone(false)
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setParseError(undefined)
    setSummary(null)
    setUserIds([])
    setFilteredCount(null)
    resetSendState()

    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      // Split on commas, semicolons and any whitespace so a one-per-line list, a
      // single CSV column, or a comma-separated row all work. Strip wrapping quotes.
      const tokens = text
        .split(/[\s,;]+/)
        .map((token) => token.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean)

      const seen = new Set<string>()
      const valid: string[] = []
      let duplicates = 0
      let invalid = 0

      for (const token of tokens) {
        if (!USER_ID_REGEX.test(token)) {
          invalid++
          continue
        }
        if (seen.has(token)) {
          duplicates++
          continue
        }
        seen.add(token)
        valid.push(token)
      }

      setUserIds(valid)
      setSummary({
        fileName: file.name,
        totalRows: tokens.length,
        validUnique: valid.length,
        duplicates,
        invalid,
      })
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Could not read file")
    }
  }

  const getCount = async () => {
    if (userIds.length === 0) return
    setLoadingCount(true)
    setFilteredCount(null)
    try {
      // filteredUserCount rides the same 100 kB body limit, so count per chunk and
      // sum — the ids are distinct, so per-chunk counts add up without overlap.
      let total = 0
      for (const batch of chunk(userIds, CHUNK_SIZE)) {
        total += await gqlFilteredUserCount({ userIdsFilter: batch })
      }
      setFilteredCount(total)
    } finally {
      setLoadingCount(false)
    }
  }

  const sendBatches = async (batches: string[][]) => {
    setSending(true)
    setDone(false)
    const newFailures: BatchFailure[] = []

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]
      const res = await triggerMarketingNotification({
        userIdsFilter: batch,
        openDeepLink: notification.openDeepLink,
        openExternalUrl: notification.openExternalUrl,
        icon: notification.icon,
        shouldSendPush: notification.shouldSendPush,
        shouldAddToHistory: notification.shouldAddToHistory,
        shouldAddToBulletin: notification.shouldAddToBulletin,
        localizedNotificationContents: notification.localizedNotificationContents,
      })
      if (res.success) {
        // Accumulate with a functional update so a fresh send (after
        // resetSendState sets it to 0) and a retry (which adds on top of the
        // already-notified total) both stay correct regardless of render timing.
        setNotifiedCount((prev) => prev + batch.length)
      } else {
        newFailures.push({
          userIds: batch,
          message: res.message ?? "Unknown error",
        })
      }
      setProgress({ sent: i + 1, total: batches.length })
    }

    setFailures(newFailures)
    setSending(false)
    setDone(true)
  }

  const onSend = async () => {
    if (userIds.length === 0) return
    const batchCount = Math.ceil(userIds.length / CHUNK_SIZE)
    const confirmed = window.confirm(
      `Send this notification to ${userIds.length} user(s) across ${batchCount} batch(es)?`,
    )
    if (!confirmed) return
    resetSendState()
    await sendBatches(chunk(userIds, CHUNK_SIZE))
  }

  const onRetryFailed = async () => {
    if (failures.length === 0) return
    const retryBatches = failures.map((failure) => failure.userIds)
    setFailures([])
    await sendBatches(retryBatches)
  }

  const notFoundCount = filteredCount !== null ? userIds.length - filteredCount : 0
  const failedUserCount = failures.reduce(
    (total, failure) => total + failure.userIds.length,
    0,
  )

  return (
    <div className="rounded bg-white mt-6 p-6 space-y-4 flex-1 max-w-lg">
      <h2>Send From CSV (User IDs)</h2>
      <p className="text-sm text-gray-500">
        Upload a CSV/TXT of user IDs (one per line or comma-separated). Rows are deduped
        and validated, then sent in batches of {CHUNK_SIZE} to stay under the admin API
        request-size limit.
      </p>
      <input
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        onChange={onFile}
        disabled={sending}
      />
      {parseError && <p className="text-red-500">{parseError}</p>}

      {summary && (
        <div className="border border-2 p-4 rounded text-sm space-y-1">
          <p>File: {summary.fileName}</p>
          <p>Rows parsed: {summary.totalRows}</p>
          <p className="font-semibold">Valid unique user IDs: {summary.validUnique}</p>
          {summary.duplicates > 0 && <p>Duplicates removed: {summary.duplicates}</p>}
          {summary.invalid > 0 && (
            <p className="text-orange-600">Invalid rows skipped: {summary.invalid}</p>
          )}
        </div>
      )}

      {userIds.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={getCount}
            disabled={loadingCount || sending}
            className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            Get user notification count
          </button>
          {loadingCount && <p>Loading...</p>}
          {filteredCount !== null && (
            <p>
              Users that exist for these IDs: {filteredCount}
              {notFoundCount > 0 && (
                <span className="text-orange-600"> ({notFoundCount} not found)</span>
              )}
            </p>
          )}
        </div>
      )}

      {userIds.length > 0 && (
        <button
          onClick={onSend}
          disabled={sending}
          className="bg-blue-500 text-white px-4 py-2 rounded block w-full disabled:opacity-50"
        >
          Send to {userIds.length} user(s)
        </button>
      )}

      {progress && (
        <p>
          Batches sent: {progress.sent}/{progress.total} — notified {notifiedCount}{" "}
          user(s)
        </p>
      )}

      {done && failures.length === 0 && (
        <p className="text-green-500">
          All batches sent — {notifiedCount} user(s) notified.
        </p>
      )}

      {done && failures.length > 0 && (
        <div className="space-y-2">
          <p className="text-red-500">
            {failures.length} batch(es) failed ({failedUserCount} user(s) not notified).
            First error: {failures[0].message}
          </p>
          <button
            onClick={onRetryFailed}
            disabled={sending}
            className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            Retry failed batches
          </button>
        </div>
      )}
    </div>
  )
}

export default NotificationCsvSender
