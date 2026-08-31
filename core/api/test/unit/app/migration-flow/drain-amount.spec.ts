jest.mock("@/app/migration-flow/reclaim-top-up", () => ({
  reclaimMigrationTopUp: jest.fn(),
}))
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
import { FEECAP_BASIS_POINTS } from "@/domain/bitcoin"
import { LnFees } from "@/domain/payments"
import { BtcPaymentAmount, InvalidBtcPaymentAmountError } from "@/domain/shared"

const reserve = (amount: bigint, feeCapBasisPoints?: bigint): bigint =>
  LnFees().maxProtocolAndBankFee(BtcPaymentAmount(amount), feeCapBasisPoints).amount

const totalDebit = (amount: bigint, feeCapBasisPoints?: bigint): bigint =>
  amount + reserve(amount, feeCapBasisPoints)

const expectFixedPoint = (balance: bigint, feeCapBasisPoints?: bigint) => {
  const amount = migrationDrainAmount(balance, feeCapBasisPoints)
  if (amount instanceof Error) throw amount
  expect(totalDebit(amount, feeCapBasisPoints)).toBeLessThanOrEqual(balance)
  expect(totalDebit(amount + 1n, feeCapBasisPoints)).toBeGreaterThan(balance)
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

describe("migrationDrainAmount with a group fee cap", () => {
  const groupCap = 20n

  it("matches the default result when passed the default cap explicitly", () => {
    for (const balance of [11n, 2110n, 2111n, 100_000n, 10_000_000n]) {
      expect(migrationDrainAmount(balance, FEECAP_BASIS_POINTS)).toStrictEqual(
        migrationDrainAmount(balance),
      )
    }
  })

  it("lands on exactly zero across the extended flat regime (fee floor to B = 5010)", () => {
    for (let balance = 11n; balance <= 5010n; balance += 499n) {
      const amount = expectFixedPoint(balance, groupCap)
      expect(amount).toBe(balance - 10n)
      expect(balance - totalDebit(amount, groupCap)).toBe(0n)
    }
  })

  it("gives the user more of a large balance than the default cap", () => {
    const defaultAmount = migrationDrainAmount(1_000_000n)
    const groupAmount = migrationDrainAmount(1_000_000n, groupCap)
    if (defaultAmount instanceof Error || groupAmount instanceof Error) {
      throw new Error("drain amount failed")
    }
    expect(groupAmount - defaultAmount).toBeGreaterThan(2_900n)
  })

  it("drains to zero with at most a 1-sat top-up across an exhaustive group-cap sweep", () => {
    let checked = 0n
    for (let balance = 11n; balance <= 30_000n; balance += 1n) {
      const plan = migrationDrainPlan(balance, groupCap)
      if (plan instanceof Error) throw plan
      if (plan.residualTopUp > 1n) {
        throw new Error(`residual top-up ${plan.residualTopUp} at balance ${balance}`)
      }
      if (balance + plan.residualTopUp - totalDebit(plan.amount, groupCap) !== 0n) {
        throw new Error(`did not drain to zero at balance ${balance}`)
      }
      checked += 1n
    }
    expect(checked).toBe(29_990n)
  })

  it("satisfies the fixed-point property across caps on a pseudo-random sweep", () => {
    let seed = 48271n
    for (const cap of [1n, 5n, 20n, 25n, 49n]) {
      for (let i = 0; i < 100; i++) {
        seed = (seed * 16807n) % 2147483647n
        const balance = 2111n + (seed % 50_000_000n)
        const amount = expectFixedPoint(balance, cap)
        expect(balance - totalDebit(amount, cap)).toBeLessThanOrEqual(1n)
      }
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

  it("drains to zero with at most a 1-sat top-up across an exhaustive sweep", () => {
    // the ≤1 bound holds for any fee rate ≤ 100%, not just the current bps; a failure
    // here means the fee shape broke that precondition and the runtime guard will fire
    let sawTopUp = false
    for (let balance = 11n; balance <= 30_000n; balance += 1n) {
      const plan = migrationDrainPlan(balance)
      if (plan instanceof Error) throw plan
      if (plan.residualTopUp > 1n) {
        throw new Error(`residual top-up ${plan.residualTopUp} at balance ${balance}`)
      }
      if (balance + plan.residualTopUp - totalDebit(plan.amount) !== 0n) {
        throw new Error(`did not drain to zero at balance ${balance}`)
      }
      sawTopUp ||= plan.residualTopUp === 1n
    }
    expect(sawTopUp).toBe(true)
  })
})
