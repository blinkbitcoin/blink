import { completeMigrationFlowForSettledPayment } from "./settle-migration-flow"

import { intraledgerPaymentSendWalletIdForBtcWallet } from "@/app/payments/send-intraledger"
import { payNoAmountInvoiceByWalletId } from "@/app/payments/send-lightning"
import { getBalanceForWallet } from "@/app/wallets/get-balance-for-wallet"

import { getCustodialMigrationFlowConfig } from "@/config"

import { FEECAP_BASIS_POINTS, FEECAP_MIN, toSats } from "@/domain/bitcoin"
import { PaymentSendStatus } from "@/domain/bitcoin/lightning"
import { MigrationFlowPhase, MigrationStateConflictError } from "@/domain/migration-flow"
import { LnFees } from "@/domain/payments"
import {
  BtcPaymentAmount,
  ErrorLevel,
  InvalidBtcPaymentAmountError,
} from "@/domain/shared"

import { getBankOwnerWalletId } from "@/services/ledger/caching"
import {
  AccountsRepository,
  MigrationFlowStateRepository,
  WalletsRepository,
} from "@/services/mongoose"
import { recordExceptionInCurrentSpan } from "@/services/tracing"

export const reserveForAmount = (amount: bigint): bigint =>
  LnFees().maxProtocolAndBankFee(BtcPaymentAmount(amount)).amount

const totalDebitForAmount = (amount: bigint): bigint => amount + reserveForAmount(amount)

export const migrationDrainAmount = (
  balance: bigint,
): bigint | InvalidBtcPaymentAmountError => {
  if (balance <= FEECAP_MIN.amount) {
    return new InvalidBtcPaymentAmountError(`balance: ${balance}`)
  }

  // fixed point A* = max{A : A + reserve(A) <= B} where reserve(A) is
  // max(round-half-down(A*bps/10^4), feeMin). The seed never exceeds A*, so the
  // loop below closes the gap upward while re-verifying against the live fee function
  const flatSeed = balance - FEECAP_MIN.amount
  const pctSeed = (10_000n * balance) / (10_000n + FEECAP_BASIS_POINTS)
  let amount = flatSeed < pctSeed ? flatSeed : pctSeed
  while (totalDebitForAmount(amount + 1n) <= balance) {
    amount += 1n
  }

  if (amount <= 0n || totalDebitForAmount(amount) > balance) {
    return new InvalidBtcPaymentAmountError(`no drain amount for balance: ${balance}`)
  }
  return amount
}

export const executeMigrationTransfer = async ({
  account,
  btcWalletId,
  paymentRequest,
  paymentHash,
}: {
  account: Account
  btcWalletId: WalletId
  paymentRequest: string
  paymentHash: PaymentHash
}): Promise<PaymentSendStatus | ApplicationError> => {
  const migrationFlowRepo = MigrationFlowStateRepository()

  const recordStep = async (step: string, detail: string) => {
    const recorded = await migrationFlowRepo.addStep({
      accountId: account.id,
      step: { step, detail },
    })
    if (recorded instanceof Error) {
      recordExceptionInCurrentSpan({ error: recorded, level: ErrorLevel.Warn })
    }
  }

  const failMigration = async (error: ApplicationError, detail: string) => {
    const failed = await migrationFlowRepo.updatePhase({
      accountId: account.id,
      fromPhase: MigrationFlowPhase.Transferring,
      toPhase: MigrationFlowPhase.Failed,
      step: { step: "transfer-failed", detail },
    })
    if (failed instanceof Error) {
      recordExceptionInCurrentSpan({ error: failed, level: ErrorLevel.Warn })
    }
    return error
  }

  const balance = await getBalanceForWallet({ walletId: btcWalletId })
  if (balance instanceof Error) {
    return failMigration(balance, `balance lookup failed: ${balance.name}`)
  }
  const balanceSats = BigInt(balance)

  if (balanceSats < 0n) {
    return failMigration(
      new InvalidBtcPaymentAmountError(`balance: ${balanceSats}`),
      `negative balance: ${balanceSats} sats`,
    )
  }

  if (balanceSats === 0n) {
    await recordStep("transfer-skipped", "zero balance")
    await completeMigrationFlowForSettledPayment({ paymentHash })
    return PaymentSendStatus.Success
  }

  const { deMinimisThresholdSats } = getCustodialMigrationFlowConfig()

  let drainAmount: bigint
  if (balanceSats <= BigInt(deMinimisThresholdSats)) {
    const topUpAmount = reserveForAmount(balanceSats)

    const bankOwnerWalletId = await getBankOwnerWalletId()
    const bankOwnerWallet = await WalletsRepository().findById(bankOwnerWalletId)
    if (bankOwnerWallet instanceof Error) {
      return failMigration(bankOwnerWallet, `top-up failed: ${bankOwnerWallet.name}`)
    }
    const bankOwnerAccount = await AccountsRepository().findById(
      bankOwnerWallet.accountId,
    )
    if (bankOwnerAccount instanceof Error) {
      return failMigration(bankOwnerAccount, `top-up failed: ${bankOwnerAccount.name}`)
    }

    const topUp = await intraledgerPaymentSendWalletIdForBtcWallet({
      recipientWalletId: btcWalletId,
      amount: toSats(topUpAmount),
      memo: "custodial migration reserve top-up",
      senderWalletId: bankOwnerWalletId,
      senderAccount: bankOwnerAccount,
    })
    if (topUp instanceof Error) {
      return failMigration(topUp, `top-up failed: ${topUp.name}`)
    }
    await recordStep(
      "reserve-top-up",
      `${topUpAmount} sats from bank owner; Blink covered the Spark network fee (de-minimis subsidy)`,
    )

    drainAmount = balanceSats
  } else {
    const amount = migrationDrainAmount(balanceSats)
    if (amount instanceof Error) {
      return failMigration(amount, `drain amount failed: ${amount.name}`)
    }
    drainAmount = amount

    const residual = balanceSats - totalDebitForAmount(drainAmount)
    await recordStep(
      "drain-computed",
      `amount: ${drainAmount} sats, reserve: ${reserveForAmount(drainAmount)} sats, expected residual: ${residual} sats`,
    )
  }

  const paymentResult = await payNoAmountInvoiceByWalletId({
    uncheckedPaymentRequest: paymentRequest,
    amount: Number(drainAmount),
    memo: null,
    senderWalletId: btcWalletId,
    senderAccount: account,
    skipChecks: true,
  })
  if (paymentResult instanceof Error) {
    return failMigration(paymentResult, `ln payment failed: ${paymentResult.name}`)
  }

  if (paymentResult.status === PaymentSendStatus.AlreadyPaid) {
    return failMigration(
      new MigrationStateConflictError("invoice already paid"),
      "invoice already paid",
    )
  }

  if (paymentResult.status === PaymentSendStatus.Pending) {
    await recordStep("transfer-pending", `paymentHash: ${paymentHash}`)
    return paymentResult.status
  }

  await completeMigrationFlowForSettledPayment({ paymentHash })
  return paymentResult.status
}
