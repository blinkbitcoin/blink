jest.mock("@/services/tracing", () => ({
  recordExceptionInCurrentSpan: jest.fn(),
}))

jest.mock("@/services/api-keys", () => ({
  __mockApiKeys: {
    checkAndLockSpending: jest.fn(),
    recordSpending: jest.fn(),
    reverseSpending: jest.fn(),
  },
  ApiKeysService: () => ({
    checkAndLockSpending:
      jest.requireMock("@/services/api-keys").__mockApiKeys.checkAndLockSpending,
    recordSpending: jest.requireMock("@/services/api-keys").__mockApiKeys.recordSpending,
    reverseSpending:
      jest.requireMock("@/services/api-keys").__mockApiKeys.reverseSpending,
  }),
}))

import {
  lockApiKeySpending,
  recordApiKeySpendingSettlement,
  reverseApiKeySpendingSettlement,
  settleApiKeySpending,
} from "@/app/payments/api-key-spending"

const mockApiKeys = jest.requireMock("@/services/api-keys").__mockApiKeys as {
  checkAndLockSpending: jest.Mock
  recordSpending: jest.Mock
  reverseSpending: jest.Mock
}

describe("api-key-spending", () => {
  const apiKeyId = "api-key-id" as ApiKeyId
  const amount = { amount: 1000n, currency: "BTC" } as BtcPaymentAmount
  const ephemeralId = "ephemeral-id" as EphemeralId
  const journalId = "journal-id" as LedgerJournalId

  const lock = { apiKeyId, amount, ephemeralId }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("lockApiKeySpending", () => {
    it("returns undefined when apiKeyId is not provided", async () => {
      const result = await lockApiKeySpending({ amount })
      expect(result).toBeUndefined()
      expect(mockApiKeys.checkAndLockSpending).not.toHaveBeenCalled()
    })

    it("returns a lock when checkAndLockSpending succeeds", async () => {
      mockApiKeys.checkAndLockSpending.mockResolvedValue(ephemeralId)

      const result = await lockApiKeySpending({ apiKeyId, amount })

      expect(mockApiKeys.checkAndLockSpending).toHaveBeenCalledWith({ apiKeyId, amount })
      expect(result).toEqual({ apiKeyId, amount, ephemeralId })
    })

    it("returns error when checkAndLockSpending fails", async () => {
      const error = new Error("lock failed")
      mockApiKeys.checkAndLockSpending.mockResolvedValue(error)

      const result = await lockApiKeySpending({ apiKeyId, amount })

      expect(result).toBe(error)
    })
  })

  describe("settleApiKeySpending", () => {
    it("records spending for record settlement", async () => {
      mockApiKeys.recordSpending.mockResolvedValue(true)

      await settleApiKeySpending({
        lock,
        settlement: recordApiKeySpendingSettlement(journalId),
      })

      expect(mockApiKeys.recordSpending).toHaveBeenCalledWith({
        apiKeyId,
        amount,
        transactionId: journalId,
        ephemeralId,
      })
      expect(mockApiKeys.reverseSpending).not.toHaveBeenCalled()
    })

    it("reverses spending for reverse settlement", async () => {
      mockApiKeys.reverseSpending.mockResolvedValue(true)

      await settleApiKeySpending({
        lock,
        settlement: reverseApiKeySpendingSettlement(),
      })

      expect(mockApiKeys.reverseSpending).toHaveBeenCalledWith({
        transactionId: ephemeralId,
      })
      expect(mockApiKeys.recordSpending).not.toHaveBeenCalled()
    })
  })
})
