jest.mock("@/app/inactivity-fee", () => ({
  recordActivity: jest.fn(),
}))

jest.mock("@/app/prices", () => ({
  btcFromUsdMidPriceFn: jest.fn(),
  usdFromBtcMidPriceFn: jest.fn(),
}))

jest.mock("@/services/lnd", () => ({
  LndService: jest.fn(),
}))

jest.mock("@/services/mongoose", () => ({
  AccountsRepository: jest.fn(),
  WalletInvoicesRepository: jest.fn(),
  WalletsRepository: jest.fn(),
}))

jest.mock("@/services/tracing", () => ({
  addAttributesToCurrentSpan: jest.fn(),
  recordExceptionInCurrentSpan: jest.fn(),
  wrapAsyncToRunInSpan: ({ fn }: { fn: unknown }) => fn,
}))

import { recordActivity } from "@/app/inactivity-fee"
import { recordSendActivity } from "@/app/payments/helpers"
import { UnknownRepositoryError } from "@/domain/errors"
import { ActivityKind } from "@/domain/inactivity-fee"
import { ErrorLevel } from "@/domain/shared"
import { recordExceptionInCurrentSpan } from "@/services/tracing"

const mockRecordActivity = recordActivity as jest.MockedFunction<typeof recordActivity>
const mockRecordException = recordExceptionInCurrentSpan as jest.MockedFunction<
  typeof recordExceptionInCurrentSpan
>

const accountId = "1c2b5a6e-1a2b-4c3d-8e9f-0a1b2c3d4e5f" as AccountId

describe("recordSendActivity", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("records a send and leaves the span clean on success", async () => {
    mockRecordActivity.mockResolvedValue({
      written: true,
      previousActivityAt: new Date("2026-09-01T00:00:00Z"),
    })

    await expect(recordSendActivity({ accountId })).resolves.toBeUndefined()

    expect(mockRecordActivity).toHaveBeenCalledWith({
      accountId,
      kind: ActivityKind.Send,
    })
    expect(mockRecordException).not.toHaveBeenCalled()
  })

  it("never fails the payment: an activity error is a Warn on the span and resolves void", async () => {
    const error = new UnknownRepositoryError("mongo down")
    mockRecordActivity.mockResolvedValue(error)

    await expect(recordSendActivity({ accountId })).resolves.toBeUndefined()

    expect(mockRecordException).toHaveBeenCalledTimes(1)
    expect(mockRecordException).toHaveBeenCalledWith(
      expect.objectContaining({ error, level: ErrorLevel.Warn }),
    )
  })
})
