jest.mock("@/app/wallets/decline-single-pending-invoice", () => ({
  declineHeldInvoice: jest.fn(),
}))

jest.mock("@/app/wallets/update-single-pending-invoice", () => ({
  updatePendingInvoice: jest.fn(),
}))

jest.mock("@/app/wind-down/check-receive-allowed", () => ({
  checkReceiveAllowed: jest.fn(),
  isReceiveEnforcementArmed: jest.fn(),
}))

jest.mock("@/services/mongoose", () => ({
  __mocks: {
    findAccountById: jest.fn(),
    findByPaymentHash: jest.fn(),
  },
  AccountsRepository: () => ({
    findById: jest.requireMock("@/services/mongoose").__mocks.findAccountById,
  }),
  WalletInvoicesRepository: () => ({
    findByPaymentHash: jest.requireMock("@/services/mongoose").__mocks.findByPaymentHash,
  }),
}))

import { handleHeldInvoiceByPaymentHash } from "@/app/wallets/handle-held-invoices"

import { declineHeldInvoice } from "@/app/wallets/decline-single-pending-invoice"
import { updatePendingInvoice } from "@/app/wallets/update-single-pending-invoice"
import {
  checkReceiveAllowed,
  isReceiveEnforcementArmed,
} from "@/app/wind-down/check-receive-allowed"

import { ReceiveDisabledError } from "@/domain/wind-down"
import { UnknownRepositoryError } from "@/domain/errors"

const mocks = jest.requireMock("@/services/mongoose").__mocks as {
  findAccountById: jest.Mock
  findByPaymentHash: jest.Mock
}
const mockDecline = declineHeldInvoice as unknown as jest.Mock
const mockUpdate = updatePendingInvoice as unknown as jest.Mock
const mockCheckReceiveAllowed = checkReceiveAllowed as jest.Mock
const mockIsArmed = isReceiveEnforcementArmed as jest.Mock

const paymentHash = "payment-hash" as PaymentHash
const accountId = crypto.randomUUID() as AccountId
const logger = { child: () => logger } as unknown as Logger

const walletInvoice = {
  paymentHash,
  pubkey: "pubkey" as Pubkey,
  recipientWalletDescriptor: {
    id: crypto.randomUUID() as WalletId,
    currency: "BTC",
    accountId,
  },
  paid: false,
  processingCompleted: false,
  createdAt: new Date(),
  // far from expiry so WalletInvoiceChecker does not decline on its own
  lnInvoice: { expiresAt: new Date(Date.now() + 1000 * 60 * 60) },
} as unknown as WalletInvoiceWithOptionalLnInvoice

describe("handleHeldInvoiceByPaymentHash wind-down routing", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mocks.findByPaymentHash.mockResolvedValue(walletInvoice)
    mocks.findAccountById.mockResolvedValue({ id: accountId } as Account)
    mockDecline.mockResolvedValue(true)
    mockUpdate.mockResolvedValue(true)
  })

  it("settles normally and loads no account while enforcement is dark", async () => {
    mockIsArmed.mockReturnValue(false)

    await handleHeldInvoiceByPaymentHash({ paymentHash, logger })

    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockDecline).not.toHaveBeenCalled()
    expect(mocks.findAccountById).not.toHaveBeenCalled()
    expect(mockCheckReceiveAllowed).not.toHaveBeenCalled()
  })

  it("declines the held invoice when the recipient is receive-disabled", async () => {
    mockIsArmed.mockReturnValue(true)
    mockCheckReceiveAllowed.mockResolvedValue(new ReceiveDisabledError())

    await handleHeldInvoiceByPaymentHash({ paymentHash, logger })

    expect(mockDecline).toHaveBeenCalledTimes(1)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("settles normally when the recipient is not in the cohort", async () => {
    mockIsArmed.mockReturnValue(true)
    mockCheckReceiveAllowed.mockResolvedValue(true)

    await handleHeldInvoiceByPaymentHash({ paymentHash, logger })

    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockDecline).not.toHaveBeenCalled()
  })

  it("leaves the invoice pending when the check errors", async () => {
    const repoError = new UnknownRepositoryError("boom")
    mockIsArmed.mockReturnValue(true)
    mockCheckReceiveAllowed.mockResolvedValue(repoError)

    const result = await handleHeldInvoiceByPaymentHash({ paymentHash, logger })

    expect(result).toBe(repoError)
    expect(mockDecline).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("leaves the invoice pending when the account lookup errors", async () => {
    const repoError = new UnknownRepositoryError("boom")
    mockIsArmed.mockReturnValue(true)
    mocks.findAccountById.mockResolvedValue(repoError)

    const result = await handleHeldInvoiceByPaymentHash({ paymentHash, logger })

    expect(result).toBe(repoError)
    expect(mockDecline).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
