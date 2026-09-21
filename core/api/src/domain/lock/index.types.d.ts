type RedlockAbortSignal = import("redlock").RedlockAbortSignal

type LockServiceError = import("./errors").LockServiceError

type WalletIdAbortSignal = RedlockAbortSignal & { readonly brand: unique symbol }
type PaymentHashAbortSignal = RedlockAbortSignal & { readonly brand: unique symbol }
type OnChainTxAbortSignal = RedlockAbortSignal & { readonly brand: unique symbol }
type IdempotencyKeyAbortSignal = RedlockAbortSignal & { readonly brand: unique symbol }
type BtcMapSubmissionAbortSignal = RedlockAbortSignal & { readonly brand: unique symbol }
type InactivityFeeAccountAbortSignal = RedlockAbortSignal & {
  readonly brand: unique symbol
}
type InactivityFeeRunAbortSignal = RedlockAbortSignal & { readonly brand: unique symbol }

// per-call override of the lock client's retry policy; retryCount 0 is a single attempt
type LockRetrySettings = {
  retryCount?: number
  retryDelay?: number
  retryJitter?: number
}

interface ILockService {
  lockWalletId<Res>(
    walletId: WalletId,
    f: (signal: WalletIdAbortSignal) => Promise<Res>,
  ): Promise<Res | LockServiceError>
  lockPaymentHash<Res>(
    paymentHash: PaymentHash,
    f: (signal: PaymentHashAbortSignal) => Promise<Res>,
  ): Promise<Res | LockServiceError>
  lockOnChainTxHash<Res>(
    txHash: OnChainTxHash,
    f: (signal: OnChainTxAbortSignal) => Promise<Res>,
  ): Promise<Res | LockServiceError>
  lockOnChainTxHashAndVout<Res>(
    { txHash, vout }: { txHash: OnChainTxHash; vout: OnChainTxVout },
    f: (signal: OnChainTxAbortSignal) => Promise<Res>,
  ): Promise<Res | LockServiceError>
  lockIdempotencyKey(idempotencyKey: IdempotencyKey): Promise<void | LockServiceError>
  lockBtcMapPlaceSubmission<Res>(
    {
      accountId,
      submissionId,
    }: { accountId: AccountId; submissionId: BtcMapSubmissionId },
    f: (signal: BtcMapSubmissionAbortSignal) => Promise<Res>,
  ): Promise<Res | LockServiceError>
  lockInactivityFeeAccount<Res>(
    accountId: AccountId,
    f: (signal: InactivityFeeAccountAbortSignal) => Promise<Res>,
    settings?: LockRetrySettings,
  ): Promise<Res | LockServiceError>
  lockInactivityFeeRun<Res>(
    { kind, asOf }: { kind: InactivityFeeRunKind; asOf: Date },
    f: (signal: InactivityFeeRunAbortSignal) => Promise<Res>,
  ): Promise<Res | LockServiceError>
}

type RedlockArgs<Signal, Ret> = {
  path: string
  signal?: Signal
  asyncFn: (signal: Signal) => Promise<Ret>
  settings?: LockRetrySettings
}
