jest.mock("@/config", () => ({
  getDefaultAccountsConfig: jest.fn().mockReturnValue({ maxDeletions: 2 }),
}))

jest.mock("@/app/merchants", () => ({
  deleteMerchantByUsername: jest.fn().mockResolvedValue(true),
}))

jest.mock("@/app/wallets", () => ({
  getBalanceForWallet: jest.fn(),
  listWalletsByAccountId: jest.fn(),
}))

jest.mock("@/app/payments", () => ({
  intraledgerPaymentSendWalletId: jest.fn(),
}))

jest.mock("@/domain/accounts", () => ({
  AccountStatus: { Closed: "closed" },
  AccountValidator: jest.fn(),
  InvalidAccountForDeletionError: class InvalidAccountForDeletionError extends Error {
    constructor(msg?: string) {
      super(msg ?? "invalid account for deletion")
    }
  },
}))

jest.mock("@/domain/authentication/errors", () => ({
  AccountHasPositiveBalanceError: class AccountHasPositiveBalanceError extends Error {
    constructor(msg: string) {
      super(msg)
    }
  },
}))

jest.mock("@/services/kratos", () => ({
  IdentityRepository: jest.fn().mockReturnValue({
    deleteIdentity: jest.fn().mockResolvedValue(true),
  }),
}))

jest.mock("@/services/tracing", () => ({
  addAttributesToCurrentSpan: jest.fn(),
  addEventToCurrentSpan: jest.fn(),
}))

jest.mock("@/services/ledger/caching", () => ({
  getBankOwnerWalletId: jest.fn(),
}))

jest.mock("@/services/mongoose", () => ({
  AccountsRepository: jest.fn(),
  UsersRepository: jest.fn(),
  WalletsRepository: jest.fn(),
}))

import { markAccountForDeletion } from "@/app/accounts/mark-account-for-deletion"
import { getBalanceForWallet, listWalletsByAccountId } from "@/app/wallets"
import { intraledgerPaymentSendWalletId } from "@/app/payments"
import { AccountValidator, InvalidAccountForDeletionError } from "@/domain/accounts"
import { AccountHasPositiveBalanceError } from "@/domain/authentication/errors"
import { getBankOwnerWalletId } from "@/services/ledger/caching"
import {
  AccountsRepository,
  UsersRepository,
  WalletsRepository,
} from "@/services/mongoose"
import { IdentityRepository } from "@/services/kratos"
import { addAttributesToCurrentSpan } from "@/services/tracing"

const mockListWalletsByAccountId = listWalletsByAccountId as jest.Mock
const mockGetBalanceForWallet = getBalanceForWallet as jest.Mock
const mockSendWalletId = intraledgerPaymentSendWalletId as jest.Mock
const mockAccountValidator = AccountValidator as jest.Mock
const mockGetBankOwnerWalletId = getBankOwnerWalletId as jest.Mock
const mockAddAttributesToCurrentSpan = addAttributesToCurrentSpan as jest.Mock

const mockAccountsRepo = {
  findById: jest.fn(),
  update: jest.fn(),
}

const mockUsersRepo = {
  findById: jest.fn(),
  update: jest.fn(),
  findByDeletedPhones: jest.fn(),
}

const mockWalletsRepo = {
  findById: jest.fn(),
}

const mockIdentities = {
  deleteIdentity: jest.fn(),
}

describe("markAccountForDeletion", () => {
  const accountId = "account-id" as AccountId
  const destinationAccountId = "destination-account-id" as AccountId
  const bankOwnerWalletId = "bank-owner-wallet-id" as WalletId
  const bankOwnerAccountId = "bank-owner-account-id" as AccountId

  const baseAccount = {
    id: accountId,
    kratosUserId: "kratos-user-id",
    defaultWalletId: "default-wallet-id" as WalletId,
    statusHistory: [],
    username: undefined,
    displayCurrency: "USD",
  }

  const baseUser = {
    id: "kratos-user-id",
    phone: "+15550000000" as PhoneNumber,
    deletedPhones: [],
  }

  const btcWallet = {
    id: "btc-wallet-id" as WalletId,
    currency: "BTC" as WalletCurrency,
    accountId,
  }

  const usdWallet = {
    id: "usd-wallet-id" as WalletId,
    currency: "USD" as WalletCurrency,
    accountId,
  }

  const bankOwnerWallet = {
    id: bankOwnerWalletId,
    currency: "BTC" as WalletCurrency,
    accountId: bankOwnerAccountId,
  }

  const bankOwnerAccount = {
    id: bankOwnerAccountId,
    defaultWalletId: bankOwnerWalletId,
  }

  const bankOwnerBtcWallet = {
    id: bankOwnerWalletId,
    currency: "BTC" as WalletCurrency,
    accountId: bankOwnerAccountId,
  }

  const bankOwnerUsdWallet = {
    id: "bank-owner-usd-wallet-id" as WalletId,
    currency: "USD" as WalletCurrency,
    accountId: bankOwnerAccountId,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(AccountsRepository as jest.Mock).mockReturnValue(mockAccountsRepo)
    ;(UsersRepository as jest.Mock).mockReturnValue(mockUsersRepo)
    ;(WalletsRepository as jest.Mock).mockReturnValue(mockWalletsRepo)
    ;(IdentityRepository as jest.Mock).mockReturnValue(mockIdentities)

    mockAccountsRepo.findById.mockResolvedValue(baseAccount)
    mockAccountsRepo.update.mockResolvedValue(baseAccount)
    mockUsersRepo.findById.mockResolvedValue(baseUser)
    mockUsersRepo.update.mockResolvedValue(baseUser)
    mockUsersRepo.findByDeletedPhones.mockResolvedValue([])
    mockIdentities.deleteIdentity.mockResolvedValue(true)
    mockListWalletsByAccountId.mockResolvedValue([btcWallet])
    mockGetBalanceForWallet.mockResolvedValue(0)
    mockAccountValidator.mockReturnValue({})
    mockGetBankOwnerWalletId.mockResolvedValue(bankOwnerWalletId)
    mockWalletsRepo.findById.mockResolvedValue(bankOwnerWallet)
    // by default destination is bankowner
    mockAccountsRepo.findById.mockImplementation((id: AccountId) => {
      if (id === accountId) return Promise.resolve(baseAccount)
      if (id === bankOwnerAccountId) return Promise.resolve(bankOwnerAccount)
      return Promise.resolve(new Error("not found"))
    })
    mockListWalletsByAccountId.mockImplementation((id: AccountId) => {
      if (id === accountId) return Promise.resolve([btcWallet])
      if (id === bankOwnerAccountId)
        return Promise.resolve([bankOwnerBtcWallet, bankOwnerUsdWallet])
      return Promise.resolve([])
    })
  })

  describe("without skipChecks", () => {
    it("validates account status before proceeding", async () => {
      const validationError = new Error("invalid account status")
      mockAccountValidator.mockReturnValue(validationError)

      const result = await markAccountForDeletion({ accountId })

      expect(result).toBe(validationError)
      expect(mockAccountValidator).toHaveBeenCalledWith(baseAccount, {
        skipChecks: false,
      })
    })

    it("returns error when wallet has positive balance", async () => {
      mockGetBalanceForWallet.mockResolvedValue(100)

      const result = await markAccountForDeletion({ accountId })

      expect(result).toBeInstanceOf(AccountHasPositiveBalanceError)
    })

    it("returns error when max deletions exceeded", async () => {
      mockUsersRepo.findByDeletedPhones.mockResolvedValue([
        { id: "user1" },
        { id: "user2" },
      ])

      const result = await markAccountForDeletion({ accountId })

      expect(result).toBeInstanceOf(InvalidAccountForDeletionError)
    })

    it("marks account for deletion when balance is zero", async () => {
      const result = await markAccountForDeletion({ accountId })

      expect(result).toBe(true)
      expect(mockAccountValidator).toHaveBeenCalledWith(baseAccount, {
        skipChecks: false,
      })
      expect(mockAccountsRepo.update).toHaveBeenCalled()
      expect(mockIdentities.deleteIdentity).toHaveBeenCalledWith(baseAccount.kratosUserId)
    })
  })

  describe("with skipChecks=true", () => {
    it("still calls AccountValidator with skipChecks=true (does not skip the call)", async () => {
      const validationError = new Error("invalid account status")
      mockAccountValidator.mockReturnValue(validationError)

      const result = await markAccountForDeletion({ accountId, skipChecks: true })

      expect(mockAccountValidator).toHaveBeenCalledWith(baseAccount, { skipChecks: true })
      // AccountValidator with skipChecks=true bypasses status check internally, so result depends on validator mock
      expect(result).toBe(validationError)
    })

    it("skips max deletions check when bypassMaxDeletions=true", async () => {
      mockUsersRepo.findByDeletedPhones.mockResolvedValue([
        { id: "user1" },
        { id: "user2" },
        { id: "user3" },
      ])

      const result = await markAccountForDeletion({
        accountId,
        skipChecks: true,
        bypassMaxDeletions: true,
      })

      expect(result).toBe(true)
      expect(mockUsersRepo.findByDeletedPhones).not.toHaveBeenCalled()
    })

    it("sweeps BTC balance to bankowner when no destinationAccountId", async () => {
      mockGetBalanceForWallet.mockResolvedValue(500)
      mockSendWalletId.mockResolvedValue({ status: "success" })

      const result = await markAccountForDeletion({ accountId, skipChecks: true })

      expect(result).toBe(true)
      expect(mockSendWalletId).toHaveBeenCalledWith(
        expect.objectContaining({
          senderWalletId: btcWallet.id,
          recipientWalletId: bankOwnerBtcWallet.id,
          amount: 500,
          senderAccount: baseAccount,
          skipChecks: true,
        }),
      )
    })

    it("falls back to destination defaultWalletId when no matching currency wallet", async () => {
      // bankowner only has BTC — no USD wallet
      mockListWalletsByAccountId.mockImplementation((id: AccountId) => {
        if (id === accountId) return Promise.resolve([usdWallet])
        if (id === bankOwnerAccountId) return Promise.resolve([bankOwnerBtcWallet])
        return Promise.resolve([])
      })
      mockGetBalanceForWallet.mockResolvedValue(200)
      mockSendWalletId.mockResolvedValue({ status: "success" })

      const result = await markAccountForDeletion({ accountId, skipChecks: true })

      expect(result).toBe(true)
      expect(mockSendWalletId).toHaveBeenCalledWith(
        expect.objectContaining({
          senderWalletId: usdWallet.id,
          recipientWalletId: bankOwnerAccount.defaultWalletId,
        }),
      )
    })

    it("returns payment error directly if sweep payment fails", async () => {
      mockGetBalanceForWallet.mockResolvedValue(500)
      const paymentError = new Error("payment failed")
      mockSendWalletId.mockResolvedValue(paymentError)

      const result = await markAccountForDeletion({ accountId, skipChecks: true })

      expect(result).toBe(paymentError)
    })

    it("skips sweep when balance is zero", async () => {
      mockGetBalanceForWallet.mockResolvedValue(0)

      const result = await markAccountForDeletion({ accountId, skipChecks: true })

      expect(result).toBe(true)
      expect(mockSendWalletId).not.toHaveBeenCalled()
    })

    it("returns InvalidAccountForDeletionError when destinationAccountId equals the account being deleted", async () => {
      mockGetBalanceForWallet.mockResolvedValue(500)
      // Override destination resolution: bank owner wallet resolves to the same account
      mockWalletsRepo.findById.mockResolvedValue({ ...bankOwnerWallet, accountId })
      mockAccountsRepo.findById.mockImplementation((id: AccountId) => {
        if (id === accountId) return Promise.resolve(baseAccount)
        return Promise.resolve(new Error("not found"))
      })

      const result = await markAccountForDeletion({ accountId, skipChecks: true })

      expect(result).toBeInstanceOf(InvalidAccountForDeletionError)
      expect((result as Error).message).toMatch(
        /Destination account cannot be the same as the account being deleted/,
      )
      expect(mockSendWalletId).not.toHaveBeenCalled()
    })

    it("returns InvalidAccountForDeletionError when explicit destinationAccountId equals the account being deleted", async () => {
      mockGetBalanceForWallet.mockResolvedValue(500)

      const result = await markAccountForDeletion({
        accountId,
        skipChecks: true,
        destinationAccountId: accountId,
      })

      expect(result).toBeInstanceOf(InvalidAccountForDeletionError)
      expect((result as Error).message).toMatch(
        /Destination account cannot be the same as the account being deleted/,
      )
      expect(mockSendWalletId).not.toHaveBeenCalled()
    })

    it("emits privilegedBypass span attributes when skipChecks=true", async () => {
      mockGetBalanceForWallet.mockResolvedValue(0)

      await markAccountForDeletion({
        accountId,
        skipChecks: true,
        updatedByPrivilegedClientId: "admin-client" as PrivilegedClientId,
      })

      expect(mockAddAttributesToCurrentSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          "markAccountForDeletion.privilegedBypass": true,
          "markAccountForDeletion.accountId": accountId,
          "markAccountForDeletion.updatedByPrivilegedClientId": "admin-client",
        }),
      )
    })

    it("does not emit privilegedBypass span attributes when skipChecks=false", async () => {
      mockGetBalanceForWallet.mockResolvedValue(0)

      await markAccountForDeletion({ accountId })

      expect(mockAddAttributesToCurrentSpan).not.toHaveBeenCalledWith(
        expect.objectContaining({ "markAccountForDeletion.privilegedBypass": true }),
      )
    })
  })

  describe("with destinationAccountId", () => {
    const destinationAccount = {
      id: destinationAccountId,
      defaultWalletId: "dest-default-wallet-id" as WalletId,
    }

    const destBtcWallet = {
      id: "dest-btc-wallet-id" as WalletId,
      currency: "BTC" as WalletCurrency,
      accountId: destinationAccountId,
    }

    const destUsdWallet = {
      id: "dest-usd-wallet-id" as WalletId,
      currency: "USD" as WalletCurrency,
      accountId: destinationAccountId,
    }

    beforeEach(() => {
      mockAccountsRepo.findById.mockImplementation((id: AccountId) => {
        if (id === accountId) return Promise.resolve(baseAccount)
        if (id === destinationAccountId) return Promise.resolve(destinationAccount)
        return Promise.resolve(new Error("not found"))
      })
      mockListWalletsByAccountId.mockImplementation((id: AccountId) => {
        if (id === accountId) return Promise.resolve([btcWallet])
        if (id === destinationAccountId)
          return Promise.resolve([destBtcWallet, destUsdWallet])
        return Promise.resolve([])
      })
      mockSendWalletId.mockResolvedValue({ status: "success" })
    })

    it("sweeps BTC balance to matching currency wallet in destination account", async () => {
      mockGetBalanceForWallet.mockResolvedValue(200)

      const result = await markAccountForDeletion({
        accountId,
        skipChecks: true,
        destinationAccountId,
      })

      expect(result).toBe(true)
      expect(mockSendWalletId).toHaveBeenCalledWith(
        expect.objectContaining({
          senderWalletId: btcWallet.id,
          recipientWalletId: destBtcWallet.id,
          amount: 200,
          senderAccount: baseAccount,
          skipChecks: true,
        }),
      )
    })

    it("returns payment error directly if sweep payment fails", async () => {
      mockGetBalanceForWallet.mockResolvedValue(200)
      const paymentError = new Error("payment failed")
      mockSendWalletId.mockResolvedValue(paymentError)

      const result = await markAccountForDeletion({
        accountId,
        skipChecks: true,
        destinationAccountId,
      })

      expect(result).toBe(paymentError)
    })

    it("skips sweep when balance is zero", async () => {
      mockGetBalanceForWallet.mockResolvedValue(0)

      const result = await markAccountForDeletion({
        accountId,
        skipChecks: true,
        destinationAccountId,
      })

      expect(result).toBe(true)
      expect(mockSendWalletId).not.toHaveBeenCalled()
    })
  })
})
