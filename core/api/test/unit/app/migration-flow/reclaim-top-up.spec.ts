jest.mock("@/app/payments/send-intraledger", () => ({
  intraledgerPaymentSendWalletIdForBtcWallet: jest.fn(),
}))

jest.mock("@/app/wallets/get-balance-for-wallet", () => ({
  getBalanceForWallet: jest.fn(),
}))

jest.mock("@/services/ledger/caching", () => ({
  getBankOwnerWalletId: jest.fn(),
}))

jest.mock("@/services/mongoose", () => ({
  __mocks: {
    findAccountById: jest.fn(),
    findAccountWalletsByAccountId: jest.fn(),
    addFlowStep: jest.fn(),
    clearFlowTopUp: jest.fn(),
  },
  AccountsRepository: () => ({
    findById: jest.requireMock("@/services/mongoose").__mocks.findAccountById,
  }),
  MigrationFlowStateRepository: () => ({
    addStep: jest.requireMock("@/services/mongoose").__mocks.addFlowStep,
    clearTopUp: jest.requireMock("@/services/mongoose").__mocks.clearFlowTopUp,
  }),
  WalletsRepository: () => ({
    findAccountWalletsByAccountId:
      jest.requireMock("@/services/mongoose").__mocks.findAccountWalletsByAccountId,
  }),
}))

jest.mock("@/services/tracing", () => ({
  recordExceptionInCurrentSpan: jest.fn(),
  wrapAsyncToRunInSpan: ({ fn }: { fn: unknown }) => fn,
}))

import { reclaimMigrationTopUp } from "@/app/migration-flow/reclaim-top-up"
import { intraledgerPaymentSendWalletIdForBtcWallet } from "@/app/payments/send-intraledger"
import { getBalanceForWallet } from "@/app/wallets/get-balance-for-wallet"
import { AccountStatus } from "@/domain/accounts"
import { PaymentSendStatus, RouteNotFoundError } from "@/domain/bitcoin/lightning"
import { CouldNotFindError } from "@/domain/errors"
import { getBankOwnerWalletId } from "@/services/ledger/caching"
import { recordExceptionInCurrentSpan } from "@/services/tracing"

const mocks = jest.requireMock("@/services/mongoose").__mocks as {
  findAccountById: jest.Mock
  findAccountWalletsByAccountId: jest.Mock
  addFlowStep: jest.Mock
  clearFlowTopUp: jest.Mock
}
const mockIntraledgerSend = intraledgerPaymentSendWalletIdForBtcWallet as jest.Mock
const mockGetBalanceForWallet = getBalanceForWallet as jest.Mock
const mockGetBankOwnerWalletId = getBankOwnerWalletId as jest.Mock
const mockRecordException = recordExceptionInCurrentSpan as jest.Mock

describe("reclaimMigrationTopUp", () => {
  const accountId = "account-id" as AccountId
  const account = { id: accountId, status: AccountStatus.Active } as Account
  const btcWalletId = "btc-wallet-id" as WalletId
  const bankOwnerWalletId = "bank-owner-wallet-id" as WalletId
  const topUpSats = 10 as Satoshis

  beforeEach(() => {
    jest.clearAllMocks()
    mocks.findAccountById.mockResolvedValue(account)
    mocks.findAccountWalletsByAccountId.mockResolvedValue({
      BTC: { id: btcWalletId },
      USD: { id: "usd-wallet-id" as WalletId },
    })
    mocks.addFlowStep.mockResolvedValue({} as MigrationFlow)
    mocks.clearFlowTopUp.mockResolvedValue({} as MigrationFlow)
    mockGetBalanceForWallet.mockResolvedValue(60)
    mockGetBankOwnerWalletId.mockResolvedValue(bankOwnerWalletId)
    mockIntraledgerSend.mockResolvedValue({ status: PaymentSendStatus.Success })
  })

  it("returns the full top-up to the bank owner and clears the persisted amount", async () => {
    await reclaimMigrationTopUp({ accountId, topUpSats })

    expect(mockIntraledgerSend).toHaveBeenCalledTimes(1)
    expect(mockIntraledgerSend).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientWalletId: bankOwnerWalletId,
        amount: 10,
        senderWalletId: btcWalletId,
        senderAccount: account,
        memo: "custodial migration top-up reclaim",
      }),
    )
    expect(mocks.clearFlowTopUp).toHaveBeenCalledTimes(1)
    expect(mocks.clearFlowTopUp).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId,
        step: expect.objectContaining({
          step: "top-up-reclaimed",
          detail: expect.stringContaining("10 sats"),
        }),
      }),
    )
  })

  it("clamps the reclaim to the live balance when it is below the top-up", async () => {
    mockGetBalanceForWallet.mockResolvedValue(6)

    await reclaimMigrationTopUp({ accountId, topUpSats })

    expect(mockIntraledgerSend).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 6 }),
    )
  })

  it("records a failed reclaim without sending when no balance remains", async () => {
    mockGetBalanceForWallet.mockResolvedValue(0)

    await reclaimMigrationTopUp({ accountId, topUpSats })

    expect(mockIntraledgerSend).not.toHaveBeenCalled()
    expect(mocks.clearFlowTopUp).not.toHaveBeenCalled()
    expect(mocks.addFlowStep).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId,
        step: expect.objectContaining({ step: "top-up-reclaim-failed" }),
      }),
    )
  })

  it("keeps the persisted top-up when the reclaim send fails", async () => {
    const sendError = new RouteNotFoundError()
    mockIntraledgerSend.mockResolvedValue(sendError)

    await reclaimMigrationTopUp({ accountId, topUpSats })

    expect(mocks.clearFlowTopUp).not.toHaveBeenCalled()
    expect(mocks.addFlowStep).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId,
        step: expect.objectContaining({ step: "top-up-reclaim-failed" }),
      }),
    )
    expect(mockRecordException).toHaveBeenCalledWith(
      expect.objectContaining({ error: sendError }),
    )
  })

  it("records a failed reclaim when the account lookup errors", async () => {
    mocks.findAccountById.mockResolvedValue(new CouldNotFindError(accountId))

    await reclaimMigrationTopUp({ accountId, topUpSats })

    expect(mockIntraledgerSend).not.toHaveBeenCalled()
    expect(mocks.addFlowStep).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId,
        step: expect.objectContaining({ step: "top-up-reclaim-failed" }),
      }),
    )
  })

  it("records a failed reclaim when the bank-owner lookup throws", async () => {
    mockGetBankOwnerWalletId.mockRejectedValue(new Error("resolver missing"))

    await expect(reclaimMigrationTopUp({ accountId, topUpSats })).resolves.toBeUndefined()

    expect(mockIntraledgerSend).not.toHaveBeenCalled()
    expect(mocks.addFlowStep).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId,
        step: expect.objectContaining({ step: "top-up-reclaim-failed" }),
      }),
    )
  })

  it("swallows a clear failure after a successful reclaim", async () => {
    mocks.clearFlowTopUp.mockResolvedValue(new CouldNotFindError(accountId))

    await expect(reclaimMigrationTopUp({ accountId, topUpSats })).resolves.toBeUndefined()

    expect(mockIntraledgerSend).toHaveBeenCalledTimes(1)
    expect(mockRecordException).toHaveBeenCalled()
  })
})
