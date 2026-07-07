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

import { migrationDrainAmount } from "@/app/migration-flow/execute-transfer"
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
