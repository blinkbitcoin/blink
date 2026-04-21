import {
  ledgerTransactionCreditToTransactionsStreamTransactionType,
  ledgerTransactionTypeToTransactionsStreamSettlementVia,
} from "@/domain/transactions-stream"
import {
  LedgerTransactionType,
  liabilitiesMainAccount,
  toWalletId,
} from "@/domain/ledger"

import { TransactionMetadata } from "@/services/ledger/schema"
import { WalletInvoice } from "@/services/mongoose/schema"
import { WalletsRepository } from "@/services/mongoose/wallets"

const PREIMAGE_CACHE_TTL_MS = 5 * 60 * 1000
const PREIMAGE_CACHE_MAX_SIZE = 10_000

export const LIABILITIES_ACCOUNT_PREFIX = `${liabilitiesMainAccount}:`
export const LIABILITIES_ACCOUNT_PATTERN = /^Liabilities:/

export const EXCLUDED_LEDGER_TRANSACTION_TYPES: LedgerTransactionType[] = [
  LedgerTransactionType.Fee,
  LedgerTransactionType.ToColdStorage,
  LedgerTransactionType.ToHotWallet,
  LedgerTransactionType.Escrow,
  LedgerTransactionType.RoutingRevenue,
  LedgerTransactionType.Reconciliation,
]

export const SETTLED_TRANSACTION_FILTER = {
  accounts: LIABILITIES_ACCOUNT_PATTERN,
  pending: false,
  type: { $nin: EXCLUDED_LEDGER_TRANSACTION_TYPES },
} as const

type TimestampedValue<T> = {
  value: T
  expiresAt: number
}

type PreimageLoaderArgs = {
  transactionId: string
  paymentHash?: string
}

export type TransactionStreamRecord = Pick<
  ILedgerTransaction,
  | "accounts"
  | "hash"
  | "type"
  | "pending"
  | "currency"
  | "satsAmount"
  | "centsAmount"
  | "credit"
  | "datetime"
  | "timestamp"
> & {
  _id: ObjectId
}

export type AccountIdLoader = (walletId: WalletId) => Promise<AccountId | undefined>
export type PreimageLoader = (args: PreimageLoaderArgs) => Promise<string>
export type AccountIdResolver = (walletId: WalletId) => Promise<AccountId | undefined>
export type PreimageResolver = (args: PreimageLoaderArgs) => Promise<string>

type FindWalletById = (
  walletId: WalletId,
) => Promise<{ accountId: AccountId } | Error | undefined>
type FindTransactionMetadataById = (
  transactionId: string,
) => Promise<Pick<TransactionMetadataRecord, "revealedPreImage"> | null | undefined>
type FindWalletInvoiceById = (
  paymentHash: string,
) => Promise<Pick<WalletInvoiceRecord, "secret"> | null | undefined>

class ExpiringCache<K, V> {
  private readonly values = new Map<K, TimestampedValue<V>>()

  constructor(
    private readonly options: {
      ttlMs: number
      maxSize: number
    },
  ) {}

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

export const parseWalletId = (accounts: string): WalletId | undefined => {
  if (!accounts.startsWith(LIABILITIES_ACCOUNT_PREFIX)) return undefined
  return toWalletId(accounts as LiabilitiesWalletId)
}

const defaultFindWalletById: FindWalletById = async (walletId) =>
  WalletsRepository().findById(walletId)

const defaultFindTransactionMetadataById: FindTransactionMetadataById = async (
  transactionId,
) =>
  (await TransactionMetadata.findById(transactionId).lean()) as Pick<
    TransactionMetadataRecord,
    "revealedPreImage"
  > | null

const defaultFindWalletInvoiceById: FindWalletInvoiceById = async (paymentHash) =>
  (await WalletInvoice.findById(paymentHash).lean()) as Pick<
    WalletInvoiceRecord,
    "secret"
  > | null

export const createAccountIdLoader = ({
  findWalletById = defaultFindWalletById,
}: {
  findWalletById?: FindWalletById
} = {}): AccountIdLoader => {
  return async (walletId) => {
    const wallet = await findWalletById(walletId)
    if (!wallet || wallet instanceof Error) return undefined

    return wallet.accountId
  }
}

export const createPreimageLoader = ({
  findTransactionMetadataById = defaultFindTransactionMetadataById,
  findWalletInvoiceById = defaultFindWalletInvoiceById,
}: {
  findTransactionMetadataById?: FindTransactionMetadataById
  findWalletInvoiceById?: FindWalletInvoiceById
} = {}): PreimageLoader => {
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
}: {
  walletToAccountCache?: Map<WalletId, AccountId | undefined>
  loadAccountId?: AccountIdLoader
} = {}): AccountIdResolver => {
  return async (walletId: WalletId) => {
    if (walletToAccountCache.has(walletId)) {
      return walletToAccountCache.get(walletId)
    }

    const accountId = await loadAccountId(walletId)
    walletToAccountCache.set(walletId, accountId)

    return accountId
  }
}

export const createPreimageResolver = ({
  preimageCache = new ExpiringCache<string, string>({
    ttlMs: PREIMAGE_CACHE_TTL_MS,
    maxSize: PREIMAGE_CACHE_MAX_SIZE,
  }),
  loadPreimage = createPreimageLoader(),
}: {
  preimageCache?: {
    get: (key: string) => string | undefined
    set: (key: string, value: string) => void
  }
  loadPreimage?: PreimageLoader
} = {}): PreimageResolver => {
  return async ({ transactionId, paymentHash }: PreimageLoaderArgs) => {
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
}: {
  resolveAccountId?: AccountIdResolver
  resolvePreimage?: PreimageResolver
} = {}) => {
  const mapTransactionStreamEvent = async (
    ledgerTransaction: TransactionStreamRecord,
  ): Promise<TransactionStreamEvent | undefined> => {
    const walletId = parseWalletId(ledgerTransaction.accounts)
    if (!walletId) return undefined

    const [accountId, preimage] = await Promise.all([
      resolveAccountId(walletId),
      resolvePreimage({
        transactionId: ledgerTransaction._id.toString(),
        paymentHash: ledgerTransaction.hash,
      }),
    ])

    return {
      ledgerTransactionId: ledgerTransaction._id.toString() as LedgerTransactionId,
      walletId,
      accountId,
      paymentHash: ledgerTransaction.hash ?? undefined,
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
      pending: Boolean(ledgerTransaction.pending),
      timestamp: ledgerTransaction.datetime ?? ledgerTransaction.timestamp ?? undefined,
    }
  }

  return { mapTransactionStreamEvent }
}
