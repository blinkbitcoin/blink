import { getCustodialMigrationFlowConfig } from "@/config"

import { getCurrentPriceAsWalletPriceRatio } from "@/app/prices"
import { getBalanceForWallet } from "@/app/wallets/get-balance-for-wallet"
import { isAccountInWindDownCohort } from "@/app/wind-down"

import { AccountLevel } from "@/domain/accounts"
import { toSats } from "@/domain/bitcoin"
import { UsdDisplayCurrency } from "@/domain/fiat"
import { evaluateDepositHold } from "@/domain/migration-flow"
import { toDays } from "@/domain/primitives"
import { ErrorLevel, UsdPaymentAmount } from "@/domain/shared"

import * as LedgerFacade from "@/services/ledger/facade"
import {
  addAttributesToCurrentSpan,
  recordExceptionInCurrentSpan,
} from "@/services/tracing"

import { timestampDaysAgo } from "@/utils"

const currentThresholdSats = async (
  thresholdUsdCents: number,
): Promise<Satoshis | ApplicationError> => {
  const priceRatio = await getCurrentPriceAsWalletPriceRatio({
    currency: UsdDisplayCurrency,
  })
  if (priceRatio instanceof Error) return priceRatio

  return toSats(
    priceRatio.convertFromUsd(UsdPaymentAmount(BigInt(thresholdUsdCents))).amount,
  )
}

export const checkDepositHold = async ({
  account,
  btcWalletDescriptor,
  pinnedThresholdSats,
}: {
  account: Account
  btcWalletDescriptor: WalletDescriptor<"BTC">
  pinnedThresholdSats?: Satoshis
}): Promise<{ holdThresholdSats?: Satoshis } | ApplicationError> => {
  const { recentDepositThresholdUsdCents, recentDepositWindowDays } =
    getCustodialMigrationFlowConfig()
  if (recentDepositThresholdUsdCents === 0) return {}

  if (account.level >= AccountLevel.Two) {
    addAttributesToCurrentSpan({ "migrationFlow.depositHold.verdict": "exempt-level" })
    return {}
  }

  const balance = await getBalanceForWallet({ walletId: btcWalletDescriptor.id })
  if (balance instanceof Error) {
    recordExceptionInCurrentSpan({ error: balance, level: ErrorLevel.Warn })
  }
  if (!(balance instanceof Error) && balance === 0) {
    addAttributesToCurrentSpan({
      "migrationFlow.depositHold.verdict": "exempt-zero-balance",
    })
    return {}
  }

  const inCohort = await isAccountInWindDownCohort({ account })
  if (inCohort instanceof Error) {
    recordExceptionInCurrentSpan({ error: inCohort, level: ErrorLevel.Warn })
  }
  if (!(inCohort instanceof Error) && inCohort) {
    addAttributesToCurrentSpan({ "migrationFlow.depositHold.verdict": "exempt-cohort" })
    return {}
  }

  const thresholdSats =
    pinnedThresholdSats ?? (await currentThresholdSats(recentDepositThresholdUsdCents))
  if (thresholdSats instanceof Error) return thresholdSats

  const windowStart = timestampDaysAgo(toDays(recentDepositWindowDays))
  if (windowStart instanceof Error) return windowStart

  const volumeAmount = await LedgerFacade.grossInAllTxBaseVolumeAmountSince({
    walletDescriptor: btcWalletDescriptor,
    timestamp: windowStart,
  })
  if (volumeAmount instanceof Error) return volumeAmount

  const volumeSats = toSats(volumeAmount.amount)

  const verdict = evaluateDepositHold({ volumeSats, thresholdSats })
  addAttributesToCurrentSpan({
    "migrationFlow.depositHold.thresholdSats": thresholdSats,
    "migrationFlow.depositHold.windowDays": recentDepositWindowDays,
    "migrationFlow.depositHold.volumeSats": volumeSats,
    "migrationFlow.depositHold.verdict": verdict instanceof Error ? "hold" : "pass",
  })
  if (verdict instanceof Error) return verdict

  return { holdThresholdSats: thresholdSats }
}
