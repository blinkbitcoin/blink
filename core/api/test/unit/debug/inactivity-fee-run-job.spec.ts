jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  existsSync: jest.fn(),
  writeFileSync: jest.fn(),
  appendFileSync: jest.fn(),
}))
jest.mock("@/app", () => ({
  __mocks: { runNoticeJob: jest.fn() },
  InactivityFee: {
    runNoticeJob: (...args: unknown[]) =>
      jest.requireMock("@/app").__mocks.runNoticeJob(...args),
  },
}))
jest.mock("@/config", () => ({
  getInactivityFeeConfig: jest.fn(),
  getCustomConfigSource: jest.fn(),
}))
jest.mock("@/services/mongodb", () => ({ setupMongoConnection: jest.fn() }))

import { existsSync, writeFileSync } from "fs"

import { getCustomConfigSource, getInactivityFeeConfig } from "@/config"
import { parseCliArgs, run } from "@/debug/inactivity-fee-run-job"
import { toCents } from "@/domain/fiat"
import { formatIsoDate } from "@/domain/inactivity-fee"
import { toSeconds } from "@/domain/primitives"

const { runNoticeJob: mockRunNoticeJob } = jest.requireMock("@/app").__mocks as {
  runNoticeJob: jest.Mock
}
const mockExistsSync = existsSync as jest.Mock
const mockWriteFileSync = writeFileSync as jest.Mock
const mockGetInactivityFeeConfig = getInactivityFeeConfig as jest.MockedFunction<
  typeof getInactivityFeeConfig
>
const mockGetCustomConfigSource = getCustomConfigSource as jest.MockedFunction<
  typeof getCustomConfigSource
>

const MOUNT = "/var/yaml/custom.yaml"

const now = new Date("2026-09-16T10:00:00Z")
const today = formatIsoDate({ date: now })
const yesterday = formatIsoDate({ date: new Date(now.getTime() - 24 * 3600 * 1000) })

const runResult = {
  runId: "notice-x",
  counts: { scanned: 0, accountsWithoutClock: 0, byOutcome: {}, bySkipReason: {} },
}

const parse = (argv: string[]) => {
  const args = parseCliArgs(argv, now)
  if (args instanceof Error) throw args
  return args
}

describe("inactivity-fee-run-job CLI", () => {
  let consoleLog: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers().setSystemTime(now)
    mockExistsSync.mockReturnValue(false)
    mockRunNoticeJob.mockResolvedValue(runResult)
    mockGetCustomConfigSource.mockReturnValue({
      path: MOUNT,
      defaultPath: MOUNT,
      loaded: false,
    })
    mockGetInactivityFeeConfig.mockReturnValue({
      activityRefreshIntervalSec: toSeconds(3600),
      liveCharging: false,
      feeAmountUsdCents: toCents(100),
      effectiveFrom: new Date("2026-10-15T00:00:00Z"),
      configVersion: "test",
      skipAccountIds: [],
      notPermittedCountries: [],
      level0Deadline: new Date("2026-10-31T22:59:59Z"),
      reactivationLockWaitMs: 1500,
      reactivationBudgetMs: 5000,
    })
    consoleLog = jest.spyOn(console, "log").mockImplementation(() => undefined)
  })

  afterEach(() => {
    consoleLog.mockRestore()
    jest.useRealTimers()
  })

  describe("parseCliArgs", () => {
    it("rejects a day that does not exist", () => {
      expect(parseCliArgs(["notice", "--as-of", "2026-02-30"], now)).toBeInstanceOf(Error)
    })

    it("refuses to overwrite an existing --out", () => {
      mockExistsSync.mockImplementation((path: string) => path === "/tmp/taken.csv")
      expect(
        parseCliArgs(["notice", "--as-of", today, "--out", "/tmp/taken.csv"], now),
      ).toBeInstanceOf(Error)
    })

    it("takes a leading positional as the config path", () => {
      expect(
        parse(["/var/yaml/custom.yaml", "notice", "--as-of", today]).configPath,
      ).toBe("/var/yaml/custom.yaml")
    })

    it("ignores the -- separator that pnpm run and the buck2 task wrapper forward", () => {
      const args = parse(["--", "notice", "--as-of", today, "--live"])
      expect(args.configPath).toBeUndefined()
      expect(args.live).toBe(true)
      expect(args.asOfDate).toBe(today)
    })
  })

  describe("run", () => {
    it("downgrades --live for a date that is not today to a forced dry run", async () => {
      expect(await run(parse(["notice", "--as-of", yesterday, "--live"]))).toBe(true)

      expect(mockRunNoticeJob).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: true, forcedDry: true }),
      )
    })

    it("runs live only for --live with today's date", async () => {
      expect(await run(parse(["notice", "--as-of", today, "--live"]))).toBe(true)

      expect(mockRunNoticeJob).toHaveBeenCalledWith(
        expect.objectContaining({
          dryRun: false,
          forcedDry: false,
          asOf: new Date(`${today}T00:00:00.000Z`),
          runId: expect.stringMatching(new RegExp(`^notice-${today}-`)),
        }),
      )
    })

    it("is a plain dry run without --live", async () => {
      expect(await run(parse(["notice", "--as-of", today]))).toBe(true)

      expect(mockRunNoticeJob).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: true, forcedDry: false }),
      )
    })

    it("writes the CSV header and the summary, and echoes the config source", async () => {
      await run(parse(["notice", "--as-of", today, "--out", "/tmp/out.csv"]))

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        "/tmp/out.csv",
        "account_id,outcome,reason,notice_id\n",
      )
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        "/tmp/out.csv.summary.json",
        expect.stringContaining(
          '"configSource": "/var/yaml/custom.yaml (not loaded → schema defaults)"',
        ),
      )
    })

    it("echoes the config path the loader actually read", async () => {
      mockGetCustomConfigSource.mockReturnValue({
        path: MOUNT,
        defaultPath: MOUNT,
        loaded: true,
      })

      await run(parse([MOUNT, "notice", "--as-of", today, "--out", "/tmp/out.csv"]))

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        "/tmp/out.csv.summary.json",
        expect.stringContaining('"configSource": "/var/yaml/custom.yaml (loaded)"'),
      )
    })

    it("refuses to run when the mounted custom.yaml was not loaded", async () => {
      mockExistsSync.mockImplementation((path: string) => path === MOUNT)

      expect(await run(parse(["notice", "--as-of", today, "--live"]))).toBeInstanceOf(
        Error,
      )
      expect(mockRunNoticeJob).not.toHaveBeenCalled()
      expect(mockWriteFileSync).not.toHaveBeenCalled()
    })

    it("refuses to run when the given config path is not the one the loader read", async () => {
      // buck2's forwarded `--` lands in argv[2], so the loader tried <cwd>/-- instead
      mockGetCustomConfigSource.mockReturnValue({
        path: "/work/core/api/--",
        defaultPath: MOUNT,
        loaded: false,
      })

      expect(
        await run(parse(["/etc/blink/custom.yaml", "notice", "--as-of", today])),
      ).toBeInstanceOf(Error)
      expect(mockRunNoticeJob).not.toHaveBeenCalled()
    })

    it("returns the run's error", async () => {
      const failure = new Error("aborted")
      mockRunNoticeJob.mockResolvedValue(failure)

      expect(await run(parse(["notice", "--as-of", today]))).toBe(failure)
    })
  })
})
