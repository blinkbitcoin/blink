import { LNURL_SERVER_LN_ADDRESS_DOMAIN, getCustodialMigrationFlowConfig } from "@/config"

import { getLnurlServerService } from "@/app/accounts/lnurl-server"

import { AccountStatus } from "@/domain/accounts"
import { InactiveAccountError } from "@/domain/errors"
import { LnurlServerConflictError, LnurlServerNotFoundError } from "@/domain/lnurl-server"
import {
  checkedToSparkPubkey,
  MigrationApiKeyForbiddenError,
  MigrationFlowDisabledError,
  MigrationLnAddressTransferStatus,
  verifyMigrationProofOfPossession,
} from "@/domain/migration-flow"
import { ErrorLevel } from "@/domain/shared"

import { MigrationFlowStateRepository, UsersRepository } from "@/services/mongoose"
import { recordExceptionInCurrentSpan } from "@/services/tracing"

const ALLOWED_STATUSES: AccountStatus[] = [AccountStatus.Active, AccountStatus.Migrated]

export const transferLnAddressesToSpark = async ({
  account,
  apiKeyId,
  sparkPubkey,
  proofSignature,
  proofTimestamp,
}: {
  account: Account
  apiKeyId?: ApiKeyId
  sparkPubkey: string
  proofSignature: string
  proofTimestamp: number
}): Promise<MigrationLnAddressTransferResult[] | ApplicationError> => {
  if (apiKeyId) return new MigrationApiKeyForbiddenError()

  if (!getCustodialMigrationFlowConfig().enabled) {
    return new MigrationFlowDisabledError()
  }

  if (!ALLOWED_STATUSES.includes(account.status)) {
    return new InactiveAccountError(account.id)
  }

  const destinationPubkey = checkedToSparkPubkey(sparkPubkey)
  if (destinationPubkey instanceof Error) return destinationPubkey

  const proofVerified = verifyMigrationProofOfPossession({
    accountId: account.id,
    destinationPubkey,
    signature: proofSignature,
    timestamp: proofTimestamp,
  })
  if (proofVerified instanceof Error) return proofVerified

  const identifiers: string[] = []
  if (account.username) identifiers.push(account.username)

  const user = await UsersRepository().findById(account.kratosUserId)
  if (user instanceof Error) return user
  if (user.phone) identifiers.push(user.phone)

  if (identifiers.length === 0) return []

  const migrationFlowRepo = MigrationFlowStateRepository()
  const flow = await migrationFlowRepo.findByAccountId(account.id)
  const hasRecord = !(flow instanceof Error)

  const recordStep = async (detail: string) => {
    if (!hasRecord) return
    const recorded = await migrationFlowRepo.addStep({
      accountId: account.id,
      step: { step: "ln-address-transfer", detail },
    })
    if (recorded instanceof Error) {
      recordExceptionInCurrentSpan({ error: recorded, level: ErrorLevel.Warn })
    }
  }

  const lnurlServer = getLnurlServerService()

  const results: MigrationLnAddressTransferResult[] = []
  for (const identifier of identifiers) {
    const result = await transferIdentifier({
      lnurlServer,
      identifier,
      destinationPubkey,
    })
    await recordStep(
      `${identifier}: ${result.status}${
        result.lightningAddress ? ` (${result.lightningAddress})` : ""
      }`,
    )
    results.push(result)
  }

  return results
}

const transferIdentifier = async ({
  lnurlServer,
  identifier,
  destinationPubkey,
}: {
  lnurlServer: ILnurlServerService | null
  identifier: string
  destinationPubkey: SparkPubkey
}): Promise<MigrationLnAddressTransferResult> => {
  if (lnurlServer === null) {
    return { identifier, status: MigrationLnAddressTransferStatus.Failed }
  }

  try {
    const result = await lnurlServer.transferIdentifierToSpark({
      domain: LNURL_SERVER_LN_ADDRESS_DOMAIN,
      identifier,
      destinationSparkPubkey: destinationPubkey,
      description: `Payment to ${identifier}`,
    })

    if (result instanceof LnurlServerNotFoundError) {
      return { identifier, status: MigrationLnAddressTransferStatus.SkippedNotRegistered }
    }

    if (result instanceof LnurlServerConflictError) {
      return resolveConflict({ lnurlServer, identifier, destinationPubkey })
    }

    if (result instanceof Error) {
      recordExceptionInCurrentSpan({ error: result, level: ErrorLevel.Warn })
      return { identifier, status: MigrationLnAddressTransferStatus.Failed }
    }

    return {
      identifier,
      status: MigrationLnAddressTransferStatus.Transferred,
      lightningAddress: result.lightningAddress,
    }
  } catch (err) {
    recordExceptionInCurrentSpan({ error: err, level: ErrorLevel.Warn })
    return { identifier, status: MigrationLnAddressTransferStatus.Failed }
  }
}

// lnurl-server is one-way Blink→Spark: a conflict already pointing at this pubkey is an
// idempotent no-op; any other pubkey is a support case, never re-pointed here.
const resolveConflict = async ({
  lnurlServer,
  identifier,
  destinationPubkey,
}: {
  lnurlServer: ILnurlServerService
  identifier: string
  destinationPubkey: SparkPubkey
}): Promise<MigrationLnAddressTransferResult> => {
  const current = await lnurlServer.getIdentifier({
    domain: LNURL_SERVER_LN_ADDRESS_DOMAIN,
    identifier,
  })

  if (
    !(current instanceof Error) &&
    current.provider === "spark" &&
    current.providerDetails.sparkPubkey?.toLowerCase() === destinationPubkey.toLowerCase()
  ) {
    return { identifier, status: MigrationLnAddressTransferStatus.AlreadyTransferred }
  }

  return { identifier, status: MigrationLnAddressTransferStatus.Failed }
}
