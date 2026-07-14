jest.mock("@/config", () => ({
  ...jest.requireActual("@/config"),
  getCustodialMigrationFlowConfig: jest.fn(),
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
  __mocks: {
    findAccountWallets: jest.fn(),
  },
  WalletsRepository: () => ({
    findAccountWalletsByAccountId:
      jest.requireMock("@/services/mongoose").__mocks.findAccountWallets,
  }),
}))

jest.mock("@/services/tracing", () => ({
  recordExceptionInCurrentSpan: jest.fn(),
}))

import { migrationDrainAmount } from "@/app/migration-flow/execute-transfer"
import { getMigrationPreview } from "@/app/migration-flow/get-migration-preview"
import { getBalanceForWallet } from "@/app/wallets/get-balance-for-wallet"
import { getCustodialMigrationFlowConfig } from "@/config"

const mocks = jest.requireMock("@/services/mongoose").__mocks as {
  findAccountWallets: jest.Mock
}
const mockGetBalance = getBalanceForWallet as jest.Mock
const mockGetConfig = getCustodialMigrationFlowConfig as jest.Mock

const accountId = "account-id" as AccountId
const btcWalletId = "btc-wallet-id" as WalletId

beforeEach(() => {
  jest.clearAllMocks()
  mocks.findAccountWallets.mockResolvedValue({
    BTC: { id: btcWalletId, currency: "BTC", accountId },
    USD: { id: "usd-wallet-id" as WalletId, currency: "USD", accountId },
  })
  mockGetConfig.mockReturnValue({ enabled: true, deMinimisThresholdSats: 100 })
})

const previewFor = async (balance: number) => {
  mockGetBalance.mockResolvedValue(balance)
  const result = await getMigrationPreview({ accountId })
  if (result instanceof Error) throw result
  return result
}

describe("getMigrationPreview", () => {
  it("returns a zero preview for an empty wallet (B = 0)", async () => {
    const preview = await previewFor(0)
    expect(preview).toEqual({
      balanceSats: 0,
      feeSats: 0,
      feeCoveredByBlink: false,
      receiveSats: 0,
    })
  })

  it("covers the fee at the threshold and charges it just above (B = 100 vs 101)", async () => {
    const atThreshold = await previewFor(100)
    expect(atThreshold).toEqual({
      balanceSats: 100,
      feeSats: 10,
      feeCoveredByBlink: true,
      receiveSats: 100,
    })

    const aboveThreshold = await previewFor(101)
    expect(aboveThreshold).toEqual({
      balanceSats: 101,
      feeSats: 10,
      feeCoveredByBlink: false,
      receiveSats: 91,
    })
  })

  it("charges the reserve in the normal range (B = 100000)", async () => {
    const drain = migrationDrainAmount(100_000n)
    if (drain instanceof Error) throw drain

    const preview = await previewFor(100_000)
    expect(preview).toEqual({
      balanceSats: 100_000,
      feeSats: Number(100_000n - drain),
      feeCoveredByBlink: false,
      receiveSats: Number(drain),
    })
  })

  it("holds receiveSats + (feeCoveredByBlink ? 0 : feeSats) === balanceSats across a sweep", async () => {
    const balances = [
      0, 1, 10, 11, 50, 99, 100, 101, 500, 2110, 2111, 5000, 100_000, 10_000_000,
    ]
    for (const balance of balances) {
      const preview = await previewFor(balance)
      const userPaidFee = preview.feeCoveredByBlink ? 0 : preview.feeSats
      expect(preview.receiveSats + userPaidFee).toBe(preview.balanceSats)
      expect(preview.balanceSats).toBe(balance)
    }
  })
})
