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
    findAccountById: jest.fn(),
    findWalletById: jest.fn(),
    addFlowStep: jest.fn(),
    updateFlowPhase: jest.fn(),
  },
  AccountsRepository: () => ({
    findById: jest.requireMock("@/services/mongoose").__mocks.findAccountById,
  }),
  MigrationFlowStateRepository: () => ({
    addStep: jest.requireMock("@/services/mongoose").__mocks.addFlowStep,
    updatePhase: jest.requireMock("@/services/mongoose").__mocks.updateFlowPhase,
  }),
  WalletsRepository: () => ({
    findById: jest.requireMock("@/services/mongoose").__mocks.findWalletById,
  }),
}))

jest.mock("@/services/tracing", () => ({
  recordExceptionInCurrentSpan: jest.fn(),
}))

import { executeMigrationTransfer } from "@/app/migration-flow/execute-transfer"
import { completeMigrationFlowForSettledPayment } from "@/app/migration-flow/settle-migration-flow"
import { intraledgerPaymentSendWalletIdForBtcWallet } from "@/app/payments/send-intraledger"
import { payNoAmountInvoiceByWalletId } from "@/app/payments/send-lightning"
import { getBalanceForWallet } from "@/app/wallets/get-balance-for-wallet"
import { AccountStatus } from "@/domain/accounts"
import { PaymentSendStatus, RouteNotFoundError } from "@/domain/bitcoin/lightning"
import { getCustodialMigrationFlowConfig } from "@/config"
import { InsufficientBalanceError } from "@/domain/errors"
import { MigrationFlowPhase, MigrationStateConflictError } from "@/domain/migration-flow"
import { InvalidBtcPaymentAmountError } from "@/domain/shared"
import { getBankOwnerWalletId } from "@/services/ledger/caching"

const mocks = jest.requireMock("@/services/mongoose").__mocks as {
  findAccountById: jest.Mock
  findWalletById: jest.Mock
  addFlowStep: jest.Mock
  updateFlowPhase: jest.Mock
}
const mockGetBalanceForWallet = getBalanceForWallet as jest.Mock
const mockPayNoAmountInvoice = payNoAmountInvoiceByWalletId as jest.Mock
const mockIntraledgerSend = intraledgerPaymentSendWalletIdForBtcWallet as jest.Mock
const mockGetBankOwnerWalletId = getBankOwnerWalletId as jest.Mock
const mockCompleteFlow = completeMigrationFlowForSettledPayment as jest.Mock
const mockGetMigrationConfig = getCustodialMigrationFlowConfig as jest.Mock

describe("executeMigrationTransfer", () => {
  const accountId = "account-id" as AccountId
  const account = { id: accountId, status: AccountStatus.Active } as Account
  const btcWalletId = "btc-wallet-id" as WalletId
  const paymentHash = "payment-hash" as PaymentHash
  const paymentRequest = "lnbc1noamountinvoice"
  const bankOwnerWalletId = "bank-owner-wallet-id" as WalletId
  const bankOwnerAccount = {
    id: "bank-owner-account-id" as AccountId,
    status: AccountStatus.Active,
  } as Account

  const transferArgs = { account, btcWalletId, paymentRequest, paymentHash }

  beforeEach(() => {
    jest.clearAllMocks()
    mocks.addFlowStep.mockResolvedValue({} as MigrationFlow)
    mocks.updateFlowPhase.mockResolvedValue({} as MigrationFlow)
    mocks.findWalletById.mockResolvedValue({
      id: bankOwnerWalletId,
      accountId: bankOwnerAccount.id,
    })
    mocks.findAccountById.mockResolvedValue(bankOwnerAccount)
    mockGetBankOwnerWalletId.mockResolvedValue(bankOwnerWalletId)
    mockIntraledgerSend.mockResolvedValue({ status: PaymentSendStatus.Success })
    mockPayNoAmountInvoice.mockResolvedValue({ status: PaymentSendStatus.Success })
    mockCompleteFlow.mockResolvedValue(undefined)
    mockGetMigrationConfig.mockReturnValue({ enabled: true, deMinimisThresholdSats: 100 })
  })

  it("skips the transfer and completes directly on a zero balance", async () => {
    mockGetBalanceForWallet.mockResolvedValue(0)

    const result = await executeMigrationTransfer(transferArgs)

    expect(result).toBe(PaymentSendStatus.Success)
    expect(mockPayNoAmountInvoice).not.toHaveBeenCalled()
    expect(mockIntraledgerSend).not.toHaveBeenCalled()
    expect(mockCompleteFlow).toHaveBeenCalledWith({ paymentHash })
  })

  it("tops up the reserve from the bank owner and drains the full dust balance", async () => {
    mockGetBalanceForWallet.mockResolvedValue(7)
    mockPayNoAmountInvoice.mockResolvedValue({ status: PaymentSendStatus.Pending })

    const result = await executeMigrationTransfer(transferArgs)

    expect(result).toBe(PaymentSendStatus.Pending)
    expect(mockIntraledgerSend).toHaveBeenCalledTimes(1)
    expect(mockIntraledgerSend).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientWalletId: btcWalletId,
        amount: 10,
        senderWalletId: bankOwnerWalletId,
        senderAccount: bankOwnerAccount,
      }),
    )
    expect(mockPayNoAmountInvoice).toHaveBeenCalledTimes(1)
    expect(mockPayNoAmountInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        uncheckedPaymentRequest: paymentRequest,
        amount: 7,
        senderWalletId: btcWalletId,
        senderAccount: account,
        skipChecks: true,
      }),
    )
  })

  it("fails the migration without paying when the dust top-up fails", async () => {
    mockGetBalanceForWallet.mockResolvedValue(5)
    const topUpError = new RouteNotFoundError()
    mockIntraledgerSend.mockResolvedValue(topUpError)

    const result = await executeMigrationTransfer(transferArgs)

    expect(result).toBe(topUpError)
    expect(mockPayNoAmountInvoice).not.toHaveBeenCalled()
    expect(mocks.updateFlowPhase).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId,
        fromPhase: MigrationFlowPhase.Transferring,
        toPhase: MigrationFlowPhase.Failed,
      }),
    )
  })

  it("fails the migration without moving bank-owner funds when the de-minimis top-up exceeds FEECAP_MIN", async () => {
    // reserve(2101) = 11 > FEECAP_MIN: a threshold past the proven bound
    // (threshold * bps > 10^4 * FEECAP_MIN + 5000) must trip the top-up guard
    mockGetMigrationConfig.mockReturnValue({ enabled: true, deMinimisThresholdSats: 5000 })
    mockGetBalanceForWallet.mockResolvedValue(2101)

    const result = await executeMigrationTransfer(transferArgs)

    expect(result).toBeInstanceOf(InvalidBtcPaymentAmountError)
    expect(mockIntraledgerSend).not.toHaveBeenCalled()
    expect(mockPayNoAmountInvoice).not.toHaveBeenCalled()
    expect(mocks.updateFlowPhase).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId,
        fromPhase: MigrationFlowPhase.Transferring,
        toPhase: MigrationFlowPhase.Failed,
      }),
    )
  })

  it("subsidizes a mid-range balance within the threshold, draining the full balance to zero", async () => {
    mockGetBalanceForWallet.mockResolvedValue(50)

    const result = await executeMigrationTransfer(transferArgs)

    expect(result).toBe(PaymentSendStatus.Success)
    expect(mockIntraledgerSend).toHaveBeenCalledTimes(1)
    expect(mockIntraledgerSend).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientWalletId: btcWalletId,
        amount: 10,
        senderWalletId: bankOwnerWalletId,
        senderAccount: bankOwnerAccount,
      }),
    )
    expect(mockPayNoAmountInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 50, skipChecks: true }),
    )
    const feeStep = mocks.addFlowStep.mock.calls.find(
      ([arg]) => arg.step.step === "reserve-top-up",
    )
    expect(feeStep).toBeDefined()
    expect(feeStep[0].step.detail).toMatch(/Spark network fee|de-minimis/i)
  })

  it("subsidizes exactly at the threshold (B = 100) and drains the full balance to zero", async () => {
    mockGetBalanceForWallet.mockResolvedValue(100)

    const result = await executeMigrationTransfer(transferArgs)

    expect(result).toBe(PaymentSendStatus.Success)
    expect(mockIntraledgerSend).toHaveBeenCalledTimes(1)
    expect(mockIntraledgerSend).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 10 }),
    )
    expect(mockPayNoAmountInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 100, skipChecks: true }),
    )
  })

  it("does not subsidize one sat above the threshold (B = 101) and drains A* with no top-up", async () => {
    mockGetBalanceForWallet.mockResolvedValue(101)

    const result = await executeMigrationTransfer(transferArgs)

    expect(result).toBe(PaymentSendStatus.Success)
    expect(mockIntraledgerSend).not.toHaveBeenCalled()
    expect(mockPayNoAmountInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 91, skipChecks: true }),
    )
  })

  it("reads the threshold from config so a non-default threshold subsidizes larger balances", async () => {
    mockGetMigrationConfig.mockReturnValue({
      enabled: true,
      deMinimisThresholdSats: 200,
    })
    mockGetBalanceForWallet.mockResolvedValue(150)

    const result = await executeMigrationTransfer(transferArgs)

    expect(result).toBe(PaymentSendStatus.Success)
    expect(mockIntraledgerSend).toHaveBeenCalledTimes(1)
    expect(mockIntraledgerSend).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 10 }),
    )
    expect(mockPayNoAmountInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 150, skipChecks: true }),
    )
  })

  it("pays the drain amount with skipChecks for a normal balance", async () => {
    mockGetBalanceForWallet.mockResolvedValue(5000)
    mockPayNoAmountInvoice.mockResolvedValue({ status: PaymentSendStatus.Pending })

    const result = await executeMigrationTransfer(transferArgs)

    expect(result).toBe(PaymentSendStatus.Pending)
    expect(mockIntraledgerSend).not.toHaveBeenCalled()
    expect(mockPayNoAmountInvoice).toHaveBeenCalledTimes(1)
    expect(mockPayNoAmountInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        uncheckedPaymentRequest: paymentRequest,
        amount: 4975,
        senderWalletId: btcWalletId,
        senderAccount: account,
        skipChecks: true,
      }),
    )
    expect(mockCompleteFlow).not.toHaveBeenCalled()
  })

  it("stays pending while the swap invoice is held in-flight", async () => {
    mockGetBalanceForWallet.mockResolvedValue(100_000)
    mockPayNoAmountInvoice.mockResolvedValue({ status: PaymentSendStatus.Pending })

    const result = await executeMigrationTransfer(transferArgs)

    expect(result).toBe(PaymentSendStatus.Pending)
    expect(mockCompleteFlow).not.toHaveBeenCalled()
    expect(mocks.updateFlowPhase).not.toHaveBeenCalled()
  })

  it("completes the migration when the payment settles synchronously", async () => {
    mockGetBalanceForWallet.mockResolvedValue(100_000)
    mockPayNoAmountInvoice.mockResolvedValue({ status: PaymentSendStatus.Success })

    const result = await executeMigrationTransfer(transferArgs)

    expect(result).toBe(PaymentSendStatus.Success)
    expect(mockCompleteFlow).toHaveBeenCalledTimes(1)
    expect(mockCompleteFlow).toHaveBeenCalledWith({ paymentHash })
  })

  it("flips the migration to FAILED and returns the error when no route is found", async () => {
    mockGetBalanceForWallet.mockResolvedValue(100_000)
    const routeError = new RouteNotFoundError()
    mockPayNoAmountInvoice.mockResolvedValue(routeError)

    const result = await executeMigrationTransfer(transferArgs)

    expect(result).toBe(routeError)
    expect(mocks.updateFlowPhase).toHaveBeenCalledTimes(1)
    expect(mocks.updateFlowPhase).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId,
        fromPhase: MigrationFlowPhase.Transferring,
        toPhase: MigrationFlowPhase.Failed,
      }),
    )
    expect(mockCompleteFlow).not.toHaveBeenCalled()
  })

  it("fails closed when a concurrent spend leaves the balance short at send time", async () => {
    mockGetBalanceForWallet.mockResolvedValue(100_000)
    const balanceAtSendTime = 40_000
    mockPayNoAmountInvoice.mockImplementation(async ({ amount }) =>
      amount > balanceAtSendTime
        ? new InsufficientBalanceError(
            `Payment amount '${amount}' sats exceeds balance '${balanceAtSendTime}'`,
          )
        : { status: PaymentSendStatus.Success },
    )

    const result = await executeMigrationTransfer(transferArgs)

    expect(result).toBeInstanceOf(InsufficientBalanceError)
    expect(mockPayNoAmountInvoice).toHaveBeenCalledTimes(1)
    expect(mocks.updateFlowPhase).toHaveBeenCalledTimes(1)
    expect(mocks.updateFlowPhase).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId,
        fromPhase: MigrationFlowPhase.Transferring,
        toPhase: MigrationFlowPhase.Failed,
      }),
    )
    expect(mockCompleteFlow).not.toHaveBeenCalled()
  })

  it("fails the migration when the invoice was already paid instead of completing", async () => {
    mockGetBalanceForWallet.mockResolvedValue(100_000)
    mockPayNoAmountInvoice.mockResolvedValue({ status: PaymentSendStatus.AlreadyPaid })

    const result = await executeMigrationTransfer(transferArgs)

    expect(result).toBeInstanceOf(MigrationStateConflictError)
    expect((result as Error).message).toBe("invoice already paid")
    expect(mocks.updateFlowPhase).toHaveBeenCalledTimes(1)
    expect(mocks.updateFlowPhase).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId,
        fromPhase: MigrationFlowPhase.Transferring,
        toPhase: MigrationFlowPhase.Failed,
      }),
    )
    expect(mockCompleteFlow).not.toHaveBeenCalled()
  })

  it("fails the migration on a negative balance without any send or top-up", async () => {
    mockGetBalanceForWallet.mockResolvedValue(-5)

    const result = await executeMigrationTransfer(transferArgs)

    expect(result).toBeInstanceOf(InvalidBtcPaymentAmountError)
    expect(mockIntraledgerSend).not.toHaveBeenCalled()
    expect(mockPayNoAmountInvoice).not.toHaveBeenCalled()
    expect(mockCompleteFlow).not.toHaveBeenCalled()
    expect(mocks.updateFlowPhase).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId,
        fromPhase: MigrationFlowPhase.Transferring,
        toPhase: MigrationFlowPhase.Failed,
      }),
    )
  })

  it("fails the migration when the balance lookup errors", async () => {
    const balanceError = new Error("balance unavailable") as ApplicationError
    mockGetBalanceForWallet.mockResolvedValue(balanceError)

    const result = await executeMigrationTransfer(transferArgs)

    expect(result).toBe(balanceError)
    expect(mockPayNoAmountInvoice).not.toHaveBeenCalled()
    expect(mocks.updateFlowPhase).toHaveBeenCalledWith(
      expect.objectContaining({
        fromPhase: MigrationFlowPhase.Transferring,
        toPhase: MigrationFlowPhase.Failed,
      }),
    )
  })
})
