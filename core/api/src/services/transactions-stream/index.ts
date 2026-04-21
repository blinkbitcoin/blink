import mongoose from "mongoose"

import {
  createTransactionStreamEventMapper,
  SETTLED_TRANSACTION_FILTER,
  TransactionStreamRecord,
} from "./helpers"

import { TRANSACTIONS_GRPC_STREAM_POLL_INTERVAL_MS } from "@/config"
import { checkedToLedgerTransactionId } from "@/domain/ledger"

import { Transaction } from "@/services/ledger/schema"
import { baseLogger } from "@/services/logger"

const logger = baseLogger.child({ module: "transactions-stream" })

const DEFAULT_BATCH_SIZE = 100

const TRANSACTION_STREAM_PROJECTION = {
  _id: 1,
  accounts: 1,
  hash: 1,
  type: 1,
  pending: 1,
  currency: 1,
  satsAmount: 1,
  centsAmount: 1,
  credit: 1,
  datetime: 1,
  timestamp: 1,
} as const

const toError = (err: unknown, fallbackMessage: string): Error => {
  if (err instanceof Error) return err
  return new Error(fallbackMessage)
}

export type TransactionStreamQueries = {
  listSettledTransactionsAfter: (args: {
    afterTransactionId: LedgerTransactionId
    limit: number
  }) => Promise<TransactionStreamRecord[]>
  findLatestTransactionId: () => Promise<LedgerTransactionId | undefined>
}

type SubscribeToTransactionsArgs = {
  afterTransactionId?: string
  onTransaction: (event: TransactionStreamEvent) => void | Promise<void>
  onError: (err: Error) => void
}

export type TransactionsStreamSubscription = {
  close: () => void
}

type TransactionsStreamServiceConfig = {
  batchSize?: number
  pollIntervalMs?: number
  transactionQueries?: TransactionStreamQueries
  mapTransactionStreamEvent?: (
    ledgerTransaction: TransactionStreamRecord,
  ) => Promise<TransactionStreamEvent | undefined>
  logger?: Logger
}

export const createTransactionStreamQueries = (): TransactionStreamQueries => {
  const listSettledTransactionsAfter = async ({
    afterTransactionId,
    limit,
  }: {
    afterTransactionId: LedgerTransactionId
    limit: number
  }): Promise<TransactionStreamRecord[]> => {
    return (await Transaction.find(
      {
        _id: { $gt: new mongoose.Types.ObjectId(afterTransactionId) },
        ...SETTLED_TRANSACTION_FILTER,
      },
      TRANSACTION_STREAM_PROJECTION,
    )
      .sort({ _id: 1 })
      .limit(limit)
      .lean()) as TransactionStreamRecord[]
  }

  const findLatestTransactionId = async (): Promise<LedgerTransactionId | undefined> => {
    const latest = (await Transaction.findOne({}, { _id: 1 })
      .sort({ _id: -1 })
      .lean()) as { _id?: ObjectId } | null

    return latest?._id?.toString() as LedgerTransactionId | undefined
  }

  return {
    listSettledTransactionsAfter,
    findLatestTransactionId,
  }
}

const parseAfterTransactionId = (
  afterTransactionId?: string,
): LedgerTransactionId | Error | undefined => {
  if (!afterTransactionId) return undefined

  const checkedLedgerTransactionId = checkedToLedgerTransactionId(afterTransactionId)
  if (checkedLedgerTransactionId instanceof Error) return checkedLedgerTransactionId

  return checkedLedgerTransactionId
}

export const TransactionsStreamService = ({
  batchSize = DEFAULT_BATCH_SIZE,
  pollIntervalMs = TRANSACTIONS_GRPC_STREAM_POLL_INTERVAL_MS,
  transactionQueries = createTransactionStreamQueries(),
  mapTransactionStreamEvent = createTransactionStreamEventMapper()
    .mapTransactionStreamEvent,
  logger: serviceLogger = logger,
}: TransactionsStreamServiceConfig = {}) => {
  const subscribeToTransactions = ({
    afterTransactionId,
    onTransaction,
    onError,
  }: SubscribeToTransactionsArgs): TransactionsStreamSubscription | Error => {
    const parsedCursor = parseAfterTransactionId(afterTransactionId)
    if (parsedCursor instanceof Error) return parsedCursor

    let cursor = parsedCursor
    let isClosed = false
    let pollInFlight = false
    let interval: NodeJS.Timeout | undefined

    const cleanup = () => {
      if (interval) clearInterval(interval)
      interval = undefined
      isClosed = true
    }

    const streamTransactions = async () => {
      if (!cursor) return

      while (!isClosed) {
        const ledgerTransactions = await transactionQueries.listSettledTransactionsAfter({
          afterTransactionId: cursor,
          limit: batchSize,
        })

        if (ledgerTransactions.length === 0) return

        for (const ledgerTransaction of ledgerTransactions) {
          cursor = ledgerTransaction._id.toString() as LedgerTransactionId
          const event = await mapTransactionStreamEvent(ledgerTransaction)

          if (event && !isClosed) await onTransaction(event)
        }

        if (ledgerTransactions.length < batchSize) return
      }
    }

    const poll = async () => {
      if (pollInFlight || isClosed) return

      pollInFlight = true
      try {
        await streamTransactions()
      } catch (err) {
        const error = toError(err, "Failed to stream transactions")
        serviceLogger.error({ err: error }, "Failed to stream transactions")
        cleanup()
        onError(error)
      } finally {
        pollInFlight = false
      }
    }

    const startPolling = () => {
      interval = setInterval(() => {
        poll().catch((err) => {
          const error = toError(err, "Failed to stream transactions")
          serviceLogger.error({ err: error }, "Failed to stream transactions")
          cleanup()
          onError(error)
        })
      }, pollIntervalMs)
    }

    ;(async () => {
      if (cursor) await streamTransactions()
      if (!cursor) {
        cursor =
          (await transactionQueries.findLatestTransactionId()) ??
          (new mongoose.Types.ObjectId().toString() as LedgerTransactionId)
      }
      if (!isClosed) startPolling()
    })().catch((err) => {
      const error = toError(err, "Failed to initialize transaction stream")
      serviceLogger.error({ err: error }, "Failed to initialize transaction stream")
      cleanup()
      onError(error)
    })

    return {
      close: cleanup,
    }
  }

  return { subscribeToTransactions }
}
