jest.mock("@/app", () => ({
  __mocks: { runNoticeJob: jest.fn() },
  InactivityFee: {
    runNoticeJob: (...args: unknown[]) =>
      jest.requireMock("@/app").__mocks.runNoticeJob(...args),
  },
  OnChain: {},
  Lightning: {},
  Wallets: {},
  Payments: {},
  Merchants: {},
}))
jest.mock("@/config", () => ({ getCronConfig: jest.fn(), TWO_MONTHS_IN_MS: 0 }))
jest.mock("@/services/tracing", () => ({
  addAttributesToCurrentSpan: jest.fn(),
  recordExceptionInCurrentSpan: jest.fn(),
  wrapAsyncToRunInSpan: jest.fn(),
}))
jest.mock("@/services/lnd/utils", () => ({
  deleteExpiredLightningPaymentFlows: jest.fn(),
  deleteFailedPaymentsAttemptAllLnds: jest.fn(),
  updateEscrows: jest.fn(),
  updateRoutingRevenues: jest.fn(),
}))
jest.mock("@/services/lnd/health", () => ({
  activateLndHealthCheck: jest.fn(),
  checkAllLndHealth: jest.fn(),
}))
jest.mock("@/services/lnd/rebalancing", () => ({
  rebalancingInternalChannels: jest.fn(),
}))
jest.mock("@/services/logger", () => ({
  baseLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}))
jest.mock("@/services/mongodb", () => ({ setupMongoConnection: jest.fn() }))
jest.mock("@/utils", () => ({ elapsedSinceTimestamp: jest.fn(), sleep: jest.fn() }))

import { InactivityFeeRunAbortedError } from "@/domain/inactivity-fee"
import { inactivityFeeNoticeJob } from "@/servers/cron"
import { addAttributesToCurrentSpan } from "@/services/tracing"

const { runNoticeJob: mockRunNoticeJob } = jest.requireMock("@/app").__mocks as {
  runNoticeJob: jest.Mock
}
const mockAddAttributes = addAttributesToCurrentSpan as jest.Mock

describe("cron inactivityFeeNoticeJob", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRunNoticeJob.mockResolvedValue({ runId: "run" })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("runs live on the 1st (UTC) as of now with a dated run id", async () => {
    const now = new Date("2026-10-01T02:00:00Z")
    jest.useFakeTimers().setSystemTime(now)

    await inactivityFeeNoticeJob()

    expect(mockRunNoticeJob).toHaveBeenCalledTimes(1)
    expect(mockRunNoticeJob).toHaveBeenCalledWith({
      asOf: now,
      dryRun: false,
      runId: expect.stringMatching(/^notice-2026-10-01-/),
    })
  })

  it("does nothing on any other day and says so on the span", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-02T02:00:00Z"))

    await inactivityFeeNoticeJob()

    expect(mockRunNoticeJob).not.toHaveBeenCalled()
    expect(mockAddAttributes).toHaveBeenCalledWith({
      "inactivityfee.notice.skipped": "not_first_of_month",
    })
  })

  it("throws when the run returns an error so the cron marks the task failed", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-01T02:00:00Z"))
    const aborted = new InactivityFeeRunAbortedError("cursor died")
    mockRunNoticeJob.mockResolvedValue(aborted)

    await expect(inactivityFeeNoticeJob()).rejects.toBe(aborted)
  })
})
