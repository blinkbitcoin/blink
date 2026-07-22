type MigrationFlowError = import("./errors").MigrationFlowError
type MigrationStateConflictError = import("./errors").MigrationStateConflictError
type MigrationInvalidDestinationError =
  import("./errors").MigrationInvalidDestinationError

type MigrationFlowPhase =
  (typeof import("./index").MigrationFlowPhase)[keyof typeof import("./index").MigrationFlowPhase]

type MigrationLnAddressTransferStatus =
  (typeof import("./index").MigrationLnAddressTransferStatus)[keyof typeof import("./index").MigrationLnAddressTransferStatus]

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
}
