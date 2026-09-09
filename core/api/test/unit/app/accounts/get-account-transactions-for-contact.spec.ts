jest.mock("@/config", () => ({
  LNURL_SERVER_LN_ADDRESS_DOMAIN: "blink.sv",
  MAX_PAGINATION_PAGE_SIZE: 100,
  memoSharingConfig: {
    memoSharingSatsThreshold: 0,
    memoSharingCentsThreshold: 0,
    authorizedMemoMedia: [],
  },
}))

jest.mock("@/services/ledger", () => ({
  LedgerService: jest.fn(),
  getNonEndUserWalletIds: jest.fn(),
}))

jest.mock("@/services/mongoose", () => ({
  WalletsRepository: jest.fn(),
}))

import { getAccountTransactionsForContact } from "@/app/accounts/get-account-transactions-for-contact"

import { UnknownLedgerError } from "@/domain/ledger/errors"
import {
  CouldNotListWalletsFromAccountIdError,
  InvalidPaginatedQueryArgsError,
} from "@/domain/errors"
import { getNonEndUserWalletIds, LedgerService } from "@/services/ledger"
import { WalletsRepository } from "@/services/mongoose"

const mockLedgerService = LedgerService as jest.MockedFunction<typeof LedgerService>
const mockGetNonEndUserWalletIds = getNonEndUserWalletIds as jest.MockedFunction<
  typeof getNonEndUserWalletIds
>
const mockWalletsRepository = WalletsRepository as jest.MockedFunction<
  typeof WalletsRepository
>

const mockGetTransactions = jest.fn()
const mockListByAccountId = jest.fn()

const account = { id: "account-id" as AccountId } as Account
const walletId = "wallet-id" as WalletId
const rawPaginationArgs = { first: 10 }

const emptyLedgerPage = {
  edges: [],
  pageInfo: { hasNextPage: false, hasPreviousPage: false },
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetNonEndUserWalletIds.mockResolvedValue({
    bankOwner: "bank-owner-wallet-id" as WalletId,
    funder: "funder-wallet-id" as WalletId,
    dealerBtc: "dealer-btc-wallet-id" as WalletId,
    dealerUsd: "dealer-usd-wallet-id" as WalletId,
  })
  mockListByAccountId.mockResolvedValue([{ id: walletId }])
  mockGetTransactions.mockResolvedValue(emptyLedgerPage)
  mockWalletsRepository.mockReturnValue({
    listByAccountId: mockListByAccountId,
  } as unknown as IWalletsRepository)
  mockLedgerService.mockReturnValue({
    getTransactionsByWalletIdAndContactUsername: mockGetTransactions,
  } as unknown as ILedgerService)
})

describe("getAccountTransactionsForContact", () => {
  it("queries the ledger with a legacy username handle", async () => {
    const result = await getAccountTransactionsForContact({
      account,
      contactHandle: "legacyuser" as Handle,
      rawPaginationArgs,
    })

    expect(mockGetTransactions).toHaveBeenCalledWith(
      expect.objectContaining({
        walletIds: [walletId],
        contactUsername: "legacyuser",
      }),
    )
    expect(result).toHaveProperty("edges", [])
  })

  it("queries the ledger with the local part of an address hosted by this instance", async () => {
    await getAccountTransactionsForContact({
      account,
      contactHandle: "alice@blink.sv" as Handle,
      rawPaginationArgs,
    })

    expect(mockGetTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ contactUsername: "alice" }),
    )
  })

  it("returns an empty page for an address hosted by another wallet", async () => {
    const result = await getAccountTransactionsForContact({
      account,
      contactHandle: "bob@otherwallet.example" as Handle,
      rawPaginationArgs,
    })

    expect(result).toEqual({
      edges: [],
      pageInfo: { hasNextPage: false, hasPreviousPage: false },
    })
    expect(mockGetTransactions).not.toHaveBeenCalled()
    expect(mockListByAccountId).not.toHaveBeenCalled()
  })

  it("returns an empty page when the local part is not a valid username", async () => {
    const result = await getAccountTransactionsForContact({
      account,
      contactHandle: "+50300000000@blink.sv" as Handle,
      rawPaginationArgs,
    })

    expect(result).toHaveProperty("edges", [])
    expect(mockGetTransactions).not.toHaveBeenCalled()
  })

  it("fails when the pagination args are invalid", async () => {
    const result = await getAccountTransactionsForContact({
      account,
      contactHandle: "legacyuser" as Handle,
      rawPaginationArgs: { first: 10, last: 10 },
    })

    expect(result).toBeInstanceOf(InvalidPaginatedQueryArgsError)
    expect(mockGetTransactions).not.toHaveBeenCalled()
  })

  it("propagates a wallets repository failure", async () => {
    mockListByAccountId.mockResolvedValue(new CouldNotListWalletsFromAccountIdError())

    const result = await getAccountTransactionsForContact({
      account,
      contactHandle: "legacyuser" as Handle,
      rawPaginationArgs,
    })

    expect(result).toBeInstanceOf(CouldNotListWalletsFromAccountIdError)
  })

  it("propagates a ledger failure", async () => {
    mockGetTransactions.mockResolvedValue(new UnknownLedgerError("boom"))

    const result = await getAccountTransactionsForContact({
      account,
      contactHandle: "legacyuser" as Handle,
      rawPaginationArgs,
    })

    expect(result).toBeInstanceOf(UnknownLedgerError)
  })
})
