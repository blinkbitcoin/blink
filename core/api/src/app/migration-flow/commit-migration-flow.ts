import { executeMigrationTransfer } from "./execute-transfer"
import { resumeMigrationFlow } from "./resume-migration-flow"

import { getCustodialMigrationFlowConfig } from "@/config"

import { getBalanceForWallet } from "@/app/wallets/get-balance-for-wallet"
import { isAccountInWindDownCohort } from "@/app/wind-down"

import { AccountValidator } from "@/domain/accounts"
import { decodeInvoice } from "@/domain/bitcoin/lightning"
import { CouldNotFindMigrationFlowStateError } from "@/domain/errors"
import {
  checkedToSparkPubkey,
  MigrationApiKeyForbiddenError,
  MigrationDollarBalanceNotEmptyError,
  MigrationFlowDisabledError,
  MigrationFlowPhase,
  MigrationInvalidDestinationError,
  MigrationNotEligibleError,
  MigrationStateConflictError,
  verifyMigrationProofOfPossession,
} from "@/domain/migration-flow"

import { LndService } from "@/services/lnd"
import { LockService } from "@/services/lock"
import {
  AccountsRepository,
  MigrationFlowStateRepository,
  WalletsRepository,
} from "@/services/mongoose"

export const commitMigrationFlow = async ({
  accountId,
  apiKeyId,
  sparkPubkey,
  proofSignature,
  proofTimestamp,
  sparkInvoice,
  disclosureVersion,
  backupAttested,
}: {
  accountId: AccountId
  apiKeyId?: ApiKeyId
  sparkPubkey: string
  proofSignature: string
  proofTimestamp: number
  sparkInvoice: string
  disclosureVersion: string
  backupAttested: boolean
}): Promise<MigrationFlow | ApplicationError> => {
  if (apiKeyId) return new MigrationApiKeyForbiddenError()

  if (!getCustodialMigrationFlowConfig().enabled) {
    return new MigrationFlowDisabledError()
  }

  if (!backupAttested) {
    return new MigrationInvalidDestinationError("backup attestation required")
  }

  if (!disclosureVersion.trim()) {
    return new MigrationInvalidDestinationError("disclosure version required")
  }

  const account = await AccountsRepository().findById(accountId)
  if (account instanceof Error) return account

  const accountValidator = AccountValidator(account)
  if (accountValidator instanceof Error) return accountValidator

  const decodedInvoice = decodeInvoice(sparkInvoice)
  if (decodedInvoice instanceof Error) return decodedInvoice
  const { paymentHash, paymentAmount: invoiceAmount } = decodedInvoice
  if (invoiceAmount && invoiceAmount.amount > 0n) {
    return new MigrationInvalidDestinationError("a no-amount invoice is required")
  }

  const migrationFlowRepo = MigrationFlowStateRepository()

  const flow = await migrationFlowRepo.findByAccountId(accountId)
  if (flow instanceof CouldNotFindMigrationFlowStateError) {
    return new MigrationStateConflictError("migration has not been started")
  }
  if (flow instanceof Error) return flow

  if (
    flow.phase === MigrationFlowPhase.Transferring &&
    flow.lnPaymentHash === paymentHash
  ) {
    return resumeMigrationFlow({ accountId })
  }

  // below the resume branch: cohort loss must not block reconciling an in-flight drain
  const inCohort = await isAccountInWindDownCohort({ account })
  if (inCohort instanceof Error) return inCohort
  if (!inCohort) return new MigrationNotEligibleError()

  if (flow.phase !== MigrationFlowPhase.InProgress || flow.lnPaymentHash) {
    return new MigrationStateConflictError(
      `migration commit is single-shot: phase is ${flow.phase}`,
    )
  }

  if (decodedInvoice.isExpired) {
    return new MigrationInvalidDestinationError("invoice is expired")
  }

  const lndService = LndService()
  if (lndService instanceof Error) return lndService
  if (lndService.listAllPubkeys().includes(decodedInvoice.destination)) {
    return new MigrationInvalidDestinationError("invoice must not be a Blink invoice")
  }

  const destinationPubkey = checkedToSparkPubkey(sparkPubkey)
  if (destinationPubkey instanceof Error) return destinationPubkey

  const proofVerified = verifyMigrationProofOfPossession({
    accountId,
    destinationPubkey,
    signature: proofSignature,
    timestamp: proofTimestamp,
  })
  if (proofVerified instanceof Error) return proofVerified

  const accountWallets =
    await WalletsRepository().findAccountWalletsByAccountId(accountId)
  if (accountWallets instanceof Error) return accountWallets

  const usdBalance = await getBalanceForWallet({ walletId: accountWallets.USD.id })
  if (usdBalance instanceof Error) return usdBalance
  if (usdBalance > 0) {
    return new MigrationDollarBalanceNotEmptyError(
      `Dollar balance must be empty before migration. walletId: ${accountWallets.USD.id}, balance: ${usdBalance}`,
    )
  }

  const lock = await LockService().lockIdempotencyKey(
    `migration-commit:${accountId}` as IdempotencyKey,
  )
  if (lock instanceof Error) return lock

  const transferring = await migrationFlowRepo.updatePhase({
    accountId,
    fromPhase: MigrationFlowPhase.InProgress,
    toPhase: MigrationFlowPhase.Transferring,
    destinationSparkPubkey: destinationPubkey,
    destinationProofVerified: true,
    lnPaymentHash: paymentHash,
    disclosureVersion,
    step: { step: "commit", detail: `paymentHash: ${paymentHash}` },
  })
  if (transferring instanceof Error) return transferring

  const transferResult = await executeMigrationTransfer({
    account,
    btcWalletId: accountWallets.BTC.id,
    paymentRequest: sparkInvoice,
    paymentHash,
  })
  if (transferResult instanceof Error) return transferResult

  return migrationFlowRepo.findByAccountId(accountId)
}
