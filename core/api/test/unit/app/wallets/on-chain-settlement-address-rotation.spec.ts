jest.mock("@/app/wallets/create-on-chain-address", () => ({
  createOnChainAddress: jest.fn(),
}))

// barrels construct repositories at module scope; stub them out
jest.mock("@/app/accounts", () => ({ isValidatedMerchant: jest.fn() }))
jest.mock("@/app/prices", () => ({
  getCurrentPriceAsDisplayPriceRatio: jest.fn(),
  usdFromBtcMidPriceFn: jest.fn(),
}))

jest.mock("@/services/mongoose", () => ({
  __mocks: {
    findWalletByAddress: jest.fn(),
  },
  WalletsRepository: () => ({
    findByAddress: jest.requireMock("@/services/mongoose").__mocks.findWalletByAddress,
  }),
  UsersRepository: () => ({ findById: jest.fn() }),
  AccountsRepository: () => ({ findById: jest.fn() }),
  WalletOnChainPendingReceiveRepository: () => ({ remove: jest.fn() }),
}))

jest.mock("@/services/ledger", () => ({
  LedgerService: () => ({
    isOnChainReceiptTxRecordedForWallet:
      jest.requireMock("@/services/ledger").__mocks.isRecorded,
  }),
  __mocks: { isRecorded: jest.fn() },
}))

jest.mock("@/services/lock", () => ({
  LockService: () => ({
    lockOnChainTxHashAndVout: (_args: unknown, fn: () => Promise<unknown>) => fn(),
  }),
}))

jest.mock("@/services/redis", () => ({
  redis: {},
  redisPubSub: {},
  redisCache: {},
  disconnectAll: jest.fn(),
}))

import { addSettledTransaction } from "@/app/wallets/add-settled-on-chain-transaction"

import { createOnChainAddress } from "@/app/wallets/create-on-chain-address"
import { ReceiveDisabledError } from "@/domain/wind-down"
import { UnknownRepositoryError } from "@/domain/errors"

const mockCreateOnChainAddress = createOnChainAddress as jest.MockedFunction<
  typeof createOnChainAddress
>
const mockFindWalletByAddress =
  jest.requireMock("@/services/mongoose").__mocks.findWalletByAddress
const mockIsRecorded = jest.requireMock("@/services/ledger").__mocks.isRecorded

const NEW_ADDRESS_REQUEST_ID = "d1ea1b0a-0f5e-4d3f-9d0e-3c4a5b6c7d8e"

const settledEvent = {
  txId: "txhash" as OnChainTxHash,
  vout: 0 as OnChainTxVout,
  satoshis: { amount: 10_000n, currency: "BTC" },
  address: "bc1qaddress" as OnChainAddress,
} as Parameters<typeof addSettledTransaction>[0]

describe("addSettledTransaction — address rotation after settlement", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFindWalletByAddress.mockResolvedValue({
      id: "wallet-id" as WalletId,
      accountId: "account-id" as AccountId,
      currency: "BTC",
    })
    // already-recorded redelivery: short-circuits the ledger write and goes
    // straight to the rotation, which is the path that used to loop forever
    mockIsRecorded.mockResolvedValue({
      recorded: true,
      newAddressRequestId: NEW_ADDRESS_REQUEST_ID,
    })
  })

  it("tolerates a receive-disabled rotation so the bria event stream advances", async () => {
    mockCreateOnChainAddress.mockResolvedValue(new ReceiveDisabledError())

    const result = await addSettledTransaction(settledEvent)

    expect(result).toBe(true)
    expect(mockCreateOnChainAddress).toHaveBeenCalled()
  })

  it("still surfaces a genuine rotation failure", async () => {
    const error = new UnknownRepositoryError("bria down")
    mockCreateOnChainAddress.mockResolvedValue(error)

    const result = await addSettledTransaction(settledEvent)

    expect(result).toBe(error)
  })
})
