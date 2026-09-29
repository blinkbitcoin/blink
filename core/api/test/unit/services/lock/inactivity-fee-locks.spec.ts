const mockUsing = jest.fn()

jest.mock("redlock", () => {
  class ExecutionError extends Error {}
  const Redlock = jest.fn().mockImplementation(() => ({
    using: (...args: unknown[]) => mockUsing(...args),
    acquire: jest.fn(),
  }))
  return { __esModule: true, default: Redlock, ExecutionError }
})

jest.mock("@/services/redis", () => ({ redis: {} }))

jest.mock("@/config", () => ({ NETWORK: "regtest" }))

jest.mock("@/services/tracing", () => ({
  wrapAsyncFunctionsToRunInSpan: ({ fns }: { fns: unknown }) => fns,
}))

import { ExecutionError } from "redlock"

import { InactivityFeeRunKind } from "@/domain/inactivity-fee"
import {
  ResourceAttemptsRedlockServiceError,
  ResourceExpiredLockServiceError,
  UnknownLockServiceError,
} from "@/domain/lock"
import { LockService, redlock } from "@/services/lock"

const accountId = "1c2b5a6e-1a2b-4c3d-8e9f-0a1b2c3d4e5f" as AccountId
const walletId = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d" as WalletId
const signal = { aborted: false }

// both overloads: (resources, ttl, routine) and (resources, ttl, settings, routine)
const runRoutine = async (...args: unknown[]) => {
  const routine = args[args.length - 1] as (s: unknown) => Promise<unknown>
  return routine(signal)
}

beforeEach(() => {
  mockUsing.mockReset()
  mockUsing.mockImplementation(runRoutine)
})

describe("redlock settings pass-through", () => {
  it("keeps the client's default policy when no settings are given", async () => {
    const result = await LockService().lockWalletId(walletId, async () => "done")

    expect(result).toBe("done")
    expect(mockUsing).toHaveBeenCalledWith(
      [`locks:wallet:${walletId}`],
      expect.any(Number),
      expect.any(Function),
    )
  })

  it("hands per-call settings to the client", async () => {
    const settings = { retryCount: 5, retryDelay: 250, retryJitter: 50 }

    await redlock({ path: "locks:test", asyncFn: async () => true, settings })

    expect(mockUsing).toHaveBeenCalledWith(
      ["locks:test"],
      expect.any(Number),
      settings,
      expect.any(Function),
    )
  })

  it("runs under a caller's signal without locking again", async () => {
    const held = { aborted: false } as RedlockAbortSignal

    const result = await redlock({
      path: "locks:test",
      signal: held,
      asyncFn: async (s) => s === held,
      settings: { retryCount: 0 },
    })

    expect(result).toBe(true)
    expect(mockUsing).not.toHaveBeenCalled()
  })

  it("refuses a caller's signal that is already aborted", async () => {
    const lost = { aborted: true, error: new Error("expired") } as RedlockAbortSignal

    const result = await redlock({
      path: "locks:test",
      signal: lost,
      asyncFn: async () => true,
    })

    expect(result).toBeInstanceOf(ResourceExpiredLockServiceError)
  })
})

describe("lockInactivityFeeAccount", () => {
  it("locks locks:inactivityfee:account:<id> with the default policy", async () => {
    const result = await LockService().lockInactivityFeeAccount(accountId, async (s) => s)

    expect(result).toBe(signal)
    expect(mockUsing).toHaveBeenCalledWith(
      [`locks:inactivityfee:account:${accountId}`],
      expect.any(Number),
      expect.any(Function),
    )
  })

  it("passes a bounded wait through", async () => {
    const settings = { retryCount: 5, retryDelay: 250, retryJitter: 50 }

    await LockService().lockInactivityFeeAccount(accountId, async () => true, settings)

    expect(mockUsing).toHaveBeenCalledWith(
      [`locks:inactivityfee:account:${accountId}`],
      expect.any(Number),
      settings,
      expect.any(Function),
    )
  })

  it("maps an exhausted wait to ResourceAttemptsRedlockServiceError", async () => {
    mockUsing.mockRejectedValue(new ExecutionError("quorum", []))

    const result = await LockService().lockInactivityFeeAccount(
      accountId,
      async () => true,
      {
        retryCount: 0,
      },
    )

    expect(result).toBeInstanceOf(ResourceAttemptsRedlockServiceError)
  })

  it("maps anything else to UnknownLockServiceError", async () => {
    mockUsing.mockRejectedValue(new Error("redis down"))

    const result = await LockService().lockInactivityFeeAccount(
      accountId,
      async () => true,
    )

    expect(result).toBeInstanceOf(UnknownLockServiceError)
  })
})

describe("lockInactivityFeeRun", () => {
  it("locks locks:inactivityfee:run:<kind>:<UTC day> with a single attempt", async () => {
    await LockService().lockInactivityFeeRun(
      { kind: InactivityFeeRunKind.Notice, asOf: new Date("2026-10-01T02:00:00Z") },
      async () => true,
    )

    expect(mockUsing).toHaveBeenCalledWith(
      ["locks:inactivityfee:run:notice:2026-10-01"],
      expect.any(Number),
      { retryCount: 0 },
      expect.any(Function),
    )
  })

  it("keys two runs of the same UTC day on the same resource, other days and kinds apart", async () => {
    const lock = (kind: InactivityFeeRunKind, asOf: string) =>
      LockService().lockInactivityFeeRun({ kind, asOf: new Date(asOf) }, async () => true)

    await lock(InactivityFeeRunKind.Notice, "2026-10-01T00:00:01Z")
    await lock(InactivityFeeRunKind.Notice, "2026-10-01T23:59:59Z")
    await lock(InactivityFeeRunKind.Notice, "2026-10-02T00:00:00Z")
    await lock(InactivityFeeRunKind.Fee, "2026-10-01T02:00:00Z")

    expect(mockUsing.mock.calls.map(([resources]) => resources[0])).toEqual([
      "locks:inactivityfee:run:notice:2026-10-01",
      "locks:inactivityfee:run:notice:2026-10-01",
      "locks:inactivityfee:run:notice:2026-10-02",
      "locks:inactivityfee:run:fee:2026-10-01",
    ])
  })

  it("reports a held run lock as ResourceAttemptsRedlockServiceError", async () => {
    mockUsing.mockRejectedValue(new ExecutionError("held", []))

    const result = await LockService().lockInactivityFeeRun(
      { kind: InactivityFeeRunKind.Notice, asOf: new Date("2026-10-01T02:00:00Z") },
      async () => true,
    )

    expect(result).toBeInstanceOf(ResourceAttemptsRedlockServiceError)
  })
})
