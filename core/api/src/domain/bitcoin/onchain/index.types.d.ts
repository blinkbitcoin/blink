type OnChainError = import("./errors").OnChainError
type TransactionDecodeError = import("./errors").TransactionDecodeError
type OnChainServiceError = import("./errors").OnChainServiceError

type PayoutSpeed =
  (typeof import("./index").PayoutSpeed)[keyof typeof import("./index").PayoutSpeed]

type OnChainAddress = string & { readonly brand: unique symbol }
type OnChainAddressRequestId = string & { readonly brand: unique symbol }
type BlockId = string & { readonly brand: unique symbol }
type OnChainTxHash = string & { readonly brand: unique symbol }
type PayoutId = string & { readonly brand: unique symbol }
type BatchId = string & { readonly brand: unique symbol }
type OnChainTxVout = number & { readonly brand: unique symbol }
type ScanDepth = number & { readonly brand: unique symbol }
type TxOut = {
  sats: Satoshis
  // OP_RETURN utxos don't have valid addresses associated with them
  address: OnChainAddress | null
  vout: OnChainTxVout
}

type OnChainTransaction = {
  txHash: OnChainTxHash
  outs: TxOut[]
}

type IncomingOnChainTransaction = {
  confirmations: number
  rawTx: OnChainTransaction
  fee: Satoshis
  createdAt: Date
  uniqueAddresses: () => OnChainAddress[]
}

type IncomingOnChainTransactionFromCache = {
  confirmations: number
  rawTx: OnChainTransaction
  fee: Satoshis
  createdAt: string
}

type OutgoingOnChainTransaction = {
  confirmations: number
  rawTx: OnChainTransaction
  fee: Satoshis
  createdAt: Date
  uniqueAddresses: () => OnChainAddress[]
}

type TxDecoder = {
  decode(txHex: string): OnChainTransaction
}

type TxFilterArgs = {
  confirmationsLessThan?: number
  confirmationsGreaterThanOrEqual?: number
  addresses?: OnChainAddress[]
}

type TxFilter = {
  apply(txs: IncomingOnChainTransaction[]): IncomingOnChainTransaction[]
}

type QueuePayoutToAddressArgs = {
  walletDescriptor: WalletDescriptor<WalletCurrency>
  address: OnChainAddress
  amount: BtcPaymentAmount
  speed: PayoutSpeed
  journalId: LedgerJournalId
}

type PayoutQueue = {
  speed: PayoutSpeed
  queueName: string
  displayName: string
  description: string
}

type EstimatePayoutFeeArgs = {
  address: OnChainAddress
  amount: BtcPaymentAmount
  speed: PayoutSpeed
}

type IncomingOnChainTxHandler<S extends WalletCurrency> = {
  balancesByAddresses(): { [key: OnChainAddress]: PaymentAmount<S> } | ValidationError
  balanceByWallet(
    wallets: Wallet[],
  ): { [key: WalletId]: PaymentAmount<S> } | ValidationError
}

interface OnChainEvent {
  payload: string
  sequence: string
  recorded_at: number
}

type OnChainPayout = {
  id: PayoutId
  journalId: LedgerJournalId
  batchInclusionEstimatedAt: number | undefined
  batchId: BatchId | undefined
  txId: OnChainTxHash | undefined
  vout: OnChainTxVout | undefined
}

type OnChainEventHandler = (event: OnChainEvent) => true | ApplicationError

interface IOnChainService {
  getHotBalance(): Promise<BtcPaymentAmount | OnChainServiceError>
  getReceiveWalletBalance(): Promise<BtcPaymentAmount | OnChainServiceError>
  getWithdrawalWalletBalance(): Promise<BtcPaymentAmount | OnChainServiceError>
  getWalletBalance(walletName: string): Promise<BtcPaymentAmount | OnChainServiceError>
  getColdBalance(): Promise<BtcPaymentAmount | OnChainServiceError>
  getAddressForWallet(args: {
    walletDescriptor: WalletDescriptor<WalletCurrency>
    requestId?: OnChainAddressRequestId
  }): Promise<OnChainAddressIdentifier | OnChainServiceError>
  getAddressForSwap(): Promise<OnChainAddress | OnChainServiceError>
  findAddressByRequestId(
    requestId: OnChainAddressRequestId,
  ): Promise<OnChainAddressIdentifier | OnChainServiceError>
  findPayoutByLedgerJournalId(
    requestId: LedgerJournalId,
  ): Promise<OnChainPayout | OnChainServiceError>
  queuePayoutToAddress(
    args: QueuePayoutToAddressArgs,
  ): Promise<OnChainPayout | OnChainServiceError>
  rebalanceToWithdrawalWallet(args: {
    amount: BtcPaymentAmount
  }): Promise<PayoutId | OnChainServiceError>
  rebalanceToColdWallet(args: {
    amount: BtcPaymentAmount
  }): Promise<PayoutId | OnChainServiceError>
  estimateFeeForPayout(
    args: EstimatePayoutFeeArgs,
  ): Promise<BtcPaymentAmount | OnChainServiceError>
  listPayoutQueues(): Promise<PayoutQueue[] | OnChainServiceError>
}

type RebalanceCheckerConfig = {
  minBalance: Satoshis
  threshold: Satoshis
  minRebalanceSize: Satoshis
}

type ColdStorageConfig = RebalanceCheckerConfig

type WithdrawFromHotWalletAmountArgs = {
  onChainHotWalletBalance: Satoshis
  offChainHotWalletBalance: Satoshis
}

type WithdrawAmountArgs = {
  totalBalance: Satoshis
  availableBalance?: Satoshis
}

type RebalanceChecker = {
  getWithdrawAmount(args: WithdrawAmountArgs): Satoshis
}
