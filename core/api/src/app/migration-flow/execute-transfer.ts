import { reclaimMigrationTopUp } from "./reclaim-top-up"
import { completeMigrationFlowForSettledPayment } from "./settle-migration-flow"

import { intraledgerPaymentSendWalletIdForBtcWallet } from "@/app/payments/send-intraledger"
import { payNoAmountInvoiceByWalletId } from "@/app/payments/send-lightning"
import { getBalanceForWallet } from "@/app/wallets/get-balance-for-wallet"

import { getCustodialMigrationFlowConfig, getValuesToSkipProbe } from "@/config"

import { FEECAP_BASIS_POINTS, FEECAP_MIN, toSats } from "@/domain/bitcoin"
import { PaymentSendStatus, decodeInvoice } from "@/domain/bitcoin/lightning"
import { MigrationFlowPhase, MigrationStateConflictError } from "@/domain/migration-flow"
import { LnFees, feeCapBasisPointsForInvoice } from "@/domain/payments"
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

export const reserveForAmount = (amount: bigint, feeCapBasisPoints?: bigint): bigint =>
  LnFees().maxProtocolAndBankFee(BtcPaymentAmount(amount), feeCapBasisPoints).amount

const totalDebitForAmount = (amount: bigint, feeCapBasisPoints?: bigint): bigint =>
  amount + reserveForAmount(amount, feeCapBasisPoints)

export const migrationDrainAmount = (
  balance: bigint,
  feeCapBasisPoints = FEECAP_BASIS_POINTS,
): bigint | InvalidBtcPaymentAmountError => {
  if (balance <= FEECAP_MIN.amount) {
    return new InvalidBtcPaymentAmountError(`balance: ${balance}`)
  }

  const flatSeed = balance - FEECAP_MIN.amount
  const pctSeed = (10_000n * balance) / (10_000n + feeCapBasisPoints)
  let amount = flatSeed < pctSeed ? flatSeed : pctSeed
  while (totalDebitForAmount(amount + 1n, feeCapBasisPoints) <= balance) {
    amount += 1n
  }

  if (amount <= 0n || totalDebitForAmount(amount, feeCapBasisPoints) > balance) {
    return new InvalidBtcPaymentAmountError(`no drain amount for balance: ${balance}`)
  }
  return amount
}

export const migrationDrainPlan = (
  balance: bigint,
  feeCapBasisPoints = FEECAP_BASIS_POINTS,
): { amount: bigint; residualTopUp: bigint } | InvalidBtcPaymentAmountError => {
  const amount = migrationDrainAmount(balance, feeCapBasisPoints)
  if (amount instanceof Error) return amount

  const residual = balance - totalDebitForAmount(amount, feeCapBasisPoints)
  if (residual === 0n) return { amount, residualTopUp: 0n }

  const toppedAmount = migrationDrainAmount(balance + residual, feeCapBasisPoints)
  if (toppedAmount instanceof Error) return toppedAmount
  if (balance + residual - totalDebitForAmount(toppedAmount, feeCapBasisPoints) !== 0n) {
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

  const recordTopUp = async (topUpSats: bigint, step: string, detail: string) => {
    const recorded = await migrationFlowRepo.recordTopUp({
      accountId: account.id,
      topUpSats: toSats(topUpSats),
      step: { step, detail },
    })
    if (recorded instanceof Error) {
      recordExceptionInCurrentSpan({ error: recorded, level: ErrorLevel.Warn })
    }
  }

  const failMigration = async (
    error: ApplicationError,
    detail: string,
    topUpSats = 0n,
  ) => {
    const failed = await migrationFlowRepo.updatePhase({
      accountId: account.id,
      fromPhase: MigrationFlowPhase.Transferring,
      toPhase: MigrationFlowPhase.Failed,
      step: { step: "transfer-failed", detail },
    })
    if (failed instanceof Error) {
      recordExceptionInCurrentSpan({ error: failed, level: ErrorLevel.Warn })
      return error
    }
    if (topUpSats > 0n) {
      await reclaimMigrationTopUp({
        accountId: account.id,
        topUpSats: toSats(topUpSats),
      })
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

  const decodedInvoice = decodeInvoice(paymentRequest)
  const feeCapBasisPoints =
    decodedInvoice instanceof Error
      ? undefined
      : feeCapBasisPointsForInvoice({
          invoice: decodedInvoice,
          feeCapGroups: getValuesToSkipProbe().feeCapGroups,
        })

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
  let topUpSats = 0n
  if (balanceSats <= BigInt(deMinimisThresholdSats)) {
    const topUpAmount = reserveForAmount(balanceSats, feeCapBasisPoints)

    const topUp = await topUpFromBankOwner(
      topUpAmount,
      FEECAP_MIN.amount,
      "custodial migration reserve top-up",
    )
    if (topUp instanceof Error) {
      return failMigration(topUp, `top-up failed: ${topUp.name}`)
    }
    await recordTopUp(
      topUpAmount,
      "reserve-top-up",
      `${topUpAmount} sats from bank owner; Blink covered the Spark network fee (de-minimis subsidy)`,
    )

    topUpSats = topUpAmount
    drainAmount = balanceSats
  } else {
    const plan = migrationDrainPlan(balanceSats, feeCapBasisPoints)
    if (plan instanceof Error) {
      return failMigration(plan, `drain amount failed: ${plan.name}`)
    }

    if (plan.residualTopUp > 0n) {
      const topUp = await topUpFromBankOwner(
        plan.residualTopUp,
        1n,
        "custodial migration residual top-up",
      )
      if (topUp instanceof Error) {
        return failMigration(topUp, `residual top-up failed: ${topUp.name}`)
      }
      await recordTopUp(
        plan.residualTopUp,
        "residual-top-up",
        `${plan.residualTopUp} sats from bank owner; makes the drain land on zero`,
      )
      topUpSats = plan.residualTopUp
    }
    drainAmount = plan.amount

    const residual =
      balanceSats +
      plan.residualTopUp -
      totalDebitForAmount(drainAmount, feeCapBasisPoints)
    await recordStep(
      "drain-computed",
      `amount: ${drainAmount} sats, reserve: ${reserveForAmount(drainAmount, feeCapBasisPoints)} sats, fee cap: ${feeCapBasisPoints ?? FEECAP_BASIS_POINTS} bps, expected residual: ${residual} sats`,
    )
  }

  const paymentResult = await payNoAmountInvoiceByWalletId({
    uncheckedPaymentRequest: paymentRequest,
    amount: Number(drainAmount),
    memo: null,
    senderWalletId: btcWalletId,
    senderAccount: account,
    skipChecks: true,
    skipBankFee: true,
  })
  if (paymentResult instanceof Error) {
    return failMigration(
      paymentResult,
      `ln payment failed: ${paymentResult.name}`,
      topUpSats,
    )
  }

  if (paymentResult.status === PaymentSendStatus.AlreadyPaid) {
    return failMigration(
      new MigrationStateConflictError("invoice already paid"),
      "invoice already paid",
      topUpSats,
    )
  }

  if (paymentResult.status === PaymentSendStatus.Pending) {
    await recordStep("transfer-pending", `paymentHash: ${paymentHash}`)
    return paymentResult.status
  }

  await completeMigrationFlowForSettledPayment({ paymentHash })
  return paymentResult.status
}
