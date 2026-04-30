import { translateToLedgerTx } from "./translate"

import { LedgerTransactionType } from "@/domain/ledger"
import { UnknownLedgerError } from "@/domain/ledger/errors"
import { WalletCurrency } from "@/domain/shared"
import { toObjectId } from "@/services/mongoose/utils"

const SETTLED_TRANSACTION_STREAM_BATCH_SIZE = 100
const DEFAULT_REPLAY_DEDUPE_CACHE_SIZE = 10_000
const LIABILITIES_ACCOUNT_PATTERN = /^Liabilities:/
const EXCLUDED_SETTLED_TRANSACTION_TYPES: LedgerTransactionType[] = [
  LedgerTransactionType.Fee,
  LedgerTransactionType.ToColdStorage,
  LedgerTransactionType.ToHotWallet,
  LedgerTransactionType.Escrow,
  LedgerTransactionType.RoutingRevenue,
  LedgerTransactionType.Reconciliation,
]
const SETTLED_TRANSACTION_CHANGE_OPERATIONS = ["insert", "replace", "update"]
const SETTLED_TRANSACTION_CHANGE_OPERATION_MATCH = [
  { operationType: { $in: ["insert", "replace"] } },
  { "updateDescription.updatedFields.pending": false },
]

type TransactionCursor = AsyncIterable<ILedgerTransaction> & {
  close: () => Promise<unknown>
}

type TransactionFindQuery = {
  sort: (sort: Record<string, 1 | -1>) => {
    cursor: (options: { batchSize: number }) => TransactionCursor
  }
}

type TransactionChangeStream = {
  next: () => Promise<unknown>
  close: () => Promise<unknown>
}

type SettledTransactionModel = {
  find: (filter: Record<string, unknown>) => TransactionFindQuery
  watch: (
    pipeline: Record<string, unknown>[],
    options: { fullDocument: "updateLookup" },
  ) => TransactionChangeStream
}

type StreamSettledTransactionsConfig = {
  transactionModel: SettledTransactionModel
  translateLedgerTransaction?: (
    tx: ILedgerTransaction,
  ) => LedgerTransaction<WalletCurrency>
  maxReplayDedupeCacheSize?: number
}

export const settledTransactionFilter = (
  afterTransactionId?: LedgerTransactionId,
): Record<string, unknown> => {
  const filter: Record<string, unknown> = {
    accounts: LIABILITIES_ACCOUNT_PATTERN,
    pending: false,
    voided: { $ne: true },
    type: { $nin: EXCLUDED_SETTLED_TRANSACTION_TYPES },
  }

  if (afterTransactionId) {
    filter._id = { $gt: toObjectId<LedgerTransactionId>(afterTransactionId) }
  }

  return filter
}

export const settledTransactionChangeStreamPipeline = (
  afterTransactionId?: LedgerTransactionId,
): Record<string, unknown>[] => {
  const match: Record<string, unknown> = {
    "operationType": { $in: SETTLED_TRANSACTION_CHANGE_OPERATIONS },
    "$or": SETTLED_TRANSACTION_CHANGE_OPERATION_MATCH,
    "fullDocument.accounts": LIABILITIES_ACCOUNT_PATTERN,
    "fullDocument.pending": false,
    "fullDocument.voided": { $ne: true },
    "fullDocument.type": { $nin: EXCLUDED_SETTLED_TRANSACTION_TYPES },
  }

  if (afterTransactionId) {
    match["fullDocument._id"] = {
      $gt: toObjectId<LedgerTransactionId>(afterTransactionId),
    }
  }

  return [{ $match: match }]
}

export const createStreamSettledTransactions = ({
  transactionModel,
  translateLedgerTransaction = translateToLedgerTx,
  maxReplayDedupeCacheSize = DEFAULT_REPLAY_DEDUPE_CACHE_SIZE,
}: StreamSettledTransactionsConfig) => {
  async function* streamSettledTransactions({
    afterTransactionId,
    signal,
  }: StreamSettledTransactionsArgs = {}): AsyncGenerator<
    LedgerTransaction<WalletCurrency> | LedgerError
  > {
    const replayedTransactionIds = new Set<LedgerTransactionId>()
    const trackReplayedTransactionId = (id: LedgerTransactionId) => {
      if (maxReplayDedupeCacheSize <= 0) return

      replayedTransactionIds.delete(id)
      replayedTransactionIds.add(id)

      if (replayedTransactionIds.size <= maxReplayDedupeCacheSize) return

      const oldestReplayedTransactionId = replayedTransactionIds.values().next().value
      if (oldestReplayedTransactionId) {
        replayedTransactionIds.delete(oldestReplayedTransactionId)
      }
    }
    const changeStream = transactionModel.watch(
      settledTransactionChangeStreamPipeline(afterTransactionId),
      { fullDocument: "updateLookup" },
    )

    const closeChangeStream = () => {
      changeStream.close().catch(() => undefined)
    }

    signal?.addEventListener("abort", closeChangeStream, { once: true })

    const waitForNextChange = () =>
      changeStream.next().then(
        (change) => ({ change }),
        (err: unknown) => ({ err }),
      )

    let nextChange = waitForNextChange()

    try {
      if (afterTransactionId) {
        const cursor = transactionModel
          .find(settledTransactionFilter(afterTransactionId))
          .sort({ _id: 1 })
          .cursor({ batchSize: SETTLED_TRANSACTION_STREAM_BATCH_SIZE })

        const closeCursor = () => {
          cursor.close().catch(() => undefined)
        }

        signal?.addEventListener("abort", closeCursor, { once: true })

        try {
          for await (const tx of cursor) {
            if (signal?.aborted) return

            const ledgerTx = translateLedgerTransaction(tx)
            trackReplayedTransactionId(ledgerTx.id)
            yield ledgerTx
          }
        } finally {
          signal?.removeEventListener("abort", closeCursor)
          await cursor.close().catch(() => undefined)
        }
      }

      while (!signal?.aborted) {
        const changeResult = await nextChange
        nextChange = waitForNextChange()
        if ("err" in changeResult) throw changeResult.err

        const tx = (changeResult.change as { fullDocument?: ILedgerTransaction })
          .fullDocument
        if (!tx) continue

        const ledgerTx = translateLedgerTransaction(tx)
        if (replayedTransactionIds.delete(ledgerTx.id)) continue

        yield ledgerTx
      }
    } catch (err) {
      if (signal?.aborted) return

      yield new UnknownLedgerError(err)
    } finally {
      signal?.removeEventListener("abort", closeChangeStream)
      await changeStream.close().catch(() => undefined)
    }
  }

  return streamSettledTransactions
}
