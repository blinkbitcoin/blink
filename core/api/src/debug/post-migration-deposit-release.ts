/**
 * Release one confirmed late on-chain deposit from a completed custodial
 * migration to the verified migrated Lightning address.
 *
 * pnpm tsx src/debug/post-migration-deposit-release.ts /var/yaml/custom.yaml inspect \
 *   <accountId> <txid> <vout> <address> <lightningAddress>
 * pnpm tsx src/debug/post-migration-deposit-release.ts /var/yaml/custom.yaml prepare \
 *   <accountId> <txid> <vout> <address> <lightningAddress> <caseReference>
 * pnpm tsx src/debug/post-migration-deposit-release.ts /var/yaml/custom.yaml release <txid> <vout>
 * pnpm tsx src/debug/post-migration-deposit-release.ts /var/yaml/custom.yaml reconcile <txid> <vout>
 */

import {
  inspectPostMigrationDepositRelease,
  preparePostMigrationDepositRelease,
  reconcilePostMigrationDepositRelease,
  releasePostMigrationDeposit,
} from "@/app/migration-flow/post-migration-deposit-release"
import { isSha256Hash } from "@/domain/bitcoin"
import { MigrationInvalidDestinationError } from "@/domain/migration-flow"
import { setupMongoConnection } from "@/services/mongodb"

export const steps = ["inspect", "prepare", "release", "reconcile"] as const
type Step = (typeof steps)[number]

const usage = `usage:
  <customYaml> inspect   <accountId> <txid> <vout> <address> <lightningAddress>
  <customYaml> prepare   <accountId> <txid> <vout> <address> <lightningAddress> <caseReference>
  <customYaml> release   <txid> <vout>
  <customYaml> reconcile <txid> <vout>`

export const parseOutput = (
  txHashRaw: string | undefined,
  voutRaw: string | undefined,
): { txHash: OnChainTxHash; vout: OnChainTxVout } | ApplicationError => {
  if (!txHashRaw || !isSha256Hash(txHashRaw)) {
    return new MigrationInvalidDestinationError(
      "txid must be exactly 64 hexadecimal characters",
    )
  }
  if (!voutRaw || !/^\d+$/.test(voutRaw)) {
    return new MigrationInvalidDestinationError("vout must be a non-negative integer")
  }
  const vout = Number(voutRaw)
  if (!Number.isSafeInteger(vout)) {
    return new MigrationInvalidDestinationError("vout is outside the safe range")
  }
  return {
    txHash: txHashRaw.toLowerCase() as OnChainTxHash,
    vout: vout as OnChainTxVout,
  }
}

const parseInspectionArgs = (args: string[]) => {
  const [accountId, txHashRaw, voutRaw, address, lightningAddress] = args
  if (!accountId || !address || !lightningAddress) {
    return new MigrationInvalidDestinationError(`missing argument\n${usage}`)
  }
  const output = parseOutput(txHashRaw, voutRaw)
  if (output instanceof Error) return output
  return { accountId, ...output, address, lightningAddress }
}

export const inspect = async (args: string[]) => {
  const parsed = parseInspectionArgs(args)
  if (parsed instanceof Error) return parsed
  const plan = await inspectPostMigrationDepositRelease(parsed)
  if (plan instanceof Error) return plan

  console.log(
    JSON.stringify(
      {
        accountId: plan.account.id,
        accountStatus: plan.account.status,
        walletId: plan.btcWallet.id,
        walletBalanceSats: plan.walletBalanceSats,
        txHash: plan.txHash,
        vout: plan.vout,
        address: plan.address,
        receiptJournalId: plan.receiptJournalId,
        receiptAmountSats: plan.receiptAmountSats,
        payoutAmountSats: plan.payoutAmountSats,
        maximumLightningFeeSats:
          plan.receiptAmountSats + plan.topUpSats - plan.payoutAmountSats,
        topUpSats: plan.topUpSats,
        lightningAddress: plan.lightningAddress,
      },
      null,
      2,
    ),
  )
  return true
}

export const prepare = async (args: string[]) => {
  const parsed = parseInspectionArgs(args)
  if (parsed instanceof Error) return parsed
  const caseReference = args.slice(5).join(" ").trim()
  const release = await preparePostMigrationDepositRelease({
    ...parsed,
    caseReference,
  })
  if (release instanceof Error) return release
  console.log(JSON.stringify(release, null, 2))
  return true
}

export const release = async (args: string[]) => {
  const output = parseOutput(args[0], args[1])
  if (output instanceof Error) return output
  const result = await releasePostMigrationDeposit(output)
  if (result instanceof Error) return result
  console.log(JSON.stringify(result, null, 2))
  return true
}

export const reconcile = async (args: string[]) => {
  const output = parseOutput(args[0], args[1])
  if (output instanceof Error) return output
  const result = await reconcilePostMigrationDepositRelease(output)
  if (result instanceof Error) return result
  console.log(JSON.stringify(result, null, 2))
  return true
}

export const main = async () => {
  const [configPath, stepRaw, ...args] = process.argv.slice(2)
  if (!configPath) {
    console.error(`Missing custom.yaml path\n${usage}`)
    process.exitCode = 1
    return
  }
  if (!steps.includes(stepRaw as Step)) {
    console.error(`Unknown step: ${stepRaw}\n${usage}`)
    process.exitCode = 1
    return
  }
  const runners: Record<Step, (args: string[]) => Promise<true | ApplicationError>> = {
    inspect,
    prepare,
    release,
    reconcile,
  }
  const result = await runners[stepRaw as Step](args)
  if (result instanceof Error) {
    console.error("Error:", result)
    process.exitCode = 1
  }
}

if (require.main === module) {
  setupMongoConnection()
    .then(async (mongoose) => {
      await main()
      if (mongoose) await mongoose.connection.close()
    })
    .catch((err) => {
      console.error(err)
      process.exitCode = 1
    })
}
