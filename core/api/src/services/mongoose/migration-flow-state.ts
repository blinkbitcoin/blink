import { parseRepositoryError } from "./utils"

import { MigrationFlowState } from "./schema"

import {
  CouldNotFindMigrationFlowStateError,
  DuplicateKeyForPersistError,
} from "@/domain/errors"
import {
  checkedMigrationFlowPhaseTransition,
  MigrationFlowPhase,
  MigrationStateConflictError,
} from "@/domain/migration-flow"

export const MigrationFlowStateRepository = (): IMigrationFlowStateRepository => {
  const findByAccountId = async (
    accountId: AccountId,
  ): Promise<MigrationFlow | RepositoryError> => {
    try {
      const result = await MigrationFlowState.findOne({ accountId })
      if (!result) return new CouldNotFindMigrationFlowStateError(accountId)
      return migrationFlowFromRaw(result)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  const findByLnPaymentHash = async (
    lnPaymentHash: PaymentHash,
  ): Promise<MigrationFlow | RepositoryError> => {
    try {
      const result = await MigrationFlowState.findOne({ lnPaymentHash })
      if (!result) return new CouldNotFindMigrationFlowStateError(lnPaymentHash)
      return migrationFlowFromRaw(result)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  const upsertByAccountId = async ({
    accountId,
    phase,
    disclosureVersion,
  }: UpsertMigrationFlowArgs): Promise<
    MigrationFlow | MigrationFlowError | RepositoryError
  > => {
    const transition = checkedMigrationFlowPhaseTransition({
      from: MigrationFlowPhase.NotStarted,
      to: phase,
    })
    if (transition instanceof Error) return transition

    try {
      const result = await MigrationFlowState.findOneAndUpdate(
        { accountId },
        {
          $setOnInsert: {
            accountId,
            phase,
            ...(disclosureVersion !== undefined ? { disclosureVersion } : {}),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      return migrationFlowFromRaw(result)
    } catch (err) {
      const parsed = parseRepositoryError(err)
      if (parsed instanceof DuplicateKeyForPersistError) {
        return findByAccountId(accountId)
      }
      return parsed
    }
  }

  const updatePhase = async ({
    accountId,
    fromPhase,
    toPhase,
    destinationSparkPubkey,
    destinationProofVerified,
    lnPaymentHash,
    disclosureVersion,
    step,
  }: MigrationFlowPhaseTransitionArgs): Promise<
    MigrationFlow | MigrationFlowError | RepositoryError
  > => {
    const transition = checkedMigrationFlowPhaseTransition({
      from: fromPhase,
      to: toPhase,
    })
    if (transition instanceof Error) return transition

    try {
      const result = await MigrationFlowState.findOneAndUpdate(
        { accountId, phase: fromPhase },
        {
          $set: {
            phase: toPhase,
            updatedAt: new Date(),
            ...(destinationSparkPubkey !== undefined ? { destinationSparkPubkey } : {}),
            ...(destinationProofVerified !== undefined
              ? { destinationProofVerified }
              : {}),
            ...(lnPaymentHash !== undefined ? { lnPaymentHash } : {}),
            ...(disclosureVersion !== undefined ? { disclosureVersion } : {}),
          },
          ...(step !== undefined
            ? { $push: { steps: { step: step.step, detail: step.detail } } }
            : {}),
        },
        { new: true },
      )
      if (!result) {
        return new MigrationStateConflictError(
          `no migration flow for account in phase: ${fromPhase}`,
        )
      }
      return migrationFlowFromRaw(result)
    } catch (err) {
      const parsed = parseRepositoryError(err)
      if (parsed instanceof DuplicateKeyForPersistError) {
        return new MigrationStateConflictError(
          "ln payment hash is already bound to another migration",
        )
      }
      return parsed
    }
  }

  const addStep = async ({
    accountId,
    step,
  }: MigrationFlowAddStepArgs): Promise<MigrationFlow | RepositoryError> => {
    try {
      const result = await MigrationFlowState.findOneAndUpdate(
        { accountId },
        {
          $set: { updatedAt: new Date() },
          $push: { steps: { step: step.step, detail: step.detail } },
        },
        { new: true },
      )
      if (!result) return new CouldNotFindMigrationFlowStateError(accountId)
      return migrationFlowFromRaw(result)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  const recordTopUp = async ({
    accountId,
    topUpSats,
    step,
  }: MigrationFlowRecordTopUpArgs): Promise<MigrationFlow | RepositoryError> => {
    try {
      const result = await MigrationFlowState.findOneAndUpdate(
        { accountId },
        {
          $set: { topUpSats, updatedAt: new Date() },
          $push: { steps: { step: step.step, detail: step.detail } },
        },
        { new: true },
      )
      if (!result) return new CouldNotFindMigrationFlowStateError(accountId)
      return migrationFlowFromRaw(result)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  const clearTopUp = async ({
    accountId,
    step,
  }: MigrationFlowClearTopUpArgs): Promise<MigrationFlow | RepositoryError> => {
    try {
      const result = await MigrationFlowState.findOneAndUpdate(
        { accountId },
        {
          $set: { updatedAt: new Date() },
          $unset: { topUpSats: "" },
          $push: { steps: { step: step.step, detail: step.detail } },
        },
        { new: true },
      )
      if (!result) return new CouldNotFindMigrationFlowStateError(accountId)
      return migrationFlowFromRaw(result)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  return {
    findByAccountId,
    findByLnPaymentHash,
    upsertByAccountId,
    updatePhase,
    addStep,
    recordTopUp,
    clearTopUp,
  }
}

const migrationFlowFromRaw = (result: MigrationFlowStateRecord): MigrationFlow => ({
  accountId: result.accountId as AccountId,
  phase: result.phase as MigrationFlowPhase,
  destinationSparkPubkey: (result.destinationSparkPubkey as SparkPubkey) || undefined,
  destinationProofVerified: result.destinationProofVerified,
  lnPaymentHash: (result.lnPaymentHash as PaymentHash) || undefined,
  topUpSats: (result.topUpSats as Satoshis) || undefined,
  disclosureVersion: result.disclosureVersion || undefined,
  steps: (result.steps || []).map((step) => ({
    step: step.step,
    recordedAt: step.recordedAt,
    detail: step.detail || undefined,
  })),
  createdAt: result.createdAt,
  updatedAt: result.updatedAt,
})
