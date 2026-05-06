import {
  ledgerTransactionCreditToTransactionsStreamTransactionType,
  ledgerTransactionTypeToTransactionsStreamSettlementVia,
} from "@/domain/transactions-stream"

import { TransactionMetadata } from "@/services/ledger/schema"
import { WalletInvoice } from "@/services/mongoose/schema"
import { WalletsRepository } from "@/services/mongoose/wallets"

const PREIMAGE_CACHE_TTL_MS = 5 * 60 * 1000
const PREIMAGE_CACHE_MAX_SIZE = 10_000

class ExpiringCache<K, V> {
  private readonly values = new Map<K, TransactionsStreamTimestampedValue<V>>()

  constructor(private readonly options: TransactionsStreamExpiringCacheOptions) {}

  get(key: K): V | undefined {
    const cached = this.values.get(key)
    if (!cached) return undefined

    if (cached.expiresAt <= Date.now()) {
      this.values.delete(key)
      return undefined
    }

    return cached.value
  }

  set(key: K, value: V) {
    if (this.values.size >= this.options.maxSize) {
      const oldestKey = this.values.keys().next().value
      if (oldestKey !== undefined) this.values.delete(oldestKey)
    }

    this.values.set(key, {
      value,
      expiresAt: Date.now() + this.options.ttlMs,
    })
  }
}

const defaultFindWalletById: TransactionsStreamFindWalletById = async (walletId) => {
  return WalletsRepository().findById(walletId)
}

const defaultFindTransactionMetadataById: TransactionsStreamFindTransactionMetadataById =
  async (transactionId) => {
    return (await TransactionMetadata.findById(transactionId).lean()) as Pick<
      TransactionMetadataRecord,
      "revealedPreImage"
    > | null
  }

const defaultFindWalletInvoiceById: TransactionsStreamFindWalletInvoiceById = async (
  paymentHash,
) => {
  return (await WalletInvoice.findById(paymentHash).lean()) as Pick<
    WalletInvoiceRecord,
    "secret"
  > | null
}

export const createAccountIdLoader = ({
  findWalletById = defaultFindWalletById,
}: TransactionsStreamAccountIdLoaderConfig = {}): TransactionsStreamAccountIdLoader => {
  return async (walletId) => {
    const wallet = await findWalletById(walletId)
    if (wallet instanceof Error) throw wallet
    if (!wallet) return undefined

    return wallet.accountId
  }
}

export const createPreimageLoader = ({
  findTransactionMetadataById = defaultFindTransactionMetadataById,
  findWalletInvoiceById = defaultFindWalletInvoiceById,
}: TransactionsStreamPreimageLoaderConfig = {}): TransactionsStreamPreimageLoader => {
  return async ({ transactionId, paymentHash }) => {
    const txMetadata = await findTransactionMetadataById(transactionId)
    if (txMetadata?.revealedPreImage) return txMetadata.revealedPreImage
    if (!paymentHash) return ""

    const invoice = await findWalletInvoiceById(paymentHash)
    return invoice?.secret ?? ""
  }
}

export const createAccountIdResolver = ({
  walletToAccountCache = new Map<WalletId, AccountId | undefined>(),
  loadAccountId = createAccountIdLoader(),
}: TransactionsStreamAccountIdResolverConfig = {}): TransactionsStreamAccountIdResolver => {
  return async (walletId: WalletId) => {
    if (walletToAccountCache.has(walletId)) {
      return walletToAccountCache.get(walletId)
    }

    const accountId = await loadAccountId(walletId)
    if (accountId !== undefined) walletToAccountCache.set(walletId, accountId)

    return accountId
  }
}

export const createPreimageResolver = ({
  preimageCache = new ExpiringCache<string, string>({
    ttlMs: PREIMAGE_CACHE_TTL_MS,
    maxSize: PREIMAGE_CACHE_MAX_SIZE,
  }),
  loadPreimage = createPreimageLoader(),
}: TransactionsStreamPreimageResolverConfig = {}): TransactionsStreamPreimageResolver => {
  return async ({ transactionId, paymentHash }: TransactionsStreamPreimageLoaderArgs) => {
    const cached = preimageCache.get(transactionId)
    if (cached !== undefined) return cached

    const preimage = await loadPreimage({ transactionId, paymentHash })
    preimageCache.set(transactionId, preimage)
    return preimage
  }
}

export const createTransactionStreamEventMapper = ({
  resolveAccountId = createAccountIdResolver(),
  resolvePreimage = createPreimageResolver(),
}: TransactionStreamEventMapperConfig = {}) => {
  const mapTransactionStreamEvent = async (
    ledgerTransaction: LedgerTransaction<WalletCurrency>,
  ): Promise<TransactionStreamEvent | undefined> => {
    const walletId = ledgerTransaction.walletId
    if (!walletId) return undefined

    const [accountId, preimage] = await Promise.all([
      resolveAccountId(walletId),
      resolvePreimage({
        transactionId: ledgerTransaction.id,
        paymentHash: ledgerTransaction.paymentHash,
      }),
    ])

    return {
      ledgerTransactionId: ledgerTransaction.id,
      walletId,
      accountId,
      paymentHash: ledgerTransaction.paymentHash,
      preimage,
      satsAmount: ledgerTransaction.satsAmount ?? 0,
      centsAmount: ledgerTransaction.centsAmount ?? 0,
      currency: ledgerTransaction.currency,
      type: ledgerTransactionCreditToTransactionsStreamTransactionType(
        ledgerTransaction.credit,
      ),
      settlementVia: ledgerTransactionTypeToTransactionsStreamSettlementVia(
        ledgerTransaction.type,
      ),
      pending: ledgerTransaction.pendingConfirmation,
      timestamp: ledgerTransaction.timestamp,
    }
  }

  return { mapTransactionStreamEvent }
}
