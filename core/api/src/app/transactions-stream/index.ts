import { createTransactionStreamEventMapper } from "./helpers"

import { checkedToLedgerTransactionId } from "@/domain/ledger"

import { LedgerService } from "@/services/ledger"
import { baseLogger } from "@/services/logger"

const logger = baseLogger.child({ module: "transactions-stream" })

const toError = (err: unknown, fallbackMessage: string): Error => {
  if (err instanceof Error) return err
  return new Error(fallbackMessage)
}

const parseAfterTransactionId = (
  afterTransactionId?: string,
): LedgerTransactionId | Error | undefined => {
  if (afterTransactionId === undefined) return undefined

  const checkedLedgerTransactionId = checkedToLedgerTransactionId(afterTransactionId)
  if (checkedLedgerTransactionId instanceof Error) return checkedLedgerTransactionId

  return checkedLedgerTransactionId
}

export const TransactionsStream = ({
  ledgerService = LedgerService(),
  mapTransactionStreamEvent = createTransactionStreamEventMapper()
    .mapTransactionStreamEvent,
  logger: serviceLogger = logger,
}: TransactionsStreamConfig = {}) => {
  const subscribeToTransactions = ({
    afterTransactionId,
    onTransaction,
    onError,
  }: SubscribeToTransactionsArgs): TransactionsStreamSubscription | Error => {
    const parsedCursor = parseAfterTransactionId(afterTransactionId)
    if (parsedCursor instanceof Error) return parsedCursor

    let isClosed = false
    const abortController = new AbortController()
    const ledgerTransactions = ledgerService.streamSettledTransactions({
      afterTransactionId: parsedCursor,
      signal: abortController.signal,
    })

    const cleanup = () => {
      if (isClosed) return
      isClosed = true
      abortController.abort()
      ledgerTransactions.return(undefined).catch(() => undefined)
    }

    const streamTransactions = async () => {
      for await (const ledgerTransaction of ledgerTransactions) {
        if (isClosed) return
        if (ledgerTransaction instanceof Error) throw ledgerTransaction

        const event = await mapTransactionStreamEvent(ledgerTransaction)

        if (event && !isClosed) await onTransaction(event)
      }
    }

    ;(async () => {
      try {
        await streamTransactions()
      } catch (err) {
        const error = toError(err, "Failed to stream transactions")
        serviceLogger.error({ err: error }, "Failed to stream transactions")
        cleanup()
        onError(error)
      }
    })()

    return {
      close: cleanup,
    }
  }

  return { subscribeToTransactions }
}
