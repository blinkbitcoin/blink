jest.mock("@/app/migration-flow/settle-migration-flow", () => ({
  completeMigrationFlowForSettledPayment: jest.fn(),
}))
jest.mock("@/app/payments/send-intraledger", () => ({
  intraledgerPaymentSendWalletIdForBtcWallet: jest.fn(),
}))
jest.mock("@/app/payments/send-lightning", () => ({
  payNoAmountInvoiceByWalletId: jest.fn(),
}))
jest.mock("@/app/wallets/get-balance-for-wallet", () => ({
  getBalanceForWallet: jest.fn(),
}))
jest.mock("@/services/ledger/caching", () => ({
  getBankOwnerWalletId: jest.fn(),
}))
jest.mock("@/services/mongoose", () => ({
  AccountsRepository: jest.fn(),
  MigrationFlowStateRepository: jest.fn(),
  WalletsRepository: jest.fn(),
}))
jest.mock("@/services/tracing", () => ({
  recordExceptionInCurrentSpan: jest.fn(),
}))

import {
  migrationDrainAmount,
  migrationDrainPlan,
} from "@/app/migration-flow/execute-transfer"
import { LnFees } from "@/domain/payments"
import { BtcPaymentAmount, InvalidBtcPaymentAmountError } from "@/domain/shared"

const reserve = (amount: bigint): bigint =>
  LnFees().maxProtocolAndBankFee(BtcPaymentAmount(amount)).amount

const totalDebit = (amount: bigint): bigint => amount + reserve(amount)

const expectFixedPoint = (balance: bigint) => {
  const amount = migrationDrainAmount(balance)
  if (amount instanceof Error) throw amount
  expect(totalDebit(amount)).toBeLessThanOrEqual(balance)
  expect(totalDebit(amount + 1n)).toBeGreaterThan(balance)
  return amount
}

describe("migrationDrainAmount", () => {
  it("rejects unsendable dust balances (B <= 10)", () => {
    for (const balance of [0n, 1n, 5n, 10n]) {
      expect(migrationDrainAmount(balance)).toBeInstanceOf(InvalidBtcPaymentAmountError)
    }
  })

  it("drains 1 sat at the B = 11 boundary and lands on exactly zero", () => {
    const amount = expectFixedPoint(11n)
    expect(amount).toBe(1n)
    expect(11n - totalDebit(amount)).toBe(0n)
  })

  it("lands on exactly zero across the whole flat-reserve regime", () => {
    for (let balance = 11n; balance <= 2110n; balance += 1n) {
      const amount = expectFixedPoint(balance)
      expect(amount).toBe(balance - 10n)
      expect(balance - totalDebit(amount)).toBe(0n)
    }
  })

  it("computes A* around the default de-minimis threshold (B = 100/101)", () => {
    // pure fixed-point math is threshold-agnostic; execute-transfer subsidizes
    // B <= threshold, but the drain function still returns A* here.
    const atThreshold = expectFixedPoint(100n)
    expect(atThreshold).toBe(90n)
    expect(100n - totalDebit(atThreshold)).toBe(0n)

    const aboveThreshold = expectFixedPoint(101n)
    expect(aboveThreshold).toBe(91n)
    expect(101n - totalDebit(aboveThreshold)).toBe(0n)
  })

  it("crosses from the flat to the percentage regime at B = 2110/2111", () => {
    const flat = expectFixedPoint(2110n)
    expect(flat).toBe(2100n)
    expect(2110n - totalDebit(flat)).toBe(0n)

    const percentage = expectFixedPoint(2111n)
    expect(2111n - totalDebit(percentage)).toBeLessThanOrEqual(1n)
  })

  it("leaves at most 1 sat residual on percentage-regime samples", () => {
    for (const balance of [2111n, 2112n, 5000n, 100_000n, 123_457n, 10_000_000n]) {
      const amount = expectFixedPoint(balance)
      expect(balance - totalDebit(amount)).toBeLessThanOrEqual(1n)
    }
  })

  it("satisfies the fixed-point property on a pseudo-random percentage-regime sweep", () => {
    let seed = 48271n
    for (let i = 0; i < 500; i++) {
      seed = (seed * 16807n) % 2147483647n
      const balance = 2111n + (seed % 50_000_000n)
      const amount = expectFixedPoint(balance)
      expect(balance - totalDebit(amount)).toBeLessThanOrEqual(1n)
    }
  })
})

describe("migrationDrainPlan", () => {
  const expectExactZero = (balance: bigint) => {
    const plan = migrationDrainPlan(balance)
    if (plan instanceof Error) throw plan
    expect(balance + plan.residualTopUp - totalDebit(plan.amount)).toBe(0n)
    return plan
  }

  it("propagates the unsendable-dust error", () => {
    expect(migrationDrainPlan(10n)).toBeInstanceOf(InvalidBtcPaymentAmountError)
  })

  it("needs no top-up on exactly-drainable balances", () => {
    for (const balance of [11n, 100n, 2110n, 2112n, 200_000n, 10_000_000n]) {
      const plan = expectExactZero(balance)
      expect(plan.residualTopUp).toBe(0n)
      expect(plan.amount).toBe(migrationDrainAmount(balance))
    }
  })

  it("tops up 1 sat on skipped balances (B = 201k + 101) and drains to zero", () => {
    for (let k = 10n; k <= 40n; k += 1n) {
      const balance = 201n * k + 101n
      expect(migrationDrainAmount(balance)).not.toBeInstanceOf(Error)
      const plan = expectExactZero(balance)
      expect(plan.residualTopUp).toBe(1n)
      expect(totalDebit(plan.amount)).toBe(balance + 1n)
    }
  })

  it("gives the user their full balance minus the true reserve on a skipped balance", () => {
    const plan = expectExactZero(2111n)
    expect(plan.amount).toBe(2101n)
    expect(2111n - plan.amount).toBe(10n)
  })

  it("drains to exactly zero across a pseudo-random percentage-regime sweep", () => {
    let seed = 16807n
    for (let i = 0; i < 500; i++) {
      seed = (seed * 48271n) % 2147483647n
      const balance = 2111n + (seed % 50_000_000n)
      const plan = expectExactZero(balance)
      expect(plan.residualTopUp).toBeLessThanOrEqual(1n)
    }
  })
})
