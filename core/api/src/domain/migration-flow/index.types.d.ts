type MigrationFlowError = import("./errors").MigrationFlowError
type MigrationStateConflictError = import("./errors").MigrationStateConflictError
type MigrationInvalidDestinationError =
  import("./errors").MigrationInvalidDestinationError

type MigrationFlowPhase =
  (typeof import("./index").MigrationFlowPhase)[keyof typeof import("./index").MigrationFlowPhase]

type MigrationLnAddressTransferStatus =
  (typeof import("./index").MigrationLnAddressTransferStatus)[keyof typeof import("./index").MigrationLnAddressTransferStatus]

type PostMigrationDepositReleaseStatus =
  (typeof import("./index").PostMigrationDepositReleaseStatus)[keyof typeof import("./index").PostMigrationDepositReleaseStatus]

type PostMigrationDepositRelease = {
  accountId: AccountId
  walletId: WalletId
  txHash: OnChainTxHash
  vout: OnChainTxVout
  address: OnChainAddress
  receiptJournalId: LedgerJournalId
  receiptAmountSats: Satoshis
  payoutAmountSats: Satoshis
  plannedTopUpSats: Satoshis
  topUpSats: Satoshis
  lightningAddress: LightningAddress
  caseReference: string
  status: PostMigrationDepositReleaseStatus
  paymentHash?: PaymentHash
  paymentRequest?: string
  failureReason?: string
  createdAt: Date
  updatedAt: Date
}

type PreparePostMigrationDepositReleaseArgs = Omit<
  PostMigrationDepositRelease,
  | "status"
  | "paymentHash"
  | "paymentRequest"
  | "failureReason"
  | "createdAt"
  | "updatedAt"
>

interface IPostMigrationDepositReleaseRepository {
  findByOutput(args: {
    txHash: OnChainTxHash
    vout: OnChainTxVout
  }): Promise<PostMigrationDepositRelease | RepositoryError>
  upsertPrepared(
    args: PreparePostMigrationDepositReleaseArgs,
  ): Promise<PostMigrationDepositRelease | RepositoryError>
  claimForRelease(args: {
    txHash: OnChainTxHash
    vout: OnChainTxVout
  }): Promise<PostMigrationDepositRelease | RepositoryError | MigrationFlowError>
  recordPayment(args: {
    txHash: OnChainTxHash
    vout: OnChainTxVout
    paymentHash: PaymentHash
    paymentRequest: string
  }): Promise<PostMigrationDepositRelease | RepositoryError | MigrationFlowError>
  recordTopUp(args: {
    txHash: OnChainTxHash
    vout: OnChainTxVout
    topUpSats: Satoshis
  }): Promise<PostMigrationDepositRelease | RepositoryError | MigrationFlowError>
  updateStatus(args: {
    txHash: OnChainTxHash
    vout: OnChainTxVout
    from: PostMigrationDepositReleaseStatus
    to: PostMigrationDepositReleaseStatus
    failureReason?: string
  }): Promise<PostMigrationDepositRelease | RepositoryError | MigrationFlowError>
}

type MigrationLnAddressTransferResult = {
  identifier: string
  status: MigrationLnAddressTransferStatus
  lightningAddress?: string
}

type MigrationPreview = {
  balanceSats: Satoshis
  feeSats: Satoshis
  feeCoveredByBlink: boolean
  receiveSats: Satoshis
}

type SparkPubkey = string & { readonly brand: unique symbol }

type MigrationFlowStep = {
  step: string
  recordedAt: Date
  detail?: string
}

type MigrationFlow = {
  accountId: AccountId
  phase: MigrationFlowPhase
  destinationSparkPubkey?: SparkPubkey
  destinationProofVerified: boolean
  lnPaymentHash?: PaymentHash
  topUpSats?: Satoshis
  disclosureVersion?: string
  holdThresholdSats?: Satoshis
  steps: MigrationFlowStep[]
  createdAt: Date
  updatedAt: Date
}

type MigrationProofChallengeArgs = {
  accountId: AccountId
  destinationPubkey: SparkPubkey
  timestamp: number
}

type VerifyMigrationProofArgs = MigrationProofChallengeArgs & {
  signature: string
  freshnessWindowSeconds?: Seconds
}

type MigrationFlowStepInput = {
  step: string
  detail?: string
}

type UpsertMigrationFlowArgs = {
  accountId: AccountId
  phase: MigrationFlowPhase
  disclosureVersion?: string
  holdThresholdSats?: Satoshis
}

type MigrationFlowPhaseTransitionArgs = {
  accountId: AccountId
  fromPhase: MigrationFlowPhase
  toPhase: MigrationFlowPhase
  destinationSparkPubkey?: SparkPubkey
  destinationProofVerified?: boolean
  lnPaymentHash?: PaymentHash
  disclosureVersion?: string
  step?: MigrationFlowStepInput
}

type MigrationFlowAddStepArgs = {
  accountId: AccountId
  step: MigrationFlowStepInput
}

type MigrationFlowRecordTopUpArgs = {
  accountId: AccountId
  topUpSats: Satoshis
  step: MigrationFlowStepInput
}

type MigrationFlowClearTopUpArgs = {
  accountId: AccountId
  step: MigrationFlowStepInput
}

type MigrationFlowResetForRetryArgs = {
  accountId: AccountId
  fromPhase: MigrationFlowPhase
  grantedBy: PrivilegedClientId
}

interface IMigrationFlowStateRepository {
  findByAccountId(accountId: AccountId): Promise<MigrationFlow | RepositoryError>
  findByLnPaymentHash(
    lnPaymentHash: PaymentHash,
  ): Promise<MigrationFlow | RepositoryError>
  upsertByAccountId(
    args: UpsertMigrationFlowArgs,
  ): Promise<MigrationFlow | MigrationFlowError | RepositoryError>
  updatePhase(
    args: MigrationFlowPhaseTransitionArgs,
  ): Promise<MigrationFlow | MigrationFlowError | RepositoryError>
  addStep(args: MigrationFlowAddStepArgs): Promise<MigrationFlow | RepositoryError>
  recordTopUp(
    args: MigrationFlowRecordTopUpArgs,
  ): Promise<MigrationFlow | RepositoryError>
  clearTopUp(args: MigrationFlowClearTopUpArgs): Promise<MigrationFlow | RepositoryError>
  resetForRetry(
    args: MigrationFlowResetForRetryArgs,
  ): Promise<MigrationFlow | MigrationFlowError | RepositoryError>
}
