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

// the fee's integer step function can skip a balance (no amount debits it exactly),
// stranding a residual; a bank-owner top-up of the residual reaches a balance that
// drains to exactly zero, and the plan fails closed if the fee shape ever breaks that
export const migrationDrainPlan = (
  balance: bigint,
): { amount: bigint; residualTopUp: bigint } | InvalidBtcPaymentAmountError => {
  const amount = migrationDrainAmount(balance)
  if (amount instanceof Error) return amount

  const residual = balance - totalDebitForAmount(amount)
  if (residual === 0n) return { amount, residualTopUp: 0n }

  const toppedAmount = migrationDrainAmount(balance + residual)
  if (toppedAmount instanceof Error) return toppedAmount
  if (balance + residual - totalDebitForAmount(toppedAmount) !== 0n) {
    return new InvalidBtcPaymentAmountError(
      `residual not drainable for balance: ${balance}`,
    )
  }

  return { amount: toppedAmount, residualTopUp: residual }
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

  // maxAmount bounds are proven per call site; a breach means the drain math or
  // config no longer satisfies its preconditions, so no bank-owner money moves
  const topUpFromBankOwner = async (amount: bigint, maxAmount: bigint, memo: string) => {
    if (amount <= 0n || amount > maxAmount) {
      return new InvalidBtcPaymentAmountError(
        `top-up out of bounds: ${amount} sats, max ${maxAmount}`,
      )
    }
    const bankOwnerWalletId = await getBankOwnerWalletId()
    const bankOwnerWallet = await WalletsRepository().findById(bankOwnerWalletId)
    if (bankOwnerWallet instanceof Error) return bankOwnerWallet
    const bankOwnerAccount = await AccountsRepository().findById(
      bankOwnerWallet.accountId,
    )
    if (bankOwnerAccount instanceof Error) return bankOwnerAccount

    return intraledgerPaymentSendWalletIdForBtcWallet({
      recipientWalletId: btcWalletId,
      amount: toSats(amount),
      memo,
      senderWalletId: bankOwnerWalletId,
      senderAccount: bankOwnerAccount,
    })
  }

  let drainAmount: bigint
  if (balanceSats <= BigInt(deMinimisThresholdSats)) {
    const topUpAmount = reserveForAmount(balanceSats)

    // reserve(B ≤ threshold) equals FEECAP_MIN exactly while
    // threshold * bps ≤ 10^4 * FEECAP_MIN + 5000 (threshold ≤ 2100 at current values);
    // raising the threshold past that requires revisiting this bound
    const topUp = await topUpFromBankOwner(
      topUpAmount,
      FEECAP_MIN.amount,
      "custodial migration reserve top-up",
    )
    if (topUp instanceof Error) {
      return failMigration(topUp, `top-up failed: ${topUp.name}`)
    }
    await recordStep(
      "reserve-top-up",
      `${topUpAmount} sats from bank owner; Blink covered the Spark network fee (de-minimis subsidy)`,
    )

    drainAmount = balanceSats
  } else {
    const plan = migrationDrainPlan(balanceSats)
    if (plan instanceof Error) {
      return failMigration(plan, `drain amount failed: ${plan.name}`)
    }

    if (plan.residualTopUp > 0n) {
      // the residual is provably ≤ 1 for any fee rate ≤ 100%: the debit function
      // steps by at most 2 sats, so a skipped balance is always repaired by +1
      const topUp = await topUpFromBankOwner(
        plan.residualTopUp,
        1n,
        "custodial migration residual top-up",
      )
      if (topUp instanceof Error) {
        return failMigration(topUp, `residual top-up failed: ${topUp.name}`)
      }
      await recordStep(
        "residual-top-up",
        `${plan.residualTopUp} sats from bank owner; makes the drain land on zero`,
      )
    }
    drainAmount = plan.amount

    const residual = balanceSats + plan.residualTopUp - totalDebitForAmount(drainAmount)
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
