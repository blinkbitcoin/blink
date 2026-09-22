jest.mock("@/app", () => ({
  __mocks: { runNoticeJob: jest.fn(), runFeeJob: jest.fn() },
  InactivityFee: {
    runNoticeJob: (...args: unknown[]) =>
      jest.requireMock("@/app").__mocks.runNoticeJob(...args),
    runFeeJob: (...args: unknown[]) =>
      jest.requireMock("@/app").__mocks.runFeeJob(...args),
  },
  OnChain: {},
  Lightning: {},
  Wallets: {},
  Payments: {},
  Merchants: {},
}))
jest.mock("@/config", () => ({
  getCronConfig: jest.fn(),
  getInactivityFeeConfig: jest.fn(),
  TWO_MONTHS_IN_MS: 0,
}))
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

import { getInactivityFeeConfig } from "@/config"
import { InactivityFeeRunAbortedError } from "@/domain/inactivity-fee"
import { inactivityFeeFeeJob, inactivityFeeNoticeJob } from "@/servers/cron"
import { addAttributesToCurrentSpan } from "@/services/tracing"

const { runNoticeJob: mockRunNoticeJob, runFeeJob: mockRunFeeJob } = jest.requireMock(
  "@/app",
).__mocks as {
  runNoticeJob: jest.Mock
  runFeeJob: jest.Mock
}
const mockGetInactivityFeeConfig = getInactivityFeeConfig as jest.Mock
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

describe("cron inactivityFeeFeeJob", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRunFeeJob.mockResolvedValue({ runId: "run" })
    mockGetInactivityFeeConfig.mockReturnValue({ liveCharging: false })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("runs dry on the 15th (UTC) while liveCharging is off, with a dated run id", async () => {
    const now = new Date("2026-10-15T02:00:00Z")
    jest.useFakeTimers().setSystemTime(now)

    await inactivityFeeFeeJob()

    expect(mockRunFeeJob).toHaveBeenCalledTimes(1)
    expect(mockRunFeeJob).toHaveBeenCalledWith({
      asOf: now,
      dryRun: true,
      runId: expect.stringMatching(/^fee-2026-10-15-/),
    })
  })

  it("runs live on the 15th once liveCharging is on", async () => {
    const now = new Date("2026-11-15T02:00:00Z")
    jest.useFakeTimers().setSystemTime(now)
    mockGetInactivityFeeConfig.mockReturnValue({ liveCharging: true })

    await inactivityFeeFeeJob()

    expect(mockRunFeeJob).toHaveBeenCalledWith({
      asOf: now,
      dryRun: false,
      runId: expect.stringMatching(/^fee-2026-11-15-/),
    })
  })

  it("does nothing on any other day and says so on the span", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-16T02:00:00Z"))
    mockGetInactivityFeeConfig.mockReturnValue({ liveCharging: true })

    await inactivityFeeFeeJob()

    expect(mockRunFeeJob).not.toHaveBeenCalled()
    expect(mockAddAttributes).toHaveBeenCalledWith({
      "inactivityfee.fee.skipped": "not_fifteenth_of_month",
    })
  })

  it("throws when the run returns an error so the cron marks the task failed", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-15T02:00:00Z"))
    const aborted = new InactivityFeeRunAbortedError("dealer down")
    mockRunFeeJob.mockResolvedValue(aborted)

    await expect(inactivityFeeFeeJob()).rejects.toBe(aborted)
  })
})
