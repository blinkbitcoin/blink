jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  existsSync: jest.fn(),
  writeFileSync: jest.fn(),
  appendFileSync: jest.fn(),
}))
jest.mock("@/app", () => ({
  __mocks: { runNoticeJob: jest.fn(), runFeeJob: jest.fn() },
  InactivityFee: {
    runNoticeJob: (...args: unknown[]) =>
      jest.requireMock("@/app").__mocks.runNoticeJob(...args),
    runFeeJob: (...args: unknown[]) =>
      jest.requireMock("@/app").__mocks.runFeeJob(...args),
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

const { runNoticeJob: mockRunNoticeJob, runFeeJob: mockRunFeeJob } = jest.requireMock(
  "@/app",
).__mocks as {
  runNoticeJob: jest.Mock
  runFeeJob: jest.Mock
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
  })

  // The separator is stripped once, by the module the runner imports before the config loader
  // runs; parseCliArgs is handed the result and never sees it.
  describe("strip-argv-separator", () => {
    const loadCliArgv = (argv: string[]): string[] => {
      const saved = process.argv
      process.argv = argv
      let cliArgv: string[] = []
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        cliArgv = require("@/debug/strip-argv-separator").cliArgv
      })
      process.argv = saved
      return cliArgv
    }

    it("drops the separator buck2 forwards, leaving the config path first", () => {
      // buck2 run //core/api:dev-inactivity-fee-job -- /var/yaml/custom.yaml fee --as-of X
      expect(
        loadCliArgv([
          "/usr/bin/node",
          "/work/src/debug/inactivity-fee-run-job.ts",
          "--",
          MOUNT,
          "fee",
          "--as-of",
          today,
          "--live",
        ]),
      ).toEqual([MOUNT, "fee", "--as-of", today, "--live"])
    })

    it("leaves an invocation without a separator alone", () => {
      expect(
        loadCliArgv(["/usr/bin/node", "/work/run-job.ts", "notice", "--as-of", today]),
      ).toEqual(["notice", "--as-of", today])
    })

    it("also clears process.argv[2], which the config loader reads as its yaml path", () => {
      const saved = process.argv
      process.argv = ["/usr/bin/node", "/work/run-job.ts", "--", MOUNT, "fee"]
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports, import/no-unassigned-import
        require("@/debug/strip-argv-separator")
      })
      expect(process.argv[2]).toBe(MOUNT)
      process.argv = saved
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

  describe("fee job", () => {
    const feeResult = {
      runId: "fee-x",
      rate: 77566,
      rateSource: "dealer-mid",
      debited: { count: 1, sats: 1289, cents: 0 },
      counts: { scanned: 1, accountsWithoutClock: 0, byOutcome: {}, bySkipReason: {} },
    }

    beforeEach(() => {
      mockRunFeeJob.mockResolvedValue(feeResult)
    })

    it("rejects any job but notice or fee", () => {
      expect(parseCliArgs(["refund", "--as-of", today], now)).toBeInstanceOf(Error)
    })

    it("takes a leading positional as the config path before fee too", () => {
      const args = parse([MOUNT, "fee", "--as-of", today])
      expect(args.configPath).toBe(MOUNT)
      expect(args.job).toBe("fee")
    })

    it("names the default report after the job", () => {
      expect(parse(["fee", "--as-of", today]).out).toMatch(
        /^\/tmp\/inactivity-fee-fee-dry-run-/,
      )
      expect(parse(["notice", "--as-of", today]).out).toMatch(
        /^\/tmp\/inactivity-fee-notice-dry-run-/,
      )
    })

    it("is a plain dry run without --live, with a fee run id", async () => {
      expect(await run(parse(["fee", "--as-of", today]))).toBe(true)

      expect(mockRunNoticeJob).not.toHaveBeenCalled()
      expect(mockRunFeeJob).toHaveBeenCalledWith(
        expect.objectContaining({
          dryRun: true,
          forcedDry: false,
          asOf: new Date(`${today}T00:00:00.000Z`),
          runId: expect.stringMatching(new RegExp(`^fee-${today}-`)),
        }),
      )
    })

    it("downgrades --live for a date that is not today to a forced dry run", async () => {
      expect(await run(parse(["fee", "--as-of", yesterday, "--live"]))).toBe(true)

      expect(mockRunFeeJob).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: true, forcedDry: true }),
      )
    })

    it("runs live only for --live with today's date", async () => {
      expect(await run(parse(["fee", "--as-of", today, "--live"]))).toBe(true)

      expect(mockRunFeeJob).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: false, forcedDry: false }),
      )
    })

    it("writes the fee CSV header, one row per outcome, and the summary with the rate", async () => {
      const { appendFileSync } = jest.requireMock("fs") as { appendFileSync: jest.Mock }
      mockRunFeeJob.mockImplementation(async ({ onOutcome }: RunFeeJobArgs) => {
        await onOutcome?.({
          accountId: "acct" as AccountId,
          walletId: "wallet-btc" as WalletId,
          currency: "BTC",
          outcome: "would_charge",
          amount: 1289,
          externalId: "ifee_wallet-btc_2026-10" as LedgerExternalId,
          noticeId: "n1" as InactivityFeeNoticeId,
        })
        await onOutcome?.({
          accountId: "acct2" as AccountId,
          outcome: "skipped",
          reason: "flag_off",
        })
        return feeResult
      })

      await run(parse(["fee", "--as-of", today, "--out", "/tmp/fee.csv"]))

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        "/tmp/fee.csv",
        "account_id,wallet_id,currency,outcome,reason,amount,external_id,notice_id\n",
      )
      expect(appendFileSync).toHaveBeenNthCalledWith(
        1,
        "/tmp/fee.csv",
        "acct,wallet-btc,BTC,would_charge,,1289,ifee_wallet-btc_2026-10,n1\n",
      )
      expect(appendFileSync).toHaveBeenNthCalledWith(
        2,
        "/tmp/fee.csv",
        "acct2,,,skipped,flag_off,,,\n",
      )
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        "/tmp/fee.csv.summary.json",
        expect.stringContaining('"rate": 77566'),
      )
    })

    it("returns the run's error", async () => {
      const failure = new Error("dealer down")
      mockRunFeeJob.mockResolvedValue(failure)

      expect(await run(parse(["fee", "--as-of", today]))).toBe(failure)
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/\.summary\.json$/),
        expect.stringContaining('"error": "dealer down"'),
      )
    })

    // a per-wallet failure or an invariant breach never aborts the run: the exit code is the
    // only thing an automated caller sees
    it("fails the run when any row ended in error, after writing the report", async () => {
      mockRunFeeJob.mockResolvedValue({
        ...feeResult,
        counts: { ...feeResult.counts, byOutcome: { charged: 1, error: 2 } },
      })

      const result = await run(parse(["fee", "--as-of", today, "--out", "/tmp/fee.csv"]))

      expect(result).toBeInstanceOf(Error)
      expect((result as Error).message).toContain("2 of")
      // the summary and CSV are still the run's own, not an abort stub
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        "/tmp/fee.csv.summary.json",
        expect.stringContaining('"rate": 77566'),
      )
    })

    it("succeeds when no row ended in error", async () => {
      mockRunFeeJob.mockResolvedValue({
        ...feeResult,
        counts: { ...feeResult.counts, byOutcome: { charged: 1, skipped: 3 } },
      })

      expect(await run(parse(["fee", "--as-of", today]))).toBe(true)
    })
  })
})
