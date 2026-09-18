jest.mock("@/config", () => ({
  getInactivityFeeConfig: jest.fn(),
}))

jest.mock("@/services/mongoose", () => ({
  __mocks: {
    recordActivity: jest.fn(),
  },
  AccountsRepository: () => ({
    recordActivity: jest.requireMock("@/services/mongoose").__mocks.recordActivity,
  }),
}))

jest.mock("@/services/tracing", () => ({
  addAttributesToCurrentSpan: jest.fn(),
}))

jest.mock("@/app/inactivity-fee/reactivate-account", () => ({
  reactivateAccount: jest.fn(),
}))

import { readdirSync, readFileSync, statSync } from "fs"
import path from "path"

import { recordActivity } from "@/app/inactivity-fee"
import { reactivateAccount } from "@/app/inactivity-fee/reactivate-account"
import { getInactivityFeeConfig } from "@/config"
import { UnknownRepositoryError } from "@/domain/errors"
import { ActivityKind } from "@/domain/inactivity-fee"
import { toSeconds } from "@/domain/primitives"

const mockGetInactivityFeeConfig = getInactivityFeeConfig as jest.MockedFunction<
  typeof getInactivityFeeConfig
>
const mockReactivateAccount = reactivateAccount as jest.MockedFunction<
  typeof reactivateAccount
>
const { recordActivity: mockRepoRecordActivity } = jest.requireMock("@/services/mongoose")
  .__mocks as { recordActivity: jest.Mock }

const accountId = "1c2b5a6e-1a2b-4c3d-8e9f-0a1b2c3d4e5f" as AccountId
const now = new Date("2026-09-15T12:00:00.000Z")
const refreshIntervalSec = 3600

describe("recordActivity", () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.useFakeTimers().setSystemTime(now)
    mockGetInactivityFeeConfig.mockReturnValue({
      activityRefreshIntervalSec: toSeconds(refreshIntervalSec),
    })
    mockReactivateAccount.mockResolvedValue(true)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe("writer kinds", () => {
    it("login always writes (no age check in the filter)", async () => {
      const previousActivityAt = new Date("2026-09-15T11:50:00.000Z")
      mockRepoRecordActivity.mockResolvedValue({ written: true, previousActivityAt })

      const result = await recordActivity({ accountId, kind: ActivityKind.Login })

      expect(mockRepoRecordActivity).toHaveBeenCalledTimes(1)
      expect(mockRepoRecordActivity).toHaveBeenCalledWith({
        id: accountId,
        now,
        onlyIfOlderThan: undefined,
      })
      expect(result).toEqual({ written: true, previousActivityAt })
    })

    it("session passes the age cutoff (now - activityRefreshIntervalSec) into the filter", async () => {
      mockRepoRecordActivity.mockResolvedValue({
        written: true,
        previousActivityAt: new Date("2026-09-15T10:00:00.000Z"),
      })

      await recordActivity({ accountId, kind: ActivityKind.Session })

      expect(mockRepoRecordActivity).toHaveBeenCalledWith({
        id: accountId,
        now,
        onlyIfOlderThan: new Date(now.getTime() - refreshIntervalSec * 1000),
      })
    })
  })

  describe("refresh interval (session writes)", () => {
    it("reports written: false when the filter did not match (stored value too fresh)", async () => {
      mockRepoRecordActivity.mockResolvedValue({ written: false })

      const result = await recordActivity({ accountId, kind: ActivityKind.Session })

      expect(result).toEqual({ written: false })
      expect(mockReactivateAccount).not.toHaveBeenCalled()
    })

    it("returns the previous value when the stored value was old enough", async () => {
      const previousActivityAt = new Date("2026-09-15T10:00:00.000Z")
      mockRepoRecordActivity.mockResolvedValue({ written: true, previousActivityAt })

      const result = await recordActivity({ accountId, kind: ActivityKind.Session })

      expect(result).toEqual({ written: true, previousActivityAt })
      expect(mockReactivateAccount).not.toHaveBeenCalled()
    })
  })

  describe("known value from the caller", () => {
    it("session skips the repository when the known value is inside the interval", async () => {
      const result = await recordActivity({
        accountId,
        kind: ActivityKind.Session,
        knownLastActivityAt: new Date(now.getTime() - 10 * 60 * 1000),
      })

      expect(result).toEqual({ written: false })
      expect(mockRepoRecordActivity).not.toHaveBeenCalled()
      expect(mockReactivateAccount).not.toHaveBeenCalled()
    })

    it("session skips at exactly the interval boundary, where the update could not match", async () => {
      const result = await recordActivity({
        accountId,
        kind: ActivityKind.Session,
        knownLastActivityAt: new Date(now.getTime() - refreshIntervalSec * 1000),
      })

      expect(result).toEqual({ written: false })
      expect(mockRepoRecordActivity).not.toHaveBeenCalled()
    })

    it("session goes to the repository when the known value is older than the interval", async () => {
      const previous = new Date(now.getTime() - 2 * 60 * 60 * 1000)
      mockRepoRecordActivity.mockResolvedValue({
        written: true,
        previousActivityAt: previous,
      })

      const result = await recordActivity({
        accountId,
        kind: ActivityKind.Session,
        knownLastActivityAt: previous,
      })

      expect(result).toEqual({ written: true, previousActivityAt: previous })
      expect(mockRepoRecordActivity).toHaveBeenCalledTimes(1)
    })

    it("session goes to the repository when the caller knows no value", async () => {
      mockRepoRecordActivity.mockResolvedValue({
        written: true,
        previousActivityAt: undefined,
      })

      await recordActivity({
        accountId,
        kind: ActivityKind.Session,
        knownLastActivityAt: undefined,
      })

      expect(mockRepoRecordActivity).toHaveBeenCalledTimes(1)
    })

    it("login always writes, however fresh the known value is", async () => {
      mockRepoRecordActivity.mockResolvedValue({
        written: true,
        previousActivityAt: new Date(now.getTime() - 1000),
      })

      await recordActivity({
        accountId,
        kind: ActivityKind.Login,
        knownLastActivityAt: new Date(now.getTime() - 1000),
      })

      expect(mockRepoRecordActivity).toHaveBeenCalledTimes(1)
    })
  })

  describe("reactivation trigger", () => {
    it("invokes the hook when the previous value is 13 months old", async () => {
      const previousActivityAt = new Date("2025-08-15T12:00:00.000Z")
      mockRepoRecordActivity.mockResolvedValue({ written: true, previousActivityAt })

      const result = await recordActivity({ accountId, kind: ActivityKind.Login })

      expect(mockReactivateAccount).toHaveBeenCalledTimes(1)
      expect(mockReactivateAccount).toHaveBeenCalledWith({
        accountId,
        previousActivityAt,
      })
      expect(result).toEqual({ written: true, previousActivityAt })
    })

    it("invokes the hook at exactly 12 calendar months", async () => {
      const previousActivityAt = new Date("2025-09-15T12:00:00.000Z")
      mockRepoRecordActivity.mockResolvedValue({ written: true, previousActivityAt })

      await recordActivity({ accountId, kind: ActivityKind.Login })

      expect(mockReactivateAccount).toHaveBeenCalledWith({
        accountId,
        previousActivityAt,
      })
    })

    it("does not invoke the hook when the previous value is 2 months old", async () => {
      mockRepoRecordActivity.mockResolvedValue({
        written: true,
        previousActivityAt: new Date("2026-07-15T12:00:00.000Z"),
      })

      await recordActivity({ accountId, kind: ActivityKind.Login })

      expect(mockReactivateAccount).not.toHaveBeenCalled()
    })

    it("does not invoke the hook when there is no previous value (not backfilled yet)", async () => {
      mockRepoRecordActivity.mockResolvedValue({
        written: true,
        previousActivityAt: undefined,
      })

      const result = await recordActivity({ accountId, kind: ActivityKind.Login })

      expect(result).toEqual({ written: true, previousActivityAt: undefined })
      expect(mockReactivateAccount).not.toHaveBeenCalled()
    })

    it("returns the hook's error", async () => {
      const previousActivityAt = new Date("2025-01-01T00:00:00.000Z")
      mockRepoRecordActivity.mockResolvedValue({ written: true, previousActivityAt })
      const hookError = new UnknownRepositoryError("hook failed")
      mockReactivateAccount.mockResolvedValue(hookError)

      const result = await recordActivity({ accountId, kind: ActivityKind.Login })

      expect(result).toBe(hookError)
    })
  })

  describe("errors", () => {
    it("returns the repository error instead of throwing and skips the hook", async () => {
      const repoError = new UnknownRepositoryError("mongo down")
      mockRepoRecordActivity.mockResolvedValue(repoError)

      const result = await recordActivity({ accountId, kind: ActivityKind.Session })

      expect(result).toBe(repoError)
      expect(mockReactivateAccount).not.toHaveBeenCalled()
    })
  })
})

// Source-level guard rails: the field has exactly one writer and receive paths never touch it.
describe("single writer invariant (source scan)", () => {
  const srcRoot = path.resolve(__dirname, "../../../../src")

  // src/debug holds operator scripts copied in at run time (the backfill lives in blink-wiki)
  const listTsFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = path.join(dir, entry)
      if (full === path.join(srcRoot, "debug")) return []
      if (statSync(full).isDirectory()) return listTsFiles(full)
      return full.endsWith(".ts") ? [full] : []
    })

  const filesContaining = (needle: string | RegExp): string[] =>
    listTsFiles(srcRoot)
      .filter((file) => {
        const content = readFileSync(file, "utf8")
        return typeof needle === "string"
          ? content.includes(needle)
          : needle.test(content)
      })
      .map((file) => path.relative(srcRoot, file))
      .sort()

  it("only the mongoose schema and the accounts repository touch the raw field", () => {
    expect(filesContaining(/\blast_activity_at\b/)).toEqual([
      "services/mongoose/accounts.ts",
      "services/mongoose/schema.ts",
      "services/mongoose/schema.types.d.ts",
    ])
  })

  it("only app/inactivity-fee/record-activity.ts calls the repository writer", () => {
    expect(filesContaining(/AccountsRepository\(\)\s*\.recordActivity\(/)).toEqual([
      "app/inactivity-fee/record-activity.ts",
    ])
  })

  it("has call sites in login and the session middleware only", () => {
    expect(filesContaining(/recordActivity\(\{\s*accountId/)).toEqual([
      "app/authentication/login.ts",
      "servers/middlewares/session.ts",
    ])
  })

  it("receive, payment, fee reimbursement and admin modules never record activity", () => {
    const receiveModules = [
      ...listTsFiles(path.join(srcRoot, "app/payments")),
      ...listTsFiles(path.join(srcRoot, "app/wallets")),
      ...listTsFiles(path.join(srcRoot, "app/admin")),
      ...listTsFiles(path.join(srcRoot, "app/lightning")),
      ...listTsFiles(path.join(srcRoot, "app/on-chain")),
    ]
    const offenders = receiveModules
      .filter((file) => /recordActivity|inactivity-fee/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(srcRoot, file))
    expect(offenders).toEqual([])
  })
})
