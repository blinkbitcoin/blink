const mockRecordOnChainSendRevert = jest.fn()
const mockReverseSpending = jest.fn()
const mockRecordExceptionInCurrentSpan = jest.fn()

jest.mock("@/app", () => ({
  Wallets: {},
  OnChain: {},
}))

jest.mock("@/services/ledger/facade", () => ({
  recordOnChainSendRevert: (...args: unknown[]) => mockRecordOnChainSendRevert(...args),
}))

jest.mock("@/services/api-keys", () => ({
  ApiKeysService: () => ({
    reverseSpending: (...args: unknown[]) => mockReverseSpending(...args),
  }),
}))

jest.mock("@/services/bria", () => ({
  BriaPayloadType: {
    UtxoDetected: "utxo_detected",
    UtxoDropped: "utxo_dropped",
    UtxoSettled: "utxo_settled",
    PayoutSubmitted: "payout_submitted",
    PayoutCommitted: "payout_committed",
    PayoutCancelled: "payout_cancelled",
    PayoutBroadcast: "payout_broadcast",
    PayoutSettled: "payout_settled",
  },
}))

jest.mock("@/services/tracing", () => ({
  recordExceptionInCurrentSpan: (...args: unknown[]) =>
    mockRecordExceptionInCurrentSpan(...args),
  addAttributesToCurrentSpan: jest.fn(),
}))

import { payoutCancelledEventHandler } from "@/servers/event-handlers/bria"

import { NoTransactionToUpdateError } from "@/domain/errors"
import { ApiKeySpendingRecordError } from "@/domain/api-keys/errors"

describe("payoutCancelledEventHandler", () => {
  const payoutInfo = {
    id: "payout-id",
    externalId: "journal-id",
  } as PayoutAugmentation

  const event = {
    type: "payout_cancelled",
    id: "payout-id",
    satoshis: { amount: 1000n, currency: "BTC" },
    address: "bcrt1qtestaddress",
  } as PayoutCancelled

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("reverses api key spending after payout cancellation", async () => {
    mockRecordOnChainSendRevert.mockResolvedValue(true)
    mockReverseSpending.mockResolvedValue(true)

    const result = await payoutCancelledEventHandler({ event, payoutInfo })

    expect(result).toBe(true)
    expect(mockRecordOnChainSendRevert).toHaveBeenCalledWith({
      journalId: payoutInfo.externalId,
      payoutId: event.id,
    })
    expect(mockReverseSpending).toHaveBeenCalledWith({
      transactionId: payoutInfo.externalId,
    })
  })

  it("records trace exception when api key reversal fails", async () => {
    const reverseError = new ApiKeySpendingRecordError()

    mockRecordOnChainSendRevert.mockResolvedValue(true)
    mockReverseSpending.mockResolvedValue(reverseError)

    const result = await payoutCancelledEventHandler({ event, payoutInfo })

    expect(result).toBe(true)
    expect(mockRecordExceptionInCurrentSpan).toHaveBeenCalledWith({
      error: reverseError,
      attributes: {
        "apiKeys.reverseSpending.failed": true,
        "journalId": payoutInfo.externalId,
      },
    })
  })

  it("keeps idempotent behavior when ledger transaction is not found", async () => {
    mockRecordOnChainSendRevert.mockResolvedValue(new NoTransactionToUpdateError())

    const result = await payoutCancelledEventHandler({ event, payoutInfo })

    expect(result).toBe(true)
    expect(mockReverseSpending).not.toHaveBeenCalled()
  })
})
