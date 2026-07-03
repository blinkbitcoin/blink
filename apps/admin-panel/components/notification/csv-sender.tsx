"use client"

import { useState } from "react"

import { NotificationContent } from "./builder"
import {
  filteredUserCount as gqlFilteredUserCount,
  triggerMarketingNotification,
} from "./notification-actions"
import { CHUNK_SIZE, ParseSummary, chunk, parseUserIdsCsv } from "./csv-parse"

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
  const [countError, setCountError] = useState<string | undefined>(undefined)

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
    setCountError(undefined)
    resetSendState()

    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const { userIds: valid, summary: parsed } = parseUserIdsCsv(text, file.name)
      setUserIds(valid)
      setSummary(parsed)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Could not read file")
    }
  }

  const getCount = async () => {
    if (userIds.length === 0) return
    setLoadingCount(true)
    setFilteredCount(null)
    setCountError(undefined)
    try {
      let total = 0
      for (const batch of chunk(userIds, CHUNK_SIZE)) {
        total += await gqlFilteredUserCount({ userIdsFilter: batch })
      }
      setFilteredCount(total)
    } catch (err) {
      setCountError(err instanceof Error ? err.message : "Could not fetch user count")
    } finally {
      setLoadingCount(false)
    }
  }

  const sendBatches = async (batches: string[][]) => {
    setSending(true)
    setDone(false)
    const newFailures: BatchFailure[] = []

    try {
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i]
        try {
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
            setNotifiedCount((prev) => prev + batch.length)
          } else {
            newFailures.push({
              userIds: batch,
              message: res.message ?? "Unknown error",
            })
          }
        } catch (err) {
          newFailures.push({
            userIds: batch,
            message: err instanceof Error ? err.message : "Request failed",
          })
        }
        setProgress({ sent: i + 1, total: batches.length })
      }
    } finally {
      setFailures(newFailures)
      setSending(false)
      setDone(true)
    }
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
          {countError && <p className="text-red-500">{countError}</p>}
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
          Batches sent: {progress.sent}/{progress.total} — {notifiedCount} ID(s) submitted
        </p>
      )}

      {done && failures.length === 0 && (
        <p className="text-green-500">
          All batches sent — {notifiedCount} ID(s) submitted. Only IDs matching an
          existing user are notified.
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
