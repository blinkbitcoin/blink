import { processRecords } from "../../app/batch-payments/utils"
import { getUserDetailsAction } from "../../app/batch-payments/get-user-details-action"
import { AmountCurrency, CSVRecord } from "../../app/batch-payments/index.types"
import { WalletCurrency } from "@/services/graphql/generated"

// Mock the getUserDetailsAction
jest.mock("../../app/batch-payments/get-user-details-action")
const mockedGetUserDetailsAction = getUserDetailsAction as jest.MockedFunction<
  typeof getUserDetailsAction
>

describe("processRecords - Batch Validation Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should collect all invalid usernames and return aggregated error message", async () => {
    const records: CSVRecord[] = [
      {
        username: "valid_user1",
        amount: "100",
        currency: AmountCurrency.SATS,
        wallet: WalletCurrency.Btc,
      },
      {
        username: "invalid_user1",
        amount: "50",
        currency: AmountCurrency.SATS,
        wallet: WalletCurrency.Btc,
      },
      {
        username: "invalid_user2",
        amount: "75",
        currency: AmountCurrency.USD,
        wallet: WalletCurrency.Usd,
      },
      {
        username: "valid_user2",
        amount: "200",
        currency: AmountCurrency.SATS,
        wallet: WalletCurrency.Btc,
      },
    ]

    // Mock responses for each username
    mockedGetUserDetailsAction
      .mockResolvedValueOnce({
        error: false,
        message: "success",
        responsePayload: {
          data: {
            accountDefaultWallet: {
              id: "wallet-id-1",
              walletCurrency: WalletCurrency.Btc,
            },
          },
        },
      })
      .mockResolvedValueOnce({
        error: true,
        message: "User not found",
        responsePayload: null,
      })
      .mockResolvedValueOnce({
        error: true,
        message: "Invalid username format",
        responsePayload: null,
      })
      .mockResolvedValueOnce({
        error: false,
        message: "success",
        responsePayload: {
          data: {
            accountDefaultWallet: {
              id: "wallet-id-2",
              walletCurrency: WalletCurrency.Btc,
            },
          },
        },
      })

    const result = await processRecords({ records })

    // Should return an error
    expect(result).toBeInstanceOf(Error)

    if (result instanceof Error) {
      // Error message should contain count and both invalid usernames
      expect(result.message).toContain("2 Invalid username(s) found:")
      expect(result.message).toContain("invalid_user1")
      expect(result.message).toContain("invalid_user2")
      expect(result.message).toContain("User not found")
      expect(result.message).toContain("Invalid username format")
    }
  })

  it("should process all valid usernames successfully", async () => {
    const records: CSVRecord[] = [
      {
        username: "valid_user1",
        amount: "100",
        currency: AmountCurrency.SATS,
        wallet: WalletCurrency.Btc,
      },
      {
        username: "valid_user2",
        amount: "200",
        currency: AmountCurrency.SATS,
        wallet: WalletCurrency.Btc,
      },
    ]

    mockedGetUserDetailsAction
      .mockResolvedValueOnce({
        error: false,
        message: "success",
        responsePayload: {
          data: {
            accountDefaultWallet: {
              id: "wallet-id-1",
              walletCurrency: WalletCurrency.Btc,
            },
          },
        },
      })
      .mockResolvedValueOnce({
        error: false,
        message: "success",
        responsePayload: {
          data: {
            accountDefaultWallet: {
              id: "wallet-id-2",
              walletCurrency: WalletCurrency.Btc,
            },
          },
        },
      })

    const result = await processRecords({ records })

    // Should return processed records array
    expect(Array.isArray(result)).toBe(true)
    if (Array.isArray(result)) {
      expect(result).toHaveLength(2)
      expect(result[0].username).toBe("valid_user1")
      expect(result[0].recipientWalletId).toBe("wallet-id-1")
      expect(result[1].username).toBe("valid_user2")
      expect(result[1].recipientWalletId).toBe("wallet-id-2")
    }
  })

  it("should skip records with zero or negative amounts", async () => {
    const records: CSVRecord[] = [
      {
        username: "user1",
        amount: "0",
        currency: AmountCurrency.SATS,
        wallet: WalletCurrency.Btc,
      },
      {
        username: "user2",
        amount: "100",
        currency: AmountCurrency.SATS,
        wallet: WalletCurrency.Btc,
      },
    ]

    mockedGetUserDetailsAction.mockResolvedValueOnce({
      error: false,
      message: "success",
      responsePayload: {
        data: {
          accountDefaultWallet: {
            id: "wallet-id-2",
            walletCurrency: WalletCurrency.Btc,
          },
        },
      },
    })

    const result = await processRecords({ records })

    // Should only process the second record
    expect(Array.isArray(result)).toBe(true)
    if (Array.isArray(result)) {
      expect(result).toHaveLength(1)
      expect(result[0].username).toBe("user2")
    }
  })

  it("should handle case where no wallet is found for a user", async () => {
    const records: CSVRecord[] = [
      {
        username: "user_without_wallet",
        amount: "100",
        currency: AmountCurrency.SATS,
        wallet: WalletCurrency.Btc,
      },
    ]

    mockedGetUserDetailsAction.mockResolvedValueOnce({
      error: false,
      message: "success",
      responsePayload: null,
    })

    const result = await processRecords({ records })

    expect(result).toBeInstanceOf(Error)
    if (result instanceof Error) {
      expect(result.message).toContain("1 Invalid username(s) found:")
      expect(result.message).toContain("user_without_wallet")
      expect(result.message).toContain("No wallet found for this user")
    }
  })

  it("should return empty array for empty records input", async () => {
    const records: CSVRecord[] = []

    const result = await processRecords({ records })

    expect(Array.isArray(result)).toBe(true)
    if (Array.isArray(result)) {
      expect(result).toHaveLength(0)
    }
  })

  it("should return all errors when every username is invalid", async () => {
    const records: CSVRecord[] = [
      {
        username: "bad_user1",
        amount: "100",
        currency: AmountCurrency.SATS,
        wallet: WalletCurrency.Btc,
      },
      {
        username: "bad_user2",
        amount: "200",
        currency: AmountCurrency.SATS,
        wallet: WalletCurrency.Btc,
      },
      {
        username: "bad_user3",
        amount: "300",
        currency: AmountCurrency.USD,
        wallet: WalletCurrency.Usd,
      },
    ]

    mockedGetUserDetailsAction
      .mockResolvedValueOnce({
        error: true,
        message: "User not found",
        responsePayload: null,
      })
      .mockResolvedValueOnce({
        error: true,
        message: "Invalid username",
        responsePayload: null,
      })
      .mockResolvedValueOnce({
        error: false,
        message: "success",
        responsePayload: null,
      })

    const result = await processRecords({ records })

    expect(result).toBeInstanceOf(Error)
    if (result instanceof Error) {
      expect(result.message).toContain("3 Invalid username(s) found:")
      expect(result.message).toContain("bad_user1")
      expect(result.message).toContain("bad_user2")
      expect(result.message).toContain("bad_user3")
    }
  })
})
