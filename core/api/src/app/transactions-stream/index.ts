import { checkedToLedgerTransactionId } from "@/domain/ledger"
import {
  ledgerTransactionToTransactionStreamEvent,
  transactionsStreamWalletAccountIdCacheKey,
} from "@/domain/transactions-stream"

import { LedgerService } from "@/services/ledger"
import { LocalCacheService } from "@/services/cache"
import { baseLogger } from "@/services/logger"
import { WalletsRepository } from "@/services/mongoose"

const logger = baseLogger.child({ module: "transactions-stream" })
const WALLET_ACCOUNT_ID_CACHE_TTL_SECS = (10 * 60) as Seconds

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

const accountIdForWalletId = async ({
  walletId,
  cacheService,
  walletsRepository,
}: TransactionsStreamAccountIdForWalletIdArgs): Promise<AccountId | ApplicationError> => {
  const cacheKey = transactionsStreamWalletAccountIdCacheKey(walletId)
  const cachedAccountId = await cacheService.get<AccountId>({ key: cacheKey })
  if (!(cachedAccountId instanceof Error)) return cachedAccountId

  const wallet = await walletsRepository.findById(walletId)
  if (wallet instanceof Error) return wallet

  await cacheService.set<AccountId>({
    key: cacheKey,
    value: wallet.accountId,
    ttlSecs: WALLET_ACCOUNT_ID_CACHE_TTL_SECS,
  })

  return wallet.accountId
}

export const subscribeToTransactions = async ({
  afterTransactionId,
  onTransaction,
  onError,
}: SubscribeToTransactionsArgs): Promise<TransactionsStreamSubscription | Error> => {
  const parsedCursor = parseAfterTransactionId(afterTransactionId)
  if (parsedCursor instanceof Error) return parsedCursor

  const ledgerService = LedgerService()
  const cacheService = LocalCacheService()
  const walletsRepository = WalletsRepository()
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

      const walletId = ledgerTransaction.walletId
      if (!walletId) continue

      const accountId = await accountIdForWalletId({
        walletId,
        cacheService,
        walletsRepository,
      })
      if (accountId instanceof Error) throw accountId

      const event = ledgerTransactionToTransactionStreamEvent({
        ledgerTransaction,
        accountId,
      })

      if (event && !isClosed) await onTransaction(event)
    }
  }

  ;(async () => {
    try {
      await streamTransactions()
    } catch (err) {
      const error = toError(err, "Failed to stream transactions")
      logger.error({ err: error }, "Failed to stream transactions")
      cleanup()
      onError(error)
    }
  })()

  return {
    close: cleanup,
  }
}
