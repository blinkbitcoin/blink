/**
 * Test fixture for the inactivity-fee refund path (blink-wip#1225, Story 3.1). Until the fee
 * job ships nothing posts an `inactivity_fee` debit, so refund tests seed one here, through the
 * same facade function the fee job will use. Runs on regtest only.
 *
 * how to run (from core/api):
 *
 *   pnpm tsx src/debug/inactivity-fee-seed-debit.ts debit --wallet-id <id> --month YYYY-MM --sats N --cents N [--notice-id <id>]
 *   pnpm tsx src/debug/inactivity-fee-seed-debit.ts refund --account-id <id>
 *   buck2 run //core/api:dev-inactivity-fee-seed-debit -- debit ...                          # dev stack
 *
 * debit     one debit of N sats (Bitcoin Balance) or N cents (Dollar Balance; --sats is then
 *           the bankowner side) under `ifee_<walletId>_<month>`; refused when the key exists.
 * refund    what the claims release path does: refundInactivityFees with reason `claims`,
 *           open or closed account. Prints the refunded totals as JSON; exit code 1 when any
 *           refund failed.
 */

import { InactivityFee } from "@/app"

import { getInactivityFeeConfig, NETWORK } from "@/config"

import {
  claimsRunId,
  inactivityFeeExternalId,
  InactivityFeeRefundReason,
} from "@/domain/inactivity-fee"
import { checkedToAccountId } from "@/domain/accounts"
import { paymentAmountFromNumber, WalletCurrency } from "@/domain/shared"
import { checkedToWalletId } from "@/domain/wallets"

import { LedgerService } from "@/services/ledger"
import * as LedgerFacade from "@/services/ledger/facade"
import { LockService } from "@/services/lock"
import { setupMongoConnection } from "@/services/mongodb"
import { WalletsRepository } from "@/services/mongoose"

const usage = `usage:
  inactivity-fee-seed-debit.ts debit --wallet-id <id> --month YYYY-MM --sats N --cents N [--notice-id <id>]
  inactivity-fee-seed-debit.ts refund --account-id <id>`

const FIXTURE_RATE_SOURCE = "fixture"

const flag = ({ argv, name }: { argv: string[]; name: string }): string | undefined => {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}

const positiveInt = (value: string | undefined): number | undefined =>
  value !== undefined && /^[1-9]\d*$/.test(value) ? Number(value) : undefined

const seedDebit = async ({ argv }: { argv: string[] }): Promise<true | Error> => {
  const walletId = checkedToWalletId(flag({ argv, name: "--wallet-id" }) ?? "")
  if (walletId instanceof Error) return new Error(`--wallet-id: ${walletId.name}`)
  const sats = positiveInt(flag({ argv, name: "--sats" }))
  const cents = positiveInt(flag({ argv, name: "--cents" }))
  if (sats === undefined || cents === undefined) {
    return new Error("--sats and --cents must be positive integers")
  }
  const externalId = inactivityFeeExternalId({
    walletId,
    month: flag({ argv, name: "--month" }) ?? "",
  })
  if (externalId instanceof Error) return new Error(`--month: ${externalId.message}`)

  const wallet = await WalletsRepository().findById(walletId)
  if (wallet instanceof Error) return wallet
  const btc = paymentAmountFromNumber({ amount: sats, currency: WalletCurrency.Btc })
  if (btc instanceof Error) return btc
  const usd = paymentAmountFromNumber({ amount: cents, currency: WalletCurrency.Usd })
  if (usd instanceof Error) return usd

  // same guard the fee job will use: key checked and posted under the account lock
  const posted = await LockService().lockInactivityFeeAccount(
    wallet.accountId,
    async () => {
      const existing = await LedgerService().getTransactionForWalletByExternalId({
        walletId,
        externalId,
      })
      if (existing instanceof Error) return existing
      if (existing !== undefined) return new Error(`${externalId} already exists`)

      return LedgerFacade.recordInactivityFee({
        walletDescriptor: {
          id: wallet.id,
          currency: wallet.currency,
          accountId: wallet.accountId,
        },
        amount: { btc, usd },
        externalId,
        metadata: {
          rate: Math.round((cents / sats) * 1_000_000),
          rateSource: FIXTURE_RATE_SOURCE,
          configVersion: getInactivityFeeConfig().configVersion,
          noticeId: flag({ argv, name: "--notice-id" }) ?? "fixture",
          runId: `fixture-${externalId}`,
        },
      })
    },
  )
  if (posted instanceof Error) return posted

  console.log(JSON.stringify({ externalId, journalId: posted.journalId }))
  return true
}

const refund = async ({ argv }: { argv: string[] }): Promise<true | Error> => {
  const accountId = checkedToAccountId(flag({ argv, name: "--account-id" }) ?? "")
  if (accountId instanceof Error) return new Error(`--account-id: ${accountId.name}`)

  const runId = claimsRunId({ asOf: new Date() })
  const result = await InactivityFee.refundInactivityFees({
    accountId,
    reason: InactivityFeeRefundReason.Claims,
    runId,
  })
  if (result instanceof Error) return result

  const { refundedSats, refundedCents, failures } = result
  console.log(
    JSON.stringify({
      runId,
      refundedSats,
      refundedCents,
      failures: failures.map(({ walletId, externalId, error }) => ({
        walletId,
        externalId,
        error: `${error.name}: ${error.message}`,
      })),
    }),
  )
  return failures.length === 0 ? true : new Error(`${failures.length} refund(s) failed`)
}

const main = async (): Promise<true | Error> => {
  if (NETWORK !== "regtest") {
    return new Error(`test fixture: regtest only, refuses to run on ${NETWORK}`)
  }

  const argv = process.argv.slice(2)
  if (argv.includes("debit")) return seedDebit({ argv })
  if (argv.includes("refund")) return refund({ argv })
  return new Error(usage)
}

// importing `@/app` keeps handles open after main() returns, so the process exits explicitly
if (require.main === module) {
  setupMongoConnection()
    .then(async (mongoose) => {
      try {
        const result = await main()
        if (result instanceof Error) {
          console.error("Error:", result.message)
          process.exitCode = 1
        }
      } catch (err) {
        console.error(err)
        process.exitCode = 1
      } finally {
        if (mongoose) await mongoose.connection.close()
      }
      process.exit(process.exitCode ?? 0)
    })
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
