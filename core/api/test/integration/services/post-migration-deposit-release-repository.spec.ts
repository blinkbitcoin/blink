import { randomUUID } from "crypto"

import {
  MigrationStateConflictError,
  PostMigrationDepositReleaseStatus,
} from "@/domain/migration-flow"
import { toSats } from "@/domain/bitcoin"
import { PostMigrationDepositReleaseRepository } from "@/services/mongoose"

describe("PostMigrationDepositReleaseRepository", () => {
  const repo = PostMigrationDepositReleaseRepository()

  const preparedArgs = (): PreparePostMigrationDepositReleaseArgs => ({
    accountId: randomUUID() as AccountId,
    walletId: randomUUID() as WalletId,
    txHash: randomUUID().replaceAll("-", "").repeat(2) as OnChainTxHash,
    vout: 0 as OnChainTxVout,
    address: `bcrt1q${randomUUID().replaceAll("-", "")}` as OnChainAddress,
    receiptJournalId: randomUUID() as LedgerJournalId,
    receiptAmountSats: toSats(10_000),
    payoutAmountSats: toSats(10_000),
    lightningAddress: `user-${randomUUID()}@wallet.example` as LightningAddress,
    caseReference: `CASE-${randomUUID()}`,
  })

  it("prepares a release with empty sweep fields", async () => {
    const args = preparedArgs()

    const prepared = await repo.upsertPrepared(args)
    if (prepared instanceof Error) throw prepared

    expect(prepared).toMatchObject({
      txHash: args.txHash,
      vout: args.vout,
      status: PostMigrationDepositReleaseStatus.Prepared,
    })
    expect(prepared.sweptAt).toBeUndefined()
    expect(prepared.sweepJournalId).toBeUndefined()
  })

  it("creates only one record when the same output is prepared concurrently", async () => {
    const args = preparedArgs()

    const results = await Promise.all([
      repo.upsertPrepared(args),
      repo.upsertPrepared(args),
      repo.upsertPrepared(args),
    ])

    for (const result of results) {
      if (result instanceof Error) throw result
      expect(result).toMatchObject({
        txHash: args.txHash,
        vout: args.vout,
        status: PostMigrationDepositReleaseStatus.Prepared,
      })
    }
  })

  it("allows exactly one concurrent release claim", async () => {
    const args = preparedArgs()
    const prepared = await repo.upsertPrepared(args)
    if (prepared instanceof Error) throw prepared

    const claims = await Promise.all([
      repo.claimForRelease({ txHash: args.txHash, vout: args.vout }),
      repo.claimForRelease({ txHash: args.txHash, vout: args.vout }),
    ])

    expect(
      claims.filter(
        (claim) =>
          !(claim instanceof Error) &&
          claim.status === PostMigrationDepositReleaseStatus.Processing,
      ),
    ).toHaveLength(1)
    expect(
      claims.filter((claim) => claim instanceof MigrationStateConflictError),
    ).toHaveLength(1)
  })

  it("cannot replace a bound invoice or payment hash", async () => {
    const args = preparedArgs()
    const prepared = await repo.upsertPrepared(args)
    if (prepared instanceof Error) throw prepared
    const claimed = await repo.claimForRelease({
      txHash: args.txHash,
      vout: args.vout,
    })
    if (claimed instanceof Error) throw claimed

    const firstHash = randomUUID().replaceAll("-", "").repeat(2) as PaymentHash
    const first = await repo.recordPayment({
      txHash: args.txHash,
      vout: args.vout,
      paymentHash: firstHash,
      paymentRequest: "lnbc1invoice",
    })
    if (first instanceof Error) throw first

    const second = await repo.recordPayment({
      txHash: args.txHash,
      vout: args.vout,
      paymentHash: randomUUID().replaceAll("-", "").repeat(2) as PaymentHash,
      paymentRequest: "lnbc1replacement",
    })

    expect(second).toBeInstanceOf(MigrationStateConflictError)
    expect(
      await repo.findByOutput({ txHash: args.txHash, vout: args.vout }),
    ).toMatchObject({ paymentHash: firstHash, paymentRequest: "lnbc1invoice" })
  })
})
